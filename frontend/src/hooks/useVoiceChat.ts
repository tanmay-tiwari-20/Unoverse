import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useVoiceStore } from '../store/useVoiceStore';
import { useSettingsStore } from '../store/useSettingsStore';

export const useVoiceChat = () => {
  const { socket, room, player } = useGameStore();
  const { isMicEnabled, isSpeakerEnabled, setMicEnabled, updatePeerStatus, removePeerStatus, resetVoiceState } = useVoiceStore();
  const { voiceVolume, masterVolume, micVolume } = useSettingsStore();

  const localStreamRef = useRef<MediaStream | null>(null);
  const outgoingGainNodeRef = useRef<GainNode | null>(null);
  const peerConnectionsRef = useRef<{ [playerId: string]: RTCPeerConnection }>({});
  // The audio sender for each peer. We create one sendrecv transceiver up front
  // (track-less) so the audio m-line is negotiated in the very first offer/answer.
  // Enabling/disabling the mic then just swaps the track via replaceTrack(), which
  // needs NO renegotiation — the previous code relied on addTrack() after connect,
  // which requires renegotiation that was never performed, so audio never flowed.
  const audioSendersRef = useRef<{ [playerId: string]: RTCRtpSender }>({});
  // ICE candidates that arrive before the remote description is set must be queued,
  // otherwise addIceCandidate() throws and the candidate is lost (flaky connects).
  const pendingCandidatesRef = useRef<{ [playerId: string]: RTCIceCandidateInit[] }>({});
  const audioElementsRef = useRef<{ [playerId: string]: HTMLAudioElement }>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<{ [playerId: string]: { analyser: AnalyserNode, dataArray: Uint8Array, interval: any } }>({});

  // Initialize AudioContext on first user interaction or when needed
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const cleanupPeer = useCallback((playerId: string) => {
    if (peerConnectionsRef.current[playerId]) {
      peerConnectionsRef.current[playerId].close();
      delete peerConnectionsRef.current[playerId];
    }
    delete audioSendersRef.current[playerId];
    delete pendingCandidatesRef.current[playerId];
    if (audioElementsRef.current[playerId]) {
      audioElementsRef.current[playerId].pause();
      audioElementsRef.current[playerId].srcObject = null;
      delete audioElementsRef.current[playerId];
    }
    if (analysersRef.current[playerId]) {
      clearInterval(analysersRef.current[playerId].interval);
      delete analysersRef.current[playerId];
    }
    removePeerStatus(playerId);
  }, [removePeerStatus]);

  const toggleMic = useCallback(async () => {
    if (!isMicEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true 
          } 
        });

        // Setup outgoing gain node
        const ctx = getAudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const destination = ctx.createMediaStreamDestination();
        const gainNode = ctx.createGain();
        gainNode.gain.value = micVolume / 100;
        source.connect(gainNode);
        gainNode.connect(destination);
        
        outgoingGainNodeRef.current = gainNode;
        const processedStream = destination.stream;
        localStreamRef.current = processedStream;

        // Store original tracks so we can stop hardware access later
        (processedStream as any).originalTracks = stream.getTracks();
        
        setMicEnabled(true);

        // Push the live mic track onto every peer's pre-created audio sender. This
        // uses replaceTrack (no renegotiation required) since the sendrecv
        // transceiver was already negotiated when the connection was built.
        const micTrack = processedStream.getAudioTracks()[0] || null;
        Object.values(audioSendersRef.current).forEach(sender => {
          sender.replaceTrack(micTrack).catch(err => console.error('replaceTrack (enable) failed', err));
        });

        // Broadcast mic status change
        socket?.emit('voice-status', { isMuted: false });

      } catch (err) {
        console.error('Failed to get microphone permissions', err);
        const { addToast } = useGameStore.getState();
        addToast('Microphone access denied', 'error');
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        if ((localStreamRef.current as any).originalTracks) {
          (localStreamRef.current as any).originalTracks.forEach((track: MediaStreamTrack) => track.stop());
        }
        localStreamRef.current = null;
      }
      if (outgoingGainNodeRef.current) {
        outgoingGainNodeRef.current.disconnect();
        outgoingGainNodeRef.current = null;
      }
      setMicEnabled(false);

      // Stop sending audio by clearing the track on each sender (keeps the
      // transceiver/connection alive so re-enabling is instant, no renegotiation).
      Object.values(audioSendersRef.current).forEach(sender => {
        sender.replaceTrack(null).catch(err => console.error('replaceTrack (disable) failed', err));
      });

      // Broadcast mic status change
      socket?.emit('voice-status', { isMuted: true });
    }
  }, [isMicEnabled, setMicEnabled, socket]);

  const createPeerConnection = useCallback((targetId: string, initiator: boolean) => {
    if (peerConnectionsRef.current[targetId]) {
      console.warn(`PeerConnection for ${targetId} already exists. Removing old one.`);
      cleanupPeer(targetId);
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
      ]
    });
    peerConnectionsRef.current[targetId] = pc;
    pendingCandidatesRef.current[targetId] = [];

    // Always negotiate a bidirectional audio channel up front, even if the mic is
    // currently off. The sender starts track-less; toggleMic later swaps the live
    // track in via replaceTrack() WITHOUT renegotiation. This is the core fix:
    // adding a track after the connection is established would require a fresh
    // offer/answer that the previous implementation never performed.
    const micTrack = localStreamRef.current?.getAudioTracks()[0] || null;
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    audioSendersRef.current[targetId] = transceiver.sender;
    if (micTrack) {
      transceiver.sender.replaceTrack(micTrack).catch(err => console.error('initial replaceTrack failed', err));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('webrtc-signal', {
          targetId,
          signalData: { type: 'ice-candidate', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!audioElementsRef.current[targetId]) {
        const audioEl = new Audio();
        audioEl.autoplay = true;
        audioElementsRef.current[targetId] = audioEl;
      }
      audioElementsRef.current[targetId].srcObject = stream;
      audioElementsRef.current[targetId].muted = !useVoiceStore.getState().isSpeakerEnabled;
      
      const vVol = useSettingsStore.getState().voiceVolume / 100;
      const mVol = useSettingsStore.getState().masterVolume / 100;
      audioElementsRef.current[targetId].volume = vVol * mVol;
      
      // Setup Voice Activity Detection for this remote stream
      setupVAD(targetId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(targetId);
      }
    };

    // Safety net: if anything ever does trigger renegotiation (e.g. a future
    // track change), the initiator re-offers instead of silently stalling.
    pc.onnegotiationneeded = async () => {
      if (!initiator) return; // only the designated initiator drives renegotiation
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc-signal', {
          targetId,
          signalData: { type: 'offer', offer: pc.localDescription }
        });
      } catch (err) {
        console.error('onnegotiationneeded offer failed', err);
      }
    };

    // Note: we do NOT manually createOffer here. Adding the transceiver above
    // triggers onnegotiationneeded on the initiator, which sends exactly one
    // initial offer. Driving it from both places would cause offer glare.

    return pc;
  }, [socket, cleanupPeer]);

  const setupVAD = (playerId: string, stream: MediaStream) => {
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
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Threshold for speaking
        const isSpeaking = average > 10;
        
        const currentStatus = useVoiceStore.getState().peerStatuses[playerId];
        if (!currentStatus || currentStatus.isSpeaking !== isSpeaking) {
          updatePeerStatus(playerId, { isSpeaking });
        }
      }, 100);

      analysersRef.current[playerId] = { analyser, dataArray, interval };
    } catch (e) {
      console.error("VAD setup failed", e);
    }
  };

  // Handle speaker toggle and volumes
  useEffect(() => {
    Object.values(audioElementsRef.current).forEach(audioEl => {
      audioEl.muted = !isSpeakerEnabled;
      audioEl.volume = (voiceVolume / 100) * (masterVolume / 100);
    });
  }, [isSpeakerEnabled, voiceVolume, masterVolume]);

  // Handle outgoing mic volume
  useEffect(() => {
    if (outgoingGainNodeRef.current) {
      outgoingGainNodeRef.current.gain.value = micVolume / 100;
    }
  }, [micVolume]);

  // Handle incoming signaling
  useEffect(() => {
    if (!socket) return;

    const flushPendingCandidates = async (peerId: string, pc: RTCPeerConnection) => {
      const queued = pendingCandidatesRef.current[peerId];
      if (!queued || queued.length === 0) return;
      for (const cand of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.error('Failed to apply queued ICE candidate', err);
        }
      }
      pendingCandidatesRef.current[peerId] = [];
    };

    const handleSignal = async ({ sourceId, signalData }: { sourceId: string; signalData: any }) => {
      let pc = peerConnectionsRef.current[sourceId];
      
      if (!pc && signalData.type === 'offer') {
        pc = createPeerConnection(sourceId, false);
      }

      if (!pc) return;

      try {
        if (signalData.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
          await flushPendingCandidates(sourceId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-signal', {
            targetId: sourceId,
            signalData: { type: 'answer', answer: pc.localDescription }
          });
        } else if (signalData.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
          await flushPendingCandidates(sourceId, pc);
        } else if (signalData.type === 'ice-candidate') {
          // Buffer candidates that arrive before the remote description exists;
          // applying them too early throws and drops the candidate.
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } else {
            (pendingCandidatesRef.current[sourceId] ||= []).push(signalData.candidate);
          }
        }
      } catch (err) {
        console.error("Error handling signal data", err);
      }
    };

    const handleVoiceStatus = ({ playerId, isMuted }: { playerId: string; isMuted: boolean }) => {
      updatePeerStatus(playerId, { isMuted });
    };

    const handlePlayerJoined = (newPlayer: any) => {
      if (newPlayer && newPlayer.id) {
        // Initiator: the person already in the room initiates connection to the newcomer
        if (player && newPlayer.id !== player.id) {
          createPeerConnection(newPlayer.id, true);
        }
      }
    };

    const handlePlayerLeft = (leftPlayer: any) => {
      if (leftPlayer && leftPlayer.id) {
        cleanupPeer(leftPlayer.id);
      }
    };

    socket.on('webrtc-signal', handleSignal);
    socket.on('voice-status-changed', handleVoiceStatus);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);

    return () => {
      socket.off('webrtc-signal', handleSignal);
      socket.off('voice-status-changed', handleVoiceStatus);
      socket.off('player-joined', handlePlayerJoined);
      socket.off('player-left', handlePlayerLeft);
    };
  }, [socket, player, createPeerConnection, cleanupPeer, updatePeerStatus]);

  // Connect to existing players on initial join
  useEffect(() => {
    if (room && player) {
      room.players.forEach(p => {
        if (p.id !== player.id && !peerConnectionsRef.current[p.id]) {
          // When joining, we are the newcomer, let the others initiate.
          // But just in case, we can ensure the state is clear.
          updatePeerStatus(p.id, { isMuted: true, isSpeaking: false });
        }
      });
    }
  }, [room, player, updatePeerStatus]);

  // Clean up entirely on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        if ((localStreamRef.current as any).originalTracks) {
          (localStreamRef.current as any).originalTracks.forEach((track: MediaStreamTrack) => track.stop());
        }
      }
      if (outgoingGainNodeRef.current) {
        outgoingGainNodeRef.current.disconnect();
      }
      Object.keys(peerConnectionsRef.current).forEach(cleanupPeer);
      resetVoiceState();
    };
  }, [cleanupPeer, resetVoiceState]);

  return {
    toggleMic
  };
};
