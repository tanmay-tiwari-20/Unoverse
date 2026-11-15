import { create } from 'zustand';

interface PeerStatus {
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface VoiceParticipant {
  playerId: string;
  seatUid: string;
  isMuted: boolean;
}

/**
 * Local mutes are PERSONAL: they only silence a peer's incoming audio on this
 * client and are never sent to the server or other players. They are keyed by
 * the peer's stable SEAT UID — minted server-side and preserved across that
 * peer's reconnects — so a mute survives their socket id changing.
 *
 * Deliberately NOT the display name: two people at one table may legitimately
 * share a name, and muting one of them must never silence the other.
 */
interface VoiceState {
  participation: 'off' | 'joining' | 'joined';
  voiceRoomCode: string | null;
  participants: VoiceParticipant[];
  maxParticipants: number;
  isMicEnabled: boolean;
  isSpeakerEnabled: boolean;
  peerStatuses: Record<string, PeerStatus>;
  /** Peers this client has personally muted (key: seat uid -> true). */
  locallyMutedPeers: Record<string, true>;

  setMicEnabled: (enabled: boolean) => void;
  setParticipation: (participation: VoiceState['participation']) => void;
  setRoster: (roomCode: string, maxParticipants: number, participants: VoiceParticipant[]) => void;
  setSpeakerEnabled: (enabled: boolean) => void;
  updatePeerStatus: (playerId: string, statusUpdate: Partial<PeerStatus>) => void;
  removePeerStatus: (playerId: string) => void;
  setPeerLocalMute: (seatUid: string, muted: boolean) => void;
  resetVoiceState: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  participation: 'off',
  voiceRoomCode: null,
  participants: [],
  maxParticipants: 4,
  isMicEnabled: false,
  isSpeakerEnabled: true,
  peerStatuses: {},
  locallyMutedPeers: {},

  setMicEnabled: (isMicEnabled) => set({ isMicEnabled }),
  setParticipation: (participation) => set({ participation }),
  setRoster: (voiceRoomCode, maxParticipants, participants) => set((state) => ({
    voiceRoomCode, maxParticipants, participants,
    peerStatuses: Object.fromEntries(participants.map((p) => [p.playerId, {
      isMuted: p.isMuted,
      isSpeaking: state.peerStatuses[p.playerId]?.isSpeaking ?? false,
    }])),
  })),

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

  setPeerLocalMute: (seatUid, muted) => set((state) => {
    const next = { ...state.locallyMutedPeers };
    if (muted) next[seatUid] = true;
    else delete next[seatUid];
    return { locallyMutedPeers: next };
  }),

  resetVoiceState: () => set({
    participation: 'off',
    voiceRoomCode: null,
    participants: [],
    maxParticipants: 4,
    isMicEnabled: false,
    isSpeakerEnabled: true,
    peerStatuses: {},
    locallyMutedPeers: {}
  })
}));
