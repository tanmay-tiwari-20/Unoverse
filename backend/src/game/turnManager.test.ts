import { describe, it, expect } from 'vitest';
import { getNextPlayerIndex } from '../game/turnManager';

describe('getNextPlayerIndex', () => {
  it('advances clockwise by one and wraps around', () => {
    expect(getNextPlayerIndex(0, 'clockwise', 4, 1)).toBe(1);
    expect(getNextPlayerIndex(3, 'clockwise', 4, 1)).toBe(0);
  });

  it('advances counter-clockwise by one and wraps around', () => {
    expect(getNextPlayerIndex(1, 'counter-clockwise', 4, 1)).toBe(0);
    expect(getNextPlayerIndex(0, 'counter-clockwise', 4, 1)).toBe(3);
  });

  it('skips by 2 for a skip card', () => {
    expect(getNextPlayerIndex(0, 'clockwise', 4, 2)).toBe(2);
    expect(getNextPlayerIndex(3, 'clockwise', 4, 2)).toBe(1);
  });

  it('in a 2-player game any skip (>1) returns the same player', () => {
    expect(getNextPlayerIndex(0, 'clockwise', 2, 2)).toBe(0);
    expect(getNextPlayerIndex(1, 'counter-clockwise', 2, 2)).toBe(1);
  });

  it('a normal 2-player turn still alternates', () => {
    expect(getNextPlayerIndex(0, 'clockwise', 2, 1)).toBe(1);
    expect(getNextPlayerIndex(1, 'clockwise', 2, 1)).toBe(0);
  });

  it('handles negative wrap correctly (no negative index)', () => {
    const idx = getNextPlayerIndex(0, 'counter-clockwise', 3, 2);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBe(1); // 0 - 2 = -2 -> mod 3 -> 1
  });

  it('guards against zero players', () => {
    expect(getNextPlayerIndex(0, 'clockwise', 0, 1)).toBe(0);
  });
});
