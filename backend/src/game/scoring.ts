import { CardItem } from './deck';

/**
 * Official UNO scoring. When a player empties their hand to win a round, they
 * score the point value of every card still held by the other players:
 *   - Number cards (0-9): face value
 *   - Skip / Reverse / Draw Two: 20 each
 *   - Wild / Wild Draw Four: 50 each
 * First player to reach the target total (default 500) wins the match.
 */

export const DEFAULT_TARGET_SCORE = 500;

/** Point value of a single card for end-of-round scoring. */
export function cardPoints(card: CardItem): number {
  switch (card.value) {
    case 'skip':
    case 'reverse':
    case 'draw_two':
      return 20;
    case 'wild':
    case 'wild_draw_four':
      return 50;
    default: {
      // Number card 0-9.
      const n = Number(card.value);
      return Number.isFinite(n) ? n : 0;
    }
  }
}

/** Total point value of a hand (sum of its cards). */
export function handPoints(hand: CardItem[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

/**
 * Points awarded to the round winner: the sum of every OTHER player's remaining
 * hand. `hands` is keyed by player id; `winnerId` is excluded from the total.
 */
export function calculateRoundPoints(
  hands: Record<string, CardItem[]>,
  winnerId: string
): number {
  let total = 0;
  for (const [id, hand] of Object.entries(hands)) {
    if (id === winnerId) continue;
    total += handPoints(hand);
  }
  return total;
}
