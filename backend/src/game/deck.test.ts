import { describe, it, expect } from 'vitest';
import { generateDeck, shuffleDeck, CardItem } from '../game/deck';

describe('generateDeck', () => {
  const deck = generateDeck();

  it('builds the standard 108-card UNO deck', () => {
    expect(deck).toHaveLength(108);
  });

  it('has unique ids for every card', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(108);
  });

  it('has exactly one 0 and two of each 1-9 per color', () => {
    const colors = ['red', 'blue', 'green', 'yellow'] as const;
    for (const color of colors) {
      const zeros = deck.filter((c) => c.color === color && c.value === '0');
      expect(zeros, `${color} zeros`).toHaveLength(1);
      for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
        const n = deck.filter((c) => c.color === color && c.value === v);
        expect(n, `${color} ${v}`).toHaveLength(2);
      }
    }
  });

  it('has two of each action card per color', () => {
    const colors = ['red', 'blue', 'green', 'yellow'] as const;
    for (const color of colors) {
      for (const v of ['skip', 'reverse', 'draw_two'] as const) {
        const n = deck.filter((c) => c.color === color && c.value === v);
        expect(n, `${color} ${v}`).toHaveLength(2);
      }
    }
  });

  it('has 4 wild and 4 wild_draw_four cards', () => {
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild_draw_four')).toHaveLength(4);
  });
});

describe('shuffleDeck', () => {
  it('preserves every card (permutation, no loss/dupes)', () => {
    const deck = generateDeck();
    const before = deck.map((c) => c.id).sort();
    const shuffled = shuffleDeck([...deck]);
    const after = shuffled.map((c) => c.id).sort();
    expect(after).toEqual(before);
    expect(shuffled).toHaveLength(108);
  });

  it('actually reorders (statistically) a large deck', () => {
    const deck = generateDeck();
    const copy = [...deck];
    const shuffled = shuffleDeck(copy);
    // With 108 cards the chance of an identical order is astronomically small.
    const samePositions = shuffled.filter((c, i) => c.id === deck[i].id).length;
    expect(samePositions).toBeLessThan(108);
  });
});
