import { CardItem, CardColor } from './deck';
import { HouseRules, DEFAULT_HOUSE_RULES, canStackDrawWithRules } from './houseRules';

/**
 * Validates whether a card can be played on top of the current discard card.
 * Official UNO rules: Same Color, Same Value, or Wild card.
 *
 * When a draw chain is active (pendingDrawType set), normal matching is
 * suspended: the player may ONLY stack a draw card per the (rules-driven)
 * stacking matrix. Anything else is illegal — they must draw the chain.
 *
 * @param card The card the player is trying to play
 * @param topCard The current top card of the discard pile
 * @param wildColor The active chosen color if the top card is a Wild
 * @param pendingDrawType The draw card sitting on top of an active chain, if any
 * @param rules The active house rules (drives the stacking matrix)
 */
export const isValidMove = (
  card: CardItem,
  topCard: CardItem,
  wildColor: CardColor | null,
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null = null,
  rules: HouseRules = DEFAULT_HOUSE_RULES
): boolean => {
  // 0. An active draw chain overrides everything: only legal stacks are allowed.
  if (pendingDrawType) {
    return canStackDrawWithRules(rules, pendingDrawType, card.value);
  }

  // 1. Wild cards are always valid to play
  if (card.color === 'wild') {
    return true;
  }

  // 2. If top card is wild, we must match the active chosen wild color
  if (topCard.color === 'wild') {
    if (!wildColor) return true; // Safety fallback (if no color chosen yet)
    return card.color === wildColor;
  }

  // 3. Match color or match value
  return card.color === topCard.color || card.value === topCard.value;
};

/**
 * Stacking matrix for draw-card chains. Thin wrapper preserved for backward
 * compatibility with the classic default matrix (+2 on +2, +4 on +2, +4 on +4,
 * but NOT +2 on +4). For rule-driven behavior use canStackDrawWithRules.
 *
 * @param pendingDrawType The draw card currently on top of the chain
 * @param cardValue The value of the card the player wants to stack
 */
export const canStackDraw = (
  pendingDrawType: 'draw_two' | 'wild_draw_four',
  cardValue: string
): boolean => {
  if (cardValue === 'wild_draw_four') return true; // +4 stacks on anything
  if (cardValue === 'draw_two') return pendingDrawType === 'draw_two'; // +2 only on +2
  return false;
};

/**
 * Jump-In check: a player (whose turn it may NOT be) may play a card IDENTICAL in
 * both color AND value to the current top card, jumping the turn to themselves.
 * Only meaningful when the jumpIn house rule is on and no draw chain / color
 * selection is pending. Wilds cannot be jumped in on (no stable identity).
 */
export const isValidJumpIn = (
  card: CardItem,
  topCard: CardItem,
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null = null
): boolean => {
  if (pendingDrawType) return false;
  if (card.color === 'wild' || topCard.color === 'wild') return false;
  return card.color === topCard.color && card.value === topCard.value;
};
