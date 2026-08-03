import type { UnoGameState } from './gameState';
import type { Player } from '../rooms/roomManager';

/**
 * ============================================================================
 *  Round completion — the single authority on "is this round over?"
 * ============================================================================
 *
 * A round ends when either condition holds:
 *
 *   1. At most one player still holds cards (the classic condition — everyone
 *      else has emptied their hand, so there is nobody left to play against).
 *
 *   2. Someone has already won and every player still holding cards is a BOT.
 *      There is no human left to watch the rest of the round resolve, so
 *      simulating the bots' remaining turns produces nothing a human would ever
 *      see. Ending here is purely a completion-timing decision: the winner, the
 *      remaining hands, and therefore the round's score are exactly what they
 *      were the instant the last human finished.
 *
 * Condition 2 is deliberately expressed as "no ACTIVE HUMAN remains" rather
 * than "the winner was human" or "how many players are left". That phrasing is
 * what makes the edge cases fall out for free:
 *
 *   - 1 human + 3 bots, human wins       -> ends immediately (no active human).
 *   - 2 humans + 2 bots, human A wins    -> continues (human B is still active).
 *   - humans only                        -> condition 2 can never fire; the
 *                                           classic condition governs, unchanged.
 *   - a bot wins first in a mixed game   -> continues; the human is still active.
 *   - spectators present                 -> unaffected. Spectators never hold
 *                                           cards, so they are not participants;
 *                                           they receive the same authoritative
 *                                           end-of-round broadcast everyone does.
 *   - a human is mid-disconnect          -> still seated during the grace period,
 *                                           so still counted as an active human
 *                                           and the round plays on for them to
 *                                           reconnect into.
 *   - team modes / tournaments (future)  -> a teammate or opponent who is human
 *                                           and still holding cards keeps the
 *                                           round alive by the same rule.
 *
 * Nothing here alters scoring, turn order, bot AI, or the winner itself — it
 * only answers *when* the round is considered complete. Server-side only; the
 * result flows to clients through the existing authoritative broadcast.
 */

/** Players who still hold at least one card, i.e. the round's live participants. */
export const activeParticipants = (state: UnoGameState, players: Player[]): Player[] =>
  players.filter((p) => (state.hands[p.id]?.length || 0) > 0);

/**
 * True when at least one human (non-bot) player still holds cards. Determined
 * per participant via `isBot`, never inferred from the player count, so a table
 * of any size and composition is judged the same way.
 */
export const hasActiveHumanPlayer = (state: UnoGameState, players: Player[]): boolean =>
  activeParticipants(state, players).some((p) => !p.isBot);

/**
 * Whether the round is complete. `winnerId` is the id of the player who just
 * emptied their hand, when applicable — pass it for a play that produced a
 * winner, or omit it to fall back to the winner already recorded on the state.
 */
export const shouldEndRound = (
  state: UnoGameState,
  players: Player[],
  winnerId?: string | null
): boolean => {
  // Classic: nobody left to play against.
  if (activeParticipants(state, players).length <= 1) return true;

  // Bot-only remainder: a winner is decided and no human is still in the round.
  const winner = winnerId ?? state.winnerId;
  return !!winner && !hasActiveHumanPlayer(state, players);
};
