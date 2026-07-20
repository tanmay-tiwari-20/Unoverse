import { CardColor, CardItem } from './deck';
import { UnoGameState } from './gameState';
import { Player } from '../rooms/roomManager';
import { chooseColorAction, drawCardAction, passTurnAction, swapTargetAction } from './actions';

/**
 * Shared auto-play helpers. Used by BOTH the turn-timeout auto-resolver (an AFK
 * human's turn) and the bot AI, so "what is a sensible automatic action" lives
 * in exactly one place instead of being duplicated per caller.
 */

/** The color a player holds the most of — the sensible default for a pending Wild. */
export function majorityColor(hands: Record<string, CardItem[]>, playerId: string): CardColor {
  const counts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of hands[playerId] || []) {
    if (card.color in counts) counts[card.color]++;
  }
  let best: CardColor = 'red';
  let bestN = -1;
  (['red', 'blue', 'green', 'yellow'] as CardColor[]).forEach((c) => {
    if (counts[c] > bestN) { best = c; bestN = counts[c]; }
  });
  return best;
}

/**
 * Resolve a timed-out turn with a legal default action:
 *   - awaiting_color_selection -> pick the chooser's majority color
 *   - awaiting_swap_target     -> swap with the opponent holding the most cards
 *   - playing                  -> draw (or pass an open draw-then-play decision);
 *                                 a forced draw that opens a decision is passed
 *                                 immediately so the table never waits twice.
 * Returns the updated game state, or null when the status isn't a timed phase.
 */
export function autoResolveTimedOutTurn(game: UnoGameState, players: Player[]): UnoGameState | null {
  if (game.status === 'awaiting_color_selection' && game.colorChooserId) {
    const color = majorityColor(game.hands, game.colorChooserId);
    return chooseColorAction(game, players, game.colorChooserId, color);
  }

  if (game.status === 'awaiting_swap_target' && game.swapChooserId) {
    const chooser = game.swapChooserId;
    const target = players
      .filter((p) => p.id !== chooser)
      .sort((a, b) => (game.hands[b.id]?.length || 0) - (game.hands[a.id]?.length || 0))[0];
    return target ? swapTargetAction(game, players, chooser, target.id) : null;
  }

  if (game.status === 'playing') {
    const activePlayerId = game.currentPlayerId;
    if (game.drawnCardId) {
      // Already drew a playable card and is sitting on the decision — pass.
      return passTurnAction(game, players, activePlayerId);
    }
    let updated = drawCardAction(game, players, activePlayerId);
    // If the forced draw produced a playable card, don't make the table wait
    // another full timeout — immediately pass on the stalled player's behalf.
    if (updated.drawnCardId) {
      updated = passTurnAction(updated, players, activePlayerId);
    }
    return updated;
  }

  return null;
}
