import { HouseRules } from '../lib/houseRules';

export interface Player {
  id: string; // Socket ID (or a synthetic bot id for server-side bots)
  name: string;
  seatNumber: number; // 1 to 6
  isHost: boolean;
  secret?: string; // Private per-session token — only present on your own player.
  isBot?: boolean; // Server-side AI player — no socket, no voice, no chat.
}

export interface Spectator {
  id: string;
  name: string;
  secret?: string; // Private per-session token — only present on your own spectator object.
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  spectators?: Spectator[];
  status: 'lobby' | 'playing';
  houseRules?: HouseRules; // present on all rooms; optional for backward compatibility
  visibility?: 'public' | 'private'; // public rooms are discoverable by Quick Play
}
