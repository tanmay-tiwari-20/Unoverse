import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useVoiceStore } from '../store/useVoiceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getIceServers } from '../lib/voice/iceServers';
import { logger } from '../utils/logger';
import {
  isPlatformAudioMuted,
  subscribeToPlatformAudioGate,
} from '../lib/platform/platformAdaptersState';

/**
 * Mesh WebRTC voice chat signaled over the game's Socket.IO connection.
 *
 * Invariants the whole design rests on:
 *
 * 1. OFFERER RULE — for any pair of peers, the one with the lexicographically
 *    LOWER socket id builds the connection and sends the offer. Both sides can
 *    derive this independently from the room roster, so exactly one side ever
 *    offers: no glare, no duplicate connections.
 *
 * 2. FRESH-PC OFFERS — an offer is only ever produced by a freshly-built
 *    RTCPeerConnection (initial connect or failure recovery). The receiving
 *    side therefore always tears down whatever it had for that peer and
 *    answers with a fresh connection too. This sidesteps every cross-PC
 *    renegotiation edge case (refresh, reconnect, ICE failure).
 *
 * 3. NO RENEGOTIATION FOR MIC TOGGLES — the audio m-line is negotiated up
 *    front with a track-less sendrecv transceiver. Enabling/disabling the mic
 *    is replaceTrack() only, which never requires a new offer/answer.
 *
 * 4. ROSTER-DRIVEN LIFECYCLE — the room roster (players + spectators) is the
 *    single source of truth. Ids that appear get a connection; ids that vanish
 *    get cleaned up. A periodic health check plus a 'request-offer' nudge from
 *    the answerer side makes the mesh self-healing even if a signal is lost.
 */

const DISCONNECT_RECOVERY_MS = 10_000; // 'disconnected' often self-heals; wait before rebuilding
const OFFER_GRACE_MS = 5_000; // ignore re-offer requests for connections this young
const REQUEST_DEBOUNCE_MS = 8_000; // min gap between 'request-offer' nudges per peer
const HEALTH_CHECK_MS = 10_000;

/** Wire format relayed verbatim by the backend's 'webrtc-signal' event. */
type SignalData =
  | { type: 'offer'; offer: RTCSessionDescriptionInit }
  | { type: 'answer'; answer: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'request-offer' };

interface SignalPayload {
  sourceId: string;
  signalData: SignalData;
}

// Resolve a peer's stable seat uid from the live roster (players + spectators).
// Personal mutes are keyed by that uid rather than the socket id, so they survive
// the peer reconnecting — and rather than the display name, which two people at
// the table may share.
const peerSeatUid = (peerId: string): string | null => {
  const r = useGameStore.getState().room;
  if (!r) return null;
  return (
    r.players.find((p) => p.id === peerId)?.uid ??
    r.spectators?.find((s) => s.id === peerId)?.uid ??
    null
  );
};

interface PeerEntry {
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  pending: RTCIceCandidateInit[];
  makingOffer: boolean;
  createdAt: number;
  audioEl: HTMLAudioElement | null;
  vad: {
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    interval: ReturnType<typeof setInterval>;
  } | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export const useVoiceChat = () => {
  const socket = useGameStore((state) => state.socket);
  const room = useGameStore((state) => state.room);

  const peersRef = useRef<Record<string, PeerEntry>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawMicStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outgoingGainNodeRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastOfferRequestRef = useRef<Record<string, number>>({});
  // Set by the main signaling effect so the roster/unmount effects can reach
  // the current closure without re-running the whole signaling setup.
  const rosterSyncRef = useRef<(() => void) | null>(null);
  const teardownAllRef = useRef<(() => void) | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      const Ctor = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new Ctor!();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  };

  // Apply the speaker toggle + this client's personal mute + volume to ONE peer's
  // audio element. Strictly output-side: it never touches the RTCPeerConnection,
  // its transceivers or tracks, so toggling a mute can never disturb the mesh.
  const applyAudioOutput = useCallback((peerId: string, entry: { audioEl: HTMLAudioElement | null }) => {
    if (!entry.audioEl) return;
    const { isSpeakerEnabled, locallyMutedPeers } = useVoiceStore.getState();
    const key = peerSeatUid(peerId);
    const personallyMuted = !!(key && locallyMutedPeers[key]);
    // Voice does not pass through soundManager, so the platform gate has to be
    // applied again here — otherwise teammates would stay audible over an ad or
    // through a platform-level mute. Same gate, second output path.
    entry.audioEl.muted = !isSpeakerEnabled || personallyMuted || isPlatformAudioMuted();
    const settings = useSettingsStore.getState();
    entry.audioEl.volume = (settings.voiceVolume / 100) * (settings.masterVolume / 100);
  }, []);

  // Release the microphone hardware and stop feeding peers. Safe to call twice.
  const disableMic = useCallback(() => {
    Object.values(peersRef.current).forEach((entry) => {
      entry.sender?.replaceTrack(null).catch((err) => logger.debug('[VOICE] replaceTrack(null) failed', err));
    });
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    rawMicStreamRef.current?.getTracks().forEach((t) => t.stop());
    micSourceRef.current?.disconnect();
    outgoingGainNodeRef.current?.disconnect();
    localStreamRef.current = null;
    rawMicStreamRef.current = null;
    micSourceRef.current = null;
    outgoingGainNodeRef.current = null;
    useVoiceStore.getState().setMicEnabled(false);
  }, []);

  const toggleMic = useCallback(async () => {
    const sock = useGameStore.getState().socket;

    if (useVoiceStore.getState().isMicEnabled) {
      disableMic();
      sock?.emit('voice-status', { isMuted: true });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      // getUserMedia only exists in secure contexts (https or localhost).
      useGameStore.getState().addToast('Voice chat requires HTTPS (or localhost)', 'error');
      return;
    }

    try {
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Route the mic through a gain node so mic volume is adjustable live.
      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(raw);
      const gain = ctx.createGain();
      gain.gain.value = useSettingsStore.getState().micVolume / 100;
      const destination = ctx.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(destination);

      rawMicStreamRef.current = raw;
      micSourceRef.current = source;
      outgoingGainNodeRef.current = gain;
      localStreamRef.current = destination.stream;
      useVoiceStore.getState().setMicEnabled(true);

      const micTrack = destination.stream.getAudioTracks()[0] ?? null;
      Object.values(peersRef.current).forEach((entry) => {
        entry.sender?.replaceTrack(micTrack).catch((err) => logger.debug('[VOICE] replaceTrack(mic) failed', err));
      });

      sock?.emit('voice-status', { isMuted: false });
    } catch (err) {
      logger.error('[VOICE] Failed to get microphone', err);
      useGameStore.getState().addToast('Microphone access denied', 'error');
    }
  }, [disableMic]);

  // ---------------------------------------------------------------------------
  // Signaling + connection lifecycle. One effect owns the whole peer map so the
  // mutually-recursive helpers (createPeer <-> recoverPeer) share one closure.
  // Helpers only read live state (refs / getState), never captured props.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const myId = () => socket.id ?? '';
    const amOfferer = (peerId: string) => myId() !== '' && myId() < peerId;

    const rosterIds = (): Set<string> => {
      const ids = new Set<string>();
      const r = useGameStore.getState().room;
      const me = myId();
      if (!r || !me) return ids;
      // Bots have no socket and never join voice — building a peer connection
      // toward one would signal into the void forever.
      r.players.forEach((p) => { if (p.id !== me && !p.isBot) ids.add(p.id); });
      r.spectators?.forEach((s) => { if (s.id !== me) ids.add(s.id); });
      return ids;
    };

    const emitSignal = (targetId: string, signalData: SignalData) => {
      socket.emit('webrtc-signal', { targetId, signalData });
    };

    const cleanupPeer = (peerId: string) => {
      const entry = peersRef.current[peerId];
      if (!entry) return;
      delete peersRef.current[peerId];
      if (entry.disconnectTimer) clearTimeout(entry.disconnectTimer);
      if (entry.vad) {
        clearInterval(entry.vad.interval);
        try {
          entry.vad.source.disconnect();
          entry.vad.analyser.disconnect();
        } catch { /* context may already be closed */ }
      }
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.onnegotiationneeded = null;
      try { entry.pc.close(); } catch { /* already closed */ }
      if (entry.audioEl) {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        entry.audioEl = null;
      }
      useVoiceStore.getState().removePeerStatus(peerId);
    };

    const teardownAll = () => {
      Object.keys(peersRef.current).forEach(cleanupPeer);
    };

    const setupVAD = (peerId: string, entry: PeerEntry, stream: MediaStream) => {
      try {
        const ctx = getAudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const interval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const isSpeaking = sum / dataArray.length > 10;
          const current = useVoiceStore.getState().peerStatuses[peerId];
          if (!current || current.isSpeaking !== isSpeaking) {
            useVoiceStore.getState().updatePeerStatus(peerId, { isSpeaking });
          }
        }, 100);

        // Replace any previous VAD graph (ontrack can re-fire for a peer).
        if (entry.vad) {
          clearInterval(entry.vad.interval);
          try { entry.vad.source.disconnect(); entry.vad.analyser.disconnect(); } catch { /* noop */ }
        }
        entry.vad = { source, analyser, interval };
      } catch (e) {
        logger.error('[VOICE] VAD setup failed', e);
      }
    };

    const attachAudio = (peerId: string, entry: PeerEntry, stream: MediaStream) => {
      if (!entry.audioEl) {
        const el = new Audio();
        el.autoplay = true;
        (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        entry.audioEl = el;
      }
      entry.audioEl.srcObject = stream;
      applyAudioOutput(peerId, entry);
      // Autoplay can be blocked before the user interacts with the page; the
      // gesture listener below retries every element on the next interaction.
      entry.audioEl.play().catch(() => logger.debug('[VOICE] autoplay blocked; will retry on user gesture'));
      setupVAD(peerId, entry, stream);
    };

    const requestOffer = (peerId: string, force = false) => {
      const now = Date.now();
      const last = lastOfferRequestRef.current[peerId] ?? 0;
      if (!force && now - last < REQUEST_DEBOUNCE_MS) return;
      lastOfferRequestRef.current[peerId] = now;
      emitSignal(peerId, { type: 'request-offer' });
    };

    const createPeer = (peerId: string, offerer: boolean): PeerEntry => {
      cleanupPeer(peerId);

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      const entry: PeerEntry = {
        pc,
        sender: null,
        pending: [],
        makingOffer: false,
        createdAt: Date.now(),
        audioEl: null,
        vad: null,
        disconnectTimer: null,
      };
      peersRef.current[peerId] = entry;

      if (offerer) {
        // Track-less sendrecv transceiver: the audio m-line is in the very first
        // offer, and mic toggles later are replaceTrack() with no renegotiation.
        const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
        entry.sender = transceiver.sender;
        const micTrack = localStreamRef.current?.getAudioTracks()[0];
        if (micTrack) {
          transceiver.sender.replaceTrack(micTrack).catch((err) => logger.debug('[VOICE] initial replaceTrack failed', err));
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          emitSignal(peerId, { type: 'ice-candidate', candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        // A track-less offer carries no stream id, so streams[0] can be absent.
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        attachAudio(peerId, entry, stream);
      };

      pc.onnegotiationneeded = async () => {
        // Only the offerer drives negotiation, exactly once per connection.
        if (!offerer || entry.makingOffer) return;
        entry.makingOffer = true;
        try {
          await pc.setLocalDescription(await pc.createOffer());
          emitSignal(peerId, { type: 'offer', offer: pc.localDescription! });
        } catch (err) {
          logger.error('[VOICE] offer failed', err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        logger.debug(`[VOICE] ${peerId} connection: ${state}`);
        if (state === 'connected') {
          if (entry.disconnectTimer) {
            clearTimeout(entry.disconnectTimer);
            entry.disconnectTimer = null;
          }
          // Let the newly-connected peer know our current mute state — statuses
          // are otherwise only broadcast on change, which newcomers would miss.
          socket.emit('voice-status', { isMuted: !useVoiceStore.getState().isMicEnabled });
        } else if (state === 'failed') {
          recoverPeer(peerId);
        } else if (state === 'disconnected') {
          // 'disconnected' frequently self-heals — only rebuild if it persists.
          entry.disconnectTimer ??= setTimeout(() => {
            entry.disconnectTimer = null;
            if (pc.connectionState === 'disconnected') recoverPeer(peerId);
          }, DISCONNECT_RECOVERY_MS);
        }
      };

      return entry;
    };

    const recoverPeer = (peerId: string) => {
      cleanupPeer(peerId);
      if (!socket.connected || !rosterIds().has(peerId)) return;
      if (amOfferer(peerId)) {
        createPeer(peerId, true);
      } else {
        // Answerer side can't offer; nudge the offerer to rebuild. `force`
        // bypasses the debounce because this is a confirmed failure.
        requestOffer(peerId, true);
      }
    };

    const flushPending = async (entry: PeerEntry) => {
      const queued = entry.pending;
      entry.pending = [];
      for (const candidate of queued) {
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          logger.debug('[VOICE] queued ICE candidate failed', err);
        }
      }
    };

    const handleSignal = async ({ sourceId, signalData }: SignalPayload) => {
      if (!sourceId || !signalData?.type || sourceId === myId()) return;
      if (!rosterIds().has(sourceId)) return; // ignore signals from outside the room

      try {
        if (signalData.type === 'offer') {
          // Offers only ever come from a freshly-built connection on the other
          // side (invariant #2), so always answer with a fresh one of our own.
          const entry = createPeer(sourceId, false);
          await entry.pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
          // Reuse the transceiver the remote offer created — do NOT add our
          // own, which would never be associated with the negotiated m-line
          // and would leave our audio unsent (classic one-way-audio bug).
          const transceiver =
            entry.pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio') ??
            entry.pc.getTransceivers()[0];
          if (transceiver) {
            transceiver.direction = 'sendrecv';
            entry.sender = transceiver.sender;
            const micTrack = localStreamRef.current?.getAudioTracks()[0];
            if (micTrack) await transceiver.sender.replaceTrack(micTrack);
          }
          await flushPending(entry);
          await entry.pc.setLocalDescription(await entry.pc.createAnswer());
          emitSignal(sourceId, { type: 'answer', answer: entry.pc.localDescription! });
        } else if (signalData.type === 'answer') {
          const entry = peersRef.current[sourceId];
          if (!entry || entry.pc.signalingState !== 'have-local-offer') return; // stale answer
          await entry.pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
          await flushPending(entry);
        } else if (signalData.type === 'ice-candidate') {
          const entry = peersRef.current[sourceId];
          if (!entry) return;
          if (entry.pc.remoteDescription) {
            await entry.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } else {
            // Candidates that outrun the SDP must be queued, not dropped.
            entry.pending.push(signalData.candidate);
          }
        } else if (signalData.type === 'request-offer') {
          // The answerer lost its side; rebuild ours and re-offer — unless the
          // current connection is brand new (their request probably crossed our
          // in-flight offer on the wire).
          if (!amOfferer(sourceId)) return;
          const entry = peersRef.current[sourceId];
          if (entry && Date.now() - entry.createdAt < OFFER_GRACE_MS) return;
          createPeer(sourceId, true);
        }
      } catch (err) {
        logger.error('[VOICE] signal handling failed', err);
      }
    };

    const rosterSync = () => {
      const me = myId();
      if (!me || !socket.connected) return;
      const ids = rosterIds();

      // Prune connections and statuses for peers no longer in the room.
      Object.keys(peersRef.current).forEach((id) => {
        if (!ids.has(id)) cleanupPeer(id);
      });
      Object.keys(useVoiceStore.getState().peerStatuses).forEach((id) => {
        if (!ids.has(id)) useVoiceStore.getState().removePeerStatus(id);
      });

      // Prune personal mutes for participants who left the room entirely (seat
      // uid no longer in the roster). A peer merely reconnecting keeps their seat,
      // so their mute survives; a later joiner gets a fresh uid and therefore
      // starts unmuted even if they happen to pick the same name.
      const r = useGameStore.getState().room;
      if (r) {
        const seatUids = new Set<string>([
          ...r.players.map((p) => p.uid),
          ...(r.spectators ?? []).map((s) => s.uid),
        ]);
        Object.keys(useVoiceStore.getState().locallyMutedPeers).forEach((key) => {
          if (!seatUids.has(key)) useVoiceStore.getState().setPeerLocalMute(key, false);
        });
      }

      // Build missing connections (offerer) or nudge the offerer (answerer —
      // covers a lost offer; debounced so normal setup isn't disturbed).
      ids.forEach((id) => {
        if (!useVoiceStore.getState().peerStatuses[id]) {
          useVoiceStore.getState().updatePeerStatus(id, { isMuted: true, isSpeaking: false });
        }
        if (peersRef.current[id]) return;
        if (amOfferer(id)) {
          createPeer(id, true);
        } else {
          requestOffer(id);
        }
      });

      // Re-assert output state (speaker + personal mutes) on every sync so a
      // reconnecting peer whose socket id changed picks their mute back up.
      Object.entries(peersRef.current).forEach(([id, entry]) => applyAudioOutput(id, entry));
    };

    const onSignal = (payload: SignalPayload) => { void handleSignal(payload); };
    const onVoiceStatus = ({ playerId, isMuted }: { playerId: string; isMuted: boolean }) => {
      useVoiceStore.getState().updatePeerStatus(playerId, { isMuted });
    };
    // Peer connections are bound to our socket identity: after a reconnect our
    // socket id changes and every peer rebuilds toward the new id, so tear the
    // old mesh down immediately instead of waiting for ICE timeouts. The mic
    // stays live so it re-attaches to the rebuilt connections.
    const onDisconnect = () => teardownAll();
    const onConnect = () => rosterSync();

    socket.on('webrtc-signal', onSignal);
    socket.on('voice-status-changed', onVoiceStatus);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    rosterSyncRef.current = rosterSync;
    teardownAllRef.current = teardownAll;
    rosterSync();
    const healthCheck = setInterval(rosterSync, HEALTH_CHECK_MS);

    return () => {
      clearInterval(healthCheck);
      socket.off('webrtc-signal', onSignal);
      socket.off('voice-status-changed', onVoiceStatus);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      rosterSyncRef.current = null;
      teardownAllRef.current = null;
      teardownAll();
    };
  }, [socket, applyAudioOutput]);

  // Re-sync the mesh whenever the roster changes (joins, leaves, reconnects,
  // spectators). Leaving the room entirely releases the microphone too.
  useEffect(() => {
    if (room) {
      rosterSyncRef.current?.();
    } else {
      teardownAllRef.current?.();
      if (useVoiceStore.getState().isMicEnabled) disableMic();
    }
  }, [room, disableMic]);

  // Autoplay/AudioContext unlock: browsers may block playback until the user
  // interacts with the page. Retry everything on any gesture.
  useEffect(() => {
    const unlock = () => {
      audioContextRef.current?.resume().catch(() => {});
      Object.values(peersRef.current).forEach((entry) => {
        entry.audioEl?.play().catch(() => {});
      });
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // Speaker toggle, incoming volume and personal per-peer mutes apply to every
  // live audio element. Output-side only — WebRTC connections are untouched, so
  // muting someone never renegotiates or drops the mesh.
  const isSpeakerEnabled = useVoiceStore((state) => state.isSpeakerEnabled);
  const locallyMutedPeers = useVoiceStore((state) => state.locallyMutedPeers);
  const voiceVolume = useSettingsStore((state) => state.voiceVolume);
  const masterVolume = useSettingsStore((state) => state.masterVolume);
  const reapplyAllAudioOutput = useCallback(() => {
    Object.entries(peersRef.current).forEach(([peerId, entry]) => {
      applyAudioOutput(peerId, entry);
    });
  }, [applyAudioOutput]);

  useEffect(() => {
    reapplyAllAudioOutput();
  }, [isSpeakerEnabled, locallyMutedPeers, voiceVolume, masterVolume, reapplyAllAudioOutput]);

  // The platform gate needs its own subscription: an <audio> element stays
  // muted until something tells it otherwise, unlike soundManager which
  // re-reads the gate on every play(). Without this, voice would go quiet for an
  // ad and never come back.
  useEffect(
    () => subscribeToPlatformAudioGate(reapplyAllAudioOutput),
    [reapplyAllAudioOutput],
  );

  // Outgoing mic volume.
  const micVolume = useSettingsStore((state) => state.micVolume);
  useEffect(() => {
    if (outgoingGainNodeRef.current) {
      outgoingGainNodeRef.current.gain.value = micVolume / 100;
    }
  }, [micVolume]);

  // Full teardown on unmount (leaving the lobby page / switching rooms).
  useEffect(() => {
    return () => {
      teardownAllRef.current?.();
      disableMic();
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
      useVoiceStore.getState().resetVoiceState();
    };
  }, [disableMic]);

  return { toggleMic };
};
