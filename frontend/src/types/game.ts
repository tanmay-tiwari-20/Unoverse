import { HouseRules } from '../lib/houseRules';
import { ArenaId } from '../lib/arenas/types';

export interface Player {
  id: string; // Socket ID (or a synthetic bot id for server-side bots)
  name: string;
  seatNumber: number; // 1 to 6
  isHost: boolean;
  secret?: string; // Private per-session token — only present on your own player.
  isBot?: boolean; // Server-side AI player — no socket, no voice, no chat.
  // Persistent-profile identity, carried alongside the ephemeral socket id (never
  // replacing it). Broadcast-safe: the durable profile id keys server-side stats,
  // while tag/avatar are display-only. The profile secret is NEVER sent here.
  profileId?: string;
  tag?: string; // short discriminator (e.g. "5LHL")
  avatar?: string | null; // preset avatar key, or null for the procedural fallback
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
  arena?: ArenaId; // themed 3D world; absent → default (classic). Purely cosmetic.
}
