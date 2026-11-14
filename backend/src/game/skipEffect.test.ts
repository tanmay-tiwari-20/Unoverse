import { afterEach, describe, expect, it, vi } from 'vitest';
import { playCardAction, drawCardAction, startGameState } from './actions';
import * as deck from './deck';
import { card, makeState, players2, players3 } from '../test/helpers';

afterEach(() => vi.restoreAllMocks());

describe('Skip effects with the compatible skipChaining toggle', () => {
  it.each([
    ['clockwise', true, 'p3'], ['clockwise', false, 'p2'],
    ['counter-clockwise', true, 'p2'], ['counter-clockwise', false, 'p3'],
  ] as const)('played Skip respects direction %s and effect=%s', (direction, enabled, next) => {
    const skip = card('red', 'skip');
    const state = makeState({
      hands: { p1: [skip, card('blue', '1')], p2: [card('green', '2')], p3: [card('yellow', '3')] },
      direction, rules: { skipChaining: enabled, mustSayUno: false },
    });
    playCardAction(state, players3(), 'p1', skip.id);
    expect(state.currentPlayerId).toBe(next);
    expect(state.direction).toBe(direction);
    expect(state.roundStats?.p1.skipCardsPlayed).toBe(1);
  });

  it.each([true, false])('played Skip in two seats honors effect=%s', (enabled) => {
    const skip = card('red', 'skip');
    const state = makeState({
      hands: { p1: [skip, card('blue', '1')], p2: [card('green', '2')] },
      rules: { skipChaining: enabled, mustSayUno: false },
    });
    playCardAction(state, players2(), 'p1', skip.id);
    expect(state.currentPlayerId).toBe(enabled ? 'p1' : 'p2');
  });

  it.each([true, false])('a forced drawn Skip respects effect=%s', (enabled) => {
    const skip = card('red', 'skip');
    const state = makeState({
      hands: { p1: [card('blue', '1')], p2: [card('green', '2')], p3: [card('yellow', '3')] },
      deck: [skip], rules: { skipChaining: enabled, mustSayUno: false, forcePlayDrawnCard: true },
    });
    drawCardAction(state, players3(), 'p1');
    expect(state.currentPlayerId).toBe(enabled ? 'p3' : 'p2');
    expect(state.discardPile.at(-1)?.id).toBe(skip.id);
  });

  it('disabling Skip does not disable Reverse-as-Skip', () => {
    const reverse = card('red', 'reverse');
    const state = makeState({
      hands: { p1: [reverse, card('blue', '1')], p2: [card('green', '2')] },
      rules: { skipChaining: false, reverseAsSkipInTwoPlayer: true, mustSayUno: false },
    });
    playCardAction(state, players2(), 'p1', reverse.id);
    expect(state.currentPlayerId).toBe('p1');
    expect(state.direction).toBe('counter-clockwise');
  });

  it.each([true, false])('Skip finisher legality is unchanged when effect=%s', (enabled) => {
    const skip = card('red', 'skip');
    const blocked = makeState({
      hands: { p1: [skip], p2: [card('green', '2')] },
      rules: { skipChaining: enabled, allowWinWithActionCard: false },
    });
    expect(() => playCardAction(blocked, players2(), 'p1', skip.id)).toThrow(/cannot win/);
    const allowed = makeState({ hands: { p1: [skip], p2: [card('green', '2')] }, rules: { skipChaining: enabled } });
    playCardAction(allowed, players2(), 'p1', skip.id);
    expect(allowed.status).toBe('ended');
    expect(allowed.winnerId).toBe('p1');
  });

  it.each([true, false])('opening Skip preserves the old start order only when effect=%s', (enabled) => {
    const players = players3();
    const openingSkip = card('red', 'skip');
    const ordered = Array.from({ length: 108 }, (_, index) => card(['red', 'blue', 'green', 'yellow'][index % 4] as deck.CardColor, '1'));
    ordered[108 - players.length * 7 - 1] = openingSkip;
    vi.spyOn(deck, 'generateDeck').mockImplementation(() => [...ordered]);
    vi.spyOn(deck, 'shuffleDeck').mockImplementation((cards) => cards);
    const state = startGameState(players, { ...makeState().rules, skipChaining: enabled });
    expect(state.discardPile[0].id).toBe(openingSkip.id);
    expect(state.currentPlayerId).toBe(enabled ? 'p3' : 'p1');
  });
});
