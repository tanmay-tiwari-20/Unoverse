import { HouseRules } from '../lib/houseRules';
import { ArenaId } from '../lib/arenas/types';

export interface Player {
  id: string; // Socket ID (or a synthetic bot id for server-side bots)
  // Stable per-seat handle, minted server-side and kept across reconnects. This
  // is what the scoreboard is keyed by: `id` churns when the socket reconnects,
  // and `name` is a display label two people can share.
  uid: string;
  name: string;
  seatNumber: number; // 1 to 6
  isHost: boolean;
  secret?: string; // Private per-session token — only present on your own player.
  isBot?: boolean; // Server-side AI player — no socket, no voice, no chat.
  // Persistent-profile identity, carried alongside the ephemeral socket id (never
  // replacing it). Broadcast-safe: the permanent Player ID keys server-side stats
  // and every social relationship, while name/tag/avatar are display-only. The
  // profile secret is NEVER sent here.
  profileId?: string;
  tag?: string; // legacy short discriminator (e.g. "5LHL") — display only
  avatar?: string | null; // preset avatar key, or null for the procedural fallback
  outfit?: string | null; // cosmetic outfit (skin) key, or null for default — purely visual
}

export interface Spectator {
  id: string;
  uid: string; // stable per-seat handle, same contract as Player.uid
  name: string;
  secret?: string; // Private per-session token — only present on your own spectator object.
  profileId?: string; // permanent Player ID, when the spectator has a profile
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
