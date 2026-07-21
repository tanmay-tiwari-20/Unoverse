import { describe, it, expect } from 'vitest';
import { getNextPlayerIndex, getNextActivePlayerId, recoverActivePlayerId } from '../game/turnManager';
import { card, players3 } from '../test/helpers';
import { CardItem } from '../game/deck';

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

/** Hands where every listed player holds one card (others hold nothing). */
const handsFor = (...ids: string[]): Record<string, CardItem[]> => {
  const hands: Record<string, CardItem[]> = {};
  ids.forEach((id) => { hands[id] = [card('red', '5')]; });
  return hands;
};

describe('getNextActivePlayerId', () => {
  const players = players3(); // p1..p3 on seats 1..3

  it('advances clockwise to the next seat and wraps around', () => {
    const state = { direction: 'clockwise' as const, hands: handsFor('p1', 'p2', 'p3') };
    expect(getNextActivePlayerId(state, players, 1)).toBe('p2');
    expect(getNextActivePlayerId(state, players, 3)).toBe('p1');
  });

  it('advances counter-clockwise (respects an active Reverse) and wraps', () => {
    const state = { direction: 'counter-clockwise' as const, hands: handsFor('p1', 'p2', 'p3') };
    expect(getNextActivePlayerId(state, players, 2)).toBe('p1');
    expect(getNextActivePlayerId(state, players, 1)).toBe('p3');
  });

  it('skips players who no longer hold cards', () => {
    const state = { direction: 'clockwise' as const, hands: handsFor('p1', 'p3') }; // p2 is out
    expect(getNextActivePlayerId(state, players, 1)).toBe('p3');
  });

  it('works when the reference seat has already been vacated (leaver scenario)', () => {
    const remaining = players.filter((p) => p.id !== 'p2'); // seat 2 left the room
    const state = { direction: 'clockwise' as const, hands: handsFor('p1', 'p3') };
    expect(getNextActivePlayerId(state, remaining, 2)).toBe('p3');
    const ccw = { direction: 'counter-clockwise' as const, hands: handsFor('p1', 'p3') };
    expect(getNextActivePlayerId(ccw, remaining, 2)).toBe('p1');
  });

  it('advances by two active positions for a Skip', () => {
    const state = { direction: 'clockwise' as const, hands: handsFor('p1', 'p2', 'p3') };
    expect(getNextActivePlayerId(state, players, 1, 2)).toBe('p3');
  });

  it('a Skip between two remaining active players returns the turn to the sender', () => {
    const state = { direction: 'clockwise' as const, hands: handsFor('p1', 'p2') };
    expect(getNextActivePlayerId(state, players.slice(0, 2), 1, 2)).toBe('p1');
  });

  it('returns null when nobody holds cards', () => {
    const state = { direction: 'clockwise' as const, hands: {} };
    expect(getNextActivePlayerId(state, players, 1)).toBeNull();
  });
});

describe('recoverActivePlayerId', () => {
  const players = players3();

  it('leaves a valid currentPlayerId untouched', () => {
    const state = {
      direction: 'clockwise' as const,
      hands: handsFor('p1', 'p2', 'p3'),
      currentPlayerId: 'p2',
      lastAction: { type: 'play' as const, playerId: 'p1' },
    };
    expect(recoverActivePlayerId(state, players)).toBe('p2');
  });

  it('anchors on the last actor and follows the current direction', () => {
    const state = {
      direction: 'clockwise' as const,
      hands: handsFor('p1', 'p3'),
      currentPlayerId: 'ghost-socket', // e.g. seat 2 vanished without a handoff
      lastAction: { type: 'play' as const, playerId: 'p1' },
    };
    // Next after p1, skipping the vanished/cardless seat 2.
    expect(recoverActivePlayerId(state, players.filter((p) => p.id !== 'p2'))).toBe('p3');
  });

  it('falls back to the lowest seat still holding cards when no anchor survives', () => {
    const state = {
      direction: 'clockwise' as const,
      hands: handsFor('p2', 'p3'),
      currentPlayerId: 'ghost-socket',
      lastAction: undefined,
    };
    expect(recoverActivePlayerId(state, players)).toBe('p2');
  });

  it('returns null when no seated player holds cards', () => {
    const state = {
      direction: 'clockwise' as const,
      hands: {},
      currentPlayerId: 'ghost-socket',
      lastAction: undefined,
    };
    expect(recoverActivePlayerId(state, players)).toBeNull();
  });
});
