import type { UnoGameState } from './gameState';
import type { Player } from '../rooms/roomManager';

/**
 * Calculates the index of the next player in the turn order.
 * Works with any number of players (2 to 6) and supports clockwise/counter-clockwise play.
 *
 * @param currentIndex The array index of the current active player (0 to N-1)
 * @param direction The direction of play ('clockwise' | 'counter-clockwise')
 * @param numPlayers The total number of players in the game
 * @param skipCount How many positions to advance (1 for normal turn change, 2 for Skip card)
 */
export const getNextPlayerIndex = (
  currentIndex: number,
  direction: 'clockwise' | 'counter-clockwise',
  numPlayers: number,
  skipCount: number = 1
): number => {
  if (numPlayers <= 0) return 0;

  // In a 2-player game, Skip, Reverse, Draw Two, and Wild Draw Four all result in
  // the other player being skipped, giving the current player another turn immediately.
  if (numPlayers === 2 && skipCount > 1) {
    return currentIndex;
  }

  const delta = direction === 'clockwise' ? skipCount : -skipCount;

  // Safe JavaScript modulo that handles negative results correctly
  return (currentIndex + delta + numPlayers * 10) % numPlayers;
};

/**
 * The single authority for "who becomes active next". Scans seats from
 * `fromSeat` in the game's current direction and returns the id of the player
 * `skipCount` ACTIVE positions ahead (a player is active while they still hold
 * cards). Seat-based rather than index-based so it also works when the
 * reference seat's owner has already been removed from `players` (e.g. the
 * active player just left the room) — turn handoff must never fall back to
 * array position.
 *
 * With 2 remaining active players a skipCount of 2 naturally wraps back to the
 * seat it started from, preserving the two-player Skip/Reverse/Draw behavior.
 * Returns null when no player holds any cards.
 */
export const getNextActivePlayerId = (
  state: Pick<UnoGameState, 'direction' | 'hands'>,
  players: Player[],
  fromSeat: number,
  skipCount: number = 1
): string | null => {
  if (players.length === 0 || skipCount < 1) return null;

  const clockwise = state.direction === 'clockwise';
  const ordered = [...players].sort((a, b) =>
    clockwise ? a.seatNumber - b.seatNumber : b.seatNumber - a.seatNumber
  );
  const isPastFromSeat = (p: Player) =>
    clockwise ? p.seatNumber > fromSeat : p.seatNumber < fromSeat;

  // Rotate the seat ring so scanning starts at the seat right after `fromSeat`
  // in the play direction (the reference seat itself, if still occupied, comes last).
  const ring = [...ordered.filter(isPastFromSeat), ...ordered.filter((p) => !isPastFromSeat(p))];
  const active = ring.filter((p) => (state.hands[p.id]?.length || 0) > 0);
  if (active.length === 0) return null;

  return active[(skipCount - 1) % active.length].id;
};

/**
 * Server-authoritative recovery for a stale `currentPlayerId` (one that no
 * longer maps to any seated player, e.g. after an unclean leave/reconnect).
 * The rightful active player is derived purely from the game state — NEVER from
 * whichever client happened to send an action first:
 *   1. If currentPlayerId is still valid, it is returned unchanged.
 *   2. Otherwise the turn is anchored on the last player who acted (if still
 *      seated) and passes to whoever follows them in the current direction.
 *   3. As a last resort, the lowest-seated player still holding cards is chosen —
 *      a deterministic, server-side decision.
 * Returns null only when no player holds any cards.
 */
export const recoverActivePlayerId = (
  state: Pick<UnoGameState, 'direction' | 'hands' | 'currentPlayerId' | 'lastAction'>,
  players: Player[]
): string | null => {
  if (players.some((p) => p.id === state.currentPlayerId)) {
    return state.currentPlayerId;
  }

  const anchor = state.lastAction
    ? players.find((p) => p.id === state.lastAction!.playerId)
    : undefined;
  if (anchor) {
    const next = getNextActivePlayerId(state, players, anchor.seatNumber);
    if (next) return next;
  }

  const fallback = [...players]
    .sort((a, b) => a.seatNumber - b.seatNumber)
    .find((p) => (state.hands[p.id]?.length || 0) > 0);
  return fallback ? fallback.id : null;
};
