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
        
        // Add track to all existing peers
        Object.values(peerConnectionsRef.current).forEach(pc => {
          processedStream.getTracks().forEach(track => {
            const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
            if (sender) {
              sender.replaceTrack(track);
            } else {
              pc.addTrack(track, processedStream);
            }
          });
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
      
      // Stop sending track (replace with null)
      Object.values(peerConnectionsRef.current).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === 'audio') {
            sender.replaceTrack(null);
          }
        });
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

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
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

    if (initiator) {
      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        socket?.emit('webrtc-signal', {
          targetId,
          signalData: { type: 'offer', offer: pc.localDescription }
        });
      }).catch(err => console.error("Error creating offer", err));
    }

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

    const handleSignal = async ({ sourceId, signalData }: { sourceId: string; signalData: any }) => {
      let pc = peerConnectionsRef.current[sourceId];
      
      if (!pc && signalData.type === 'offer') {
        pc = createPeerConnection(sourceId, false);
      }

      if (!pc) return;

      try {
        if (signalData.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-signal', {
            targetId: sourceId,
            signalData: { type: 'answer', answer: pc.localDescription }
          });
        } else if (signalData.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
        } else if (signalData.type === 'ice-candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
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
