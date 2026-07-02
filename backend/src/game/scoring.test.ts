import { describe, it, expect } from 'vitest';
import { cardPoints, handPoints, calculateRoundPoints } from './scoring';
import { card } from '../test/helpers';

describe('cardPoints', () => {
  it('scores number cards at face value', () => {
    expect(cardPoints(card('red', '0'))).toBe(0);
    expect(cardPoints(card('blue', '7'))).toBe(7);
    expect(cardPoints(card('green', '9'))).toBe(9);
  });

  it('scores action cards at 20', () => {
    expect(cardPoints(card('red', 'skip'))).toBe(20);
    expect(cardPoints(card('red', 'reverse'))).toBe(20);
    expect(cardPoints(card('red', 'draw_two'))).toBe(20);
  });

  it('scores wild cards at 50', () => {
    expect(cardPoints(card('wild', 'wild'))).toBe(50);
    expect(cardPoints(card('wild', 'wild_draw_four'))).toBe(50);
  });
});

describe('handPoints', () => {
  it('sums a mixed hand', () => {
    const hand = [card('red', '5'), card('blue', 'skip'), card('wild', 'wild_draw_four')];
    expect(handPoints(hand)).toBe(5 + 20 + 50);
  });
  it('is 0 for an empty hand', () => {
    expect(handPoints([])).toBe(0);
  });
});

describe('calculateRoundPoints', () => {
  it('sums every OTHER player’s hand, excluding the winner', () => {
    const hands = {
      winner: [], // emptied hand
      p2: [card('red', '9'), card('blue', 'skip')], // 9 + 20 = 29
      p3: [card('wild', 'wild')], // 50
    };
    expect(calculateRoundPoints(hands, 'winner')).toBe(29 + 50);
  });

  it('is 0 when opponents are also empty', () => {
    expect(calculateRoundPoints({ w: [], x: [] }, 'w')).toBe(0);
  });
});
