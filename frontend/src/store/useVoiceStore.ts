import { create } from 'zustand';

interface PeerStatus {
  isMuted: boolean;
  isSpeaking: boolean;
}

/**
 * Local mutes are PERSONAL: they only silence a peer's incoming audio on this
 * client and are never sent to the server or other players. They are keyed by
 * LOWERCASED participant name — the same stable identity the backend uses for
 * reconnection — so a mute survives the peer's socket id changing on reconnect.
 */
export const localMuteKey = (name: string): string => name.trim().toLowerCase();

interface VoiceState {
  isMicEnabled: boolean;
  isSpeakerEnabled: boolean;
  peerStatuses: Record<string, PeerStatus>;
  /** Peers this client has personally muted (key: lowercased name -> true). */
  locallyMutedPeers: Record<string, true>;

  setMicEnabled: (enabled: boolean) => void;
  setSpeakerEnabled: (enabled: boolean) => void;
  updatePeerStatus: (playerId: string, statusUpdate: Partial<PeerStatus>) => void;
  removePeerStatus: (playerId: string) => void;
  setPeerLocalMute: (nameKey: string, muted: boolean) => void;
  resetVoiceState: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isMicEnabled: false,
  isSpeakerEnabled: true,
  peerStatuses: {},
  locallyMutedPeers: {},

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

  setPeerLocalMute: (nameKey, muted) => set((state) => {
    const next = { ...state.locallyMutedPeers };
    if (muted) next[nameKey] = true;
    else delete next[nameKey];
    return { locallyMutedPeers: next };
  }),

  resetVoiceState: () => set({
    isMicEnabled: false,
    isSpeakerEnabled: true,
    peerStatuses: {},
    locallyMutedPeers: {}
  })
}));
