import { create } from 'zustand';

interface PeerStatus {
  isMuted: boolean;
  isSpeaking: boolean;
}

interface VoiceState {
  isMicEnabled: boolean;
  isSpeakerEnabled: boolean;
  peerStatuses: Record<string, PeerStatus>;
  
  setMicEnabled: (enabled: boolean) => void;
  setSpeakerEnabled: (enabled: boolean) => void;
  updatePeerStatus: (playerId: string, statusUpdate: Partial<PeerStatus>) => void;
  removePeerStatus: (playerId: string) => void;
  resetVoiceState: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isMicEnabled: false,
  isSpeakerEnabled: true,
  peerStatuses: {},

  setMicEnabled: (isMicEnabled) => set({ isMicEnabled }),
  
  setSpeakerEnabled: (isSpeakerEnabled) => set({ isSpeakerEnabled }),

  updatePeerStatus: (playerId, statusUpdate) => set((state) => {
    const existing = state.peerStatuses[playerId] ?? { isMuted: false, isSpeaking: false };
    return {
      peerStatuses: {
        ...state.peerStatuses,
        [playerId]: { ...existing, ...statusUpdate },
      },
    };
  }),

  removePeerStatus: (playerId) => set((state) => {
    const newStatuses = { ...state.peerStatuses };
    delete newStatuses[playerId];
    return { peerStatuses: newStatuses };
  }),

  resetVoiceState: () => set({
    isMicEnabled: false,
    isSpeakerEnabled: true,
    peerStatuses: {}
  })
}));
