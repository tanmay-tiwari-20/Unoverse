import { CardColor, CardItem } from '../game/deck';
import { UnoGameState } from '../game/gameState';
import { isValidMove } from '../game/rules';
import { canFinishWithCard } from '../game/houseRules';
import { majorityColor } from '../game/autoPlay';
import { Player } from '../rooms/roomManager';

/**
 * ============================================================================
 *  Bot decision engine ("brain") — pure and stateless.
 * ============================================================================
 *
 * Given the authoritative game state, decide what a bot should do on its turn.
 * The brain NEVER mutates state and NEVER invents moves: every decision maps to
 * one of the existing server-authoritative action functions, which re-validate
 * legality. That means a bot literally cannot cheat — at worst a bad decision is
 * rejected exactly like a bad human request would be.
 *
 * Strategy (deliberately simple, structured for later upgrades):
 *   - Play a legal move whenever one exists (reduce hand size).
 *   - Score candidate cards: prefer action cards when the next player is close
 *     to winning, prefer keeping Wilds for later, prefer the bot's majority
 *     color, and avoid "bluff" Wild Draw Fours (playing +4 while holding the
 *     active color) unless it is the only legal move.
 *   - Choose Wild colors by majority color in hand.
 *   - Call UNO (Last Card) before playing the second-to-last card.
 *   - Challenge +4s with a modest probability heuristic.
 *
 * To add a smarter AI later, provide another implementation of `decideBotAction`
 * (e.g. card-counting, opponent modeling) and switch on a difficulty setting —
 * nothing outside this module needs to change.
 */

export type BotDecision =
  | { type: 'choose-color'; color: CardColor }
  | { type: 'swap-target'; targetId: string }
  | { type: 'challenge' }
  | { type: 'play'; cardId: string; callUnoFirst: boolean }
  | { type: 'draw' }
  | { type: 'pass' };

/** The player seated immediately after `playerId` in play direction (with cards). */
const nextPlayerAfter = (game: UnoGameState, players: Player[], playerId: string): Player | null => {
  const idx = players.findIndex((p) => p.id === playerId);
  if (idx === -1 || players.length < 2) return null;
  const delta = game.direction === 'clockwise' ? 1 : -1;
  for (let step = 1; step <= players.length; step++) {
    const candidate = players[(idx + delta * step + players.length * 10) % players.length];
    if (candidate.id !== playerId && (game.hands[candidate.id]?.length || 0) > 0) {
      return candidate;
    }
  }
  return null;
};

const isActionValue = (v: string) => v === 'skip' || v === 'reverse' || v === 'draw_two';

/**
 * Score a legal candidate card. Higher = better. The exact numbers only matter
 * relative to each other; see the module docblock for the intended ordering.
 */
const scoreCard = (
  card: CardItem,
  game: UnoGameState,
  players: Player[],
  botId: string,
  holdsActiveColor: boolean
): number => {
  let score = 0;
  const hand = game.hands[botId] || [];
  const majority = majorityColor(game.hands, botId);
  const next = nextPlayerAfter(game, players, botId);
  const nextIsThreat = !!next && (game.hands[next.id]?.length || 0) <= 2;

  if (/^[0-9]$/.test(card.value)) {
    // Number cards: dump them freely — they're worth the least if we lose.
    score += 3;
  } else if (isActionValue(card.value)) {
    // Action cards: strong when the next player is about to win, otherwise a
    // mild preference over hoarding them.
    score += nextIsThreat ? 6 : 2;
  } else if (card.value === 'wild') {
    // Plain Wild: save it unless the hand is nearly done.
    score += hand.length <= 2 ? 4 : -1;
  } else if (card.value === 'wild_draw_four') {
    // +4: powerful against a threat, but playing it while holding the active
    // color is a challengeable bluff — heavily deprioritized (only picked when
    // it is the sole legal move).
    score += nextIsThreat ? 5 : -2;
    if (holdsActiveColor) score -= 100;
  }

  // Keep color control: playing our majority color keeps future cards playable.
  if (card.color !== 'wild' && card.color === majority) score += 1;

  return score;
};

/**
 * Decide the bot's next action for the current game state, or null when it is
 * not this bot's move. The caller applies the decision through the normal
 * action functions (which validate everything again).
 */
export function decideBotAction(
  game: UnoGameState,
  players: Player[],
  botId: string
): BotDecision | null {
  const rules = game.rules;

  if (game.status === 'awaiting_color_selection') {
    if (game.colorChooserId !== botId) return null;
    return { type: 'choose-color', color: majorityColor(game.hands, botId) };
  }

  if (game.status === 'awaiting_swap_target') {
    if (game.swapChooserId !== botId) return null;
    // Seven-O swap: take the smallest opposing hand.
    const target = players
      .filter((p) => p.id !== botId && game.hands[p.id])
      .sort((a, b) => (game.hands[a.id]?.length || 0) - (game.hands[b.id]?.length || 0))[0];
    return target ? { type: 'swap-target', targetId: target.id } : null;
  }

  if (game.status !== 'playing' || game.currentPlayerId !== botId) return null;

  const hand = game.hands[botId] || [];
  const topCard = game.discardPile[game.discardPile.length - 1];
  if (!topCard) return null;

  // A +4 is pending against us and challenges are enabled: sometimes challenge.
  // Heuristic: always tempted when the stack is huge, otherwise a modest chance —
  // "reasonable" without being exploitably predictable.
  if (
    rules.challengeWildDrawFour &&
    game.pendingDrawType === 'wild_draw_four' &&
    game.challengeableById === botId
  ) {
    const canStackInstead = hand.some((c) =>
      isValidMove(c, topCard, game.wildColor, game.pendingDrawType, rules)
    );
    const challengeChance = game.drawStack >= 8 ? 0.6 : 0.3;
    if (!canStackInstead && Math.random() < challengeChance) {
      return { type: 'challenge' };
    }
  }

  // Legal moves (also honoring the last-card winning restrictions so we never
  // request a play the engine would reject).
  const holdsActiveColor = (() => {
    const activeColor = topCard.color === 'wild' ? game.wildColor : topCard.color;
    return !!activeColor && hand.some((c) => c.color === activeColor);
  })();

  const legal = hand.filter((c) => {
    if (!isValidMove(c, topCard, game.wildColor, game.pendingDrawType, rules)) return false;
    if (hand.length === 1 && !canFinishWithCard(rules, c.color, c.value)) return false;
    return true;
  });

  if (legal.length === 0) {
    // No playable card. If we're sitting on a draw-then-play decision the engine
    // only accepts a play or a pass — otherwise draw (which also eats any chain).
    return game.drawnCardId ? { type: 'pass' } : { type: 'draw' };
  }

  const best = legal
    .map((c) => ({ card: c, score: scoreCard(c, game, players, botId, holdsActiveColor) }))
    .sort((a, b) => b.score - a.score)[0].card;

  // Last Card: declare UNO before playing down to a single card (manual mode only
  // — in auto mode the server declares for everyone).
  const callUnoFirst =
    hand.length === 2 &&
    rules.mustSayUno &&
    rules.unoCallMode === 'manual' &&
    !game.unoCalled[botId];

  return { type: 'play', cardId: best.id, callUnoFirst };
}

/**
 * Jump-In consideration: pick a bot (not the current player) holding a card
 * identical to the top card. Returns the bot + card, or null. The caller decides
 * probability/timing; the engine re-validates at execution time.
 */
export function findBotJumpIn(
  game: UnoGameState,
  players: Player[]
): { botId: string; cardId: string } | null {
  if (!game.rules.jumpIn || game.status !== 'playing' || game.pendingDrawType) return null;
  const topCard = game.discardPile[game.discardPile.length - 1];
  if (!topCard || topCard.color === 'wild') return null;

  const candidates: { botId: string; cardId: string }[] = [];
  for (const p of players) {
    if (!p.isBot || p.id === game.currentPlayerId) continue;
    const hand = game.hands[p.id] || [];
    const match = hand.find((c) => c.color === topCard.color && c.value === topCard.value);
    if (!match) continue;
    if (hand.length === 1 && !canFinishWithCard(game.rules, match.color, match.value)) continue;
    candidates.push({ botId: p.id, cardId: match.id });
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
