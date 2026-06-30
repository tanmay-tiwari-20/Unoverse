import { describe, it, expect } from 'vitest';
import { isValidMove, canStackDraw } from '../game/rules';
import { card } from '../test/helpers';

describe('isValidMove — normal play (no active chain)', () => {
  it('matches by color', () => {
    expect(isValidMove(card('red', '7'), card('red', '3'), null)).toBe(true);
  });

  it('matches by value', () => {
    expect(isValidMove(card('blue', '7'), card('red', '7'), null)).toBe(true);
  });

  it('rejects a non-matching color and value', () => {
    expect(isValidMove(card('blue', '7'), card('red', '3'), null)).toBe(false);
  });

  it('a wild card is always playable', () => {
    expect(isValidMove(card('wild', 'wild'), card('red', '3'), null)).toBe(true);
    expect(isValidMove(card('wild', 'wild_draw_four'), card('green', 'skip'), null)).toBe(true);
  });

  it('on a wild top card, must match the chosen wildColor', () => {
    const top = card('wild', 'wild');
    expect(isValidMove(card('blue', '5'), top, 'blue')).toBe(true);
    expect(isValidMove(card('red', '5'), top, 'blue')).toBe(false);
  });
});

describe('isValidMove — during an active draw chain', () => {
  it('on a +2 chain: +2 stacks, +4 stacks, plain cards do NOT', () => {
    const top = card('red', 'draw_two');
    expect(isValidMove(card('blue', 'draw_two'), top, null, 'draw_two')).toBe(true);
    expect(isValidMove(card('wild', 'wild_draw_four'), top, null, 'draw_two')).toBe(true);
    expect(isValidMove(card('red', '5'), top, null, 'draw_two')).toBe(false);
    expect(isValidMove(card('red', 'skip'), top, null, 'draw_two')).toBe(false);
  });

  it('on a +4 chain: only +4 stacks, a +2 may NOT', () => {
    const top = card('wild', 'wild_draw_four');
    expect(isValidMove(card('wild', 'wild_draw_four'), top, 'red', 'wild_draw_four')).toBe(true);
    expect(isValidMove(card('red', 'draw_two'), top, 'red', 'wild_draw_four')).toBe(false);
    expect(isValidMove(card('red', '5'), top, 'red', 'wild_draw_four')).toBe(false);
  });
});

describe('canStackDraw — the stacking matrix', () => {
  it('+2 on +2 is allowed', () => {
    expect(canStackDraw('draw_two', 'draw_two')).toBe(true);
  });
  it('+4 on +2 is allowed', () => {
    expect(canStackDraw('draw_two', 'wild_draw_four')).toBe(true);
  });
  it('+4 on +4 is allowed', () => {
    expect(canStackDraw('wild_draw_four', 'wild_draw_four')).toBe(true);
  });
  it('+2 on +4 is NOT allowed', () => {
    expect(canStackDraw('wild_draw_four', 'draw_two')).toBe(false);
  });
  it('non-draw cards never stack', () => {
    expect(canStackDraw('draw_two', 'skip')).toBe(false);
    expect(canStackDraw('draw_two', '5')).toBe(false);
  });
});
