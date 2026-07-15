/**
 * Centralized player-capacity + active-player helpers.
 *
 * Player vs spectator status and the maximum player count are ALWAYS derived from
 * the authoritative room / house-rule state — never from client-only UI flags.
 * These helpers keep that derivation in one place so the 3D table, the HTML
 * overlays and the lobby roster can never disagree about who is playing or how
 * many seats exist.
 */

import { Room } from '../types/game';
import { HouseRules, DEFAULT_HOUSE_RULES } from '../lib/houseRules';

// Absolute ceiling the client can render, matching the backend RULE_BOUNDS. Used
// only as a defensive clamp — the real capacity comes from house rules.
export const HARD_MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;

/**
 * The maximum number of ACTIVE players the room supports. Sourced from the room's
 * house rules (host-configurable). Falls back to the shared default so a room
 * payload that predates the rule still resolves sensibly. Spectators never count.
 */
export const getMaxPlayers = (
  room: Room | null,
  houseRules?: HouseRules | null
): number => {
  const fromRoom = room?.houseRules?.maxPlayers;
  const fromRules = houseRules?.maxPlayers;
  const raw = fromRoom ?? fromRules ?? DEFAULT_HOUSE_RULES.maxPlayers;
  return Math.min(HARD_MAX_PLAYERS, Math.max(MIN_PLAYERS, raw));
};

/** Number of seated, active players (spectators excluded — they aren't in players[]). */
export const getActivePlayerCount = (room: Room | null): number =>
  room?.players.length ?? 0;

/** Number of spectators currently watching. */
export const getSpectatorCount = (room: Room | null): number =>
  room?.spectators?.length ?? 0;

/** True once every active-player slot is occupied. */
export const isRoomFull = (
  room: Room | null,
  houseRules?: HouseRules | null
): boolean => getActivePlayerCount(room) >= getMaxPlayers(room, houseRules);

/**
 * The seat-count the table layout should be drawn for. Only active players are
 * ever laid out around the table; spectators never affect seating geometry. A
 * floor of MIN_PLAYERS keeps a solo lobby from collapsing to a single seat.
 */
export const getLayoutSeatCount = (room: Room | null): number =>
  Math.max(MIN_PLAYERS, getActivePlayerCount(room));
