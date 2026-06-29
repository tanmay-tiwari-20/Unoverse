import { CardItem, CardColor } from './deck';

/**
 * Validates whether a card can be played on top of the current discard card.
 * Official UNO rules: Same Color, Same Value, or Wild card.
 *
 * When a draw chain is active (pendingDrawType set), normal matching is
 * suspended: the player may ONLY stack a draw card per the stacking matrix
 * (see canStackDraw). Anything else is illegal — they must draw the chain.
 *
 * @param card The card the player is trying to play
 * @param topCard The current top card of the discard pile
 * @param wildColor The active chosen color if the top card is a Wild
 * @param pendingDrawType The draw card sitting on top of an active chain, if any
 */
export const isValidMove = (
  card: CardItem,
  topCard: CardItem,
  wildColor: CardColor | null,
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null = null
): boolean => {
  // 0. An active draw chain overrides everything: only legal stacks are allowed.
  if (pendingDrawType) {
    return canStackDraw(pendingDrawType, card.value);
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
 * Stacking matrix for draw-card chains:
 *   - +2 on +2  ✓
 *   - +4 on +2  ✓
 *   - +4 on +4  ✓
 *   - +2 on +4  ✗  (must draw the pending +4 chain)
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
