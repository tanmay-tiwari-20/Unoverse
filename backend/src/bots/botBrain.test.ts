import { describe, it, expect } from 'vitest';
import { decideBotAction, findBotJumpIn } from './botBrain';
import { makeState, card, players2, players3 } from '../test/helpers';
import { Player } from '../rooms/roomManager';

const botify = (players: Player[], ...botIds: string[]): Player[] =>
  players.map((p) => (botIds.includes(p.id) ? { ...p, isBot: true } : p));

describe('decideBotAction', () => {
  it("returns null when it is not the bot's turn", () => {
    const state = makeState({ currentPlayerId: 'p1' });
    expect(decideBotAction(state, players2(), 'p2')).toBeNull();
  });

  it('plays a legal matching card', () => {
    const red7 = card('red', '7');
    const state = makeState({
      hands: { p1: [red7, card('blue', '2'), card('blue', '4')], p2: [card('green', '1')] },
      discardPile: [card('red', '5')],
    });
    const decision = decideBotAction(state, players2(), 'p1');
    expect(decision).toEqual({ type: 'play', cardId: red7.id, callUnoFirst: false });
  });

  it('draws when no legal move exists', () => {
    const state = makeState({
      hands: { p1: [card('blue', '2')], p2: [card('green', '1')] },
      discardPile: [card('red', '5')],
    });
    expect(decideBotAction(state, players2(), 'p1')).toEqual({ type: 'draw' });
  });

  it('prefers an action card when the next player is close to winning', () => {
    const redSkip = card('red', 'skip');
    const red3 = card('red', '3');
    const state = makeState({
      hands: { p1: [red3, redSkip, card('blue', '9')], p2: [card('green', '1')] }, // p2 at 1 card
      discardPile: [card('red', '5')],
    });
    const decision = decideBotAction(state, players2(), 'p1');
    expect(decision).toMatchObject({ type: 'play', cardId: redSkip.id });
  });

  it('avoids a bluff Wild Draw Four when another legal card exists', () => {
    const wild4 = card('wild', 'wild_draw_four');
    const red3 = card('red', '3');
    const state = makeState({
      hands: { p1: [wild4, red3], p2: [card('green', '1'), card('green', '2'), card('green', '3')] },
      discardPile: [card('red', '5')], // bot holds red -> +4 would be a bluff
    });
    const decision = decideBotAction(state, players2(), 'p1');
    expect(decision).toMatchObject({ type: 'play', cardId: red3.id });
  });

  it('declares UNO before playing the second-to-last card (manual mode)', () => {
    const red7 = card('red', '7');
    const state = makeState({
      hands: { p1: [red7, card('blue', '2')], p2: [card('green', '1'), card('green', '4')] },
      discardPile: [card('red', '5')],
      rules: { mustSayUno: true, unoCallMode: 'manual' },
    });
    const decision = decideBotAction(state, players2(), 'p1');
    expect(decision).toMatchObject({ type: 'play', cardId: red7.id, callUnoFirst: true });
  });

  it('chooses the majority color for a pending wild', () => {
    const state = makeState({
      hands: { p1: [card('blue', '1'), card('blue', '2'), card('red', '3')], p2: [card('green', '1')] },
      status: 'awaiting_color_selection',
      colorChooserId: 'p1',
    });
    expect(decideBotAction(state, players2(), 'p1')).toEqual({ type: 'choose-color', color: 'blue' });
  });

  it('swaps with the smallest opposing hand (Seven-O)', () => {
    const state = makeState({
      hands: {
        p1: [card('red', '1')],
        p2: [card('green', '1'), card('green', '2'), card('green', '3')],
        p3: [card('blue', '1')],
      },
      status: 'awaiting_swap_target',
      swapChooserId: 'p1',
      rules: { sevenSwap: true },
    });
    expect(decideBotAction(state, players3(), 'p1')).toEqual({ type: 'swap-target', targetId: 'p3' });
  });

  it('passes when sitting on a drawn-card decision with nothing playable', () => {
    const blue2 = card('blue', '2');
    const state = makeState({
      hands: { p1: [blue2], p2: [card('green', '1')] },
      discardPile: [card('red', '5')],
      drawnCardId: blue2.id,
    });
    expect(decideBotAction(state, players2(), 'p1')).toEqual({ type: 'pass' });
  });

  it('never plays an illegal finisher under numberCardFinishOnly', () => {
    const redSkip = card('red', 'skip');
    const state = makeState({
      hands: { p1: [redSkip], p2: [card('green', '1'), card('green', '2')] },
      discardPile: [card('red', '5')],
      rules: { numberCardFinishOnly: true },
    });
    // Skip would win but isn't a legal finisher -> the bot must draw instead.
    expect(decideBotAction(state, players2(), 'p1')).toEqual({ type: 'draw' });
  });
});

describe('findBotJumpIn', () => {
  it('finds a bot holding an identical card when jumpIn is on', () => {
    const twinRed5 = card('red', '5');
    const state = makeState({
      hands: { p1: [card('blue', '1')], p2: [twinRed5, card('green', '2')] },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { jumpIn: true },
    });
    const result = findBotJumpIn(state, botify(players2(), 'p2'));
    expect(result).toEqual({ botId: 'p2', cardId: twinRed5.id });
  });

  it('returns null when jumpIn is off or no bot holds a twin', () => {
    const state = makeState({
      hands: { p1: [card('blue', '1')], p2: [card('red', '5')] },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { jumpIn: false },
    });
    expect(findBotJumpIn(state, botify(players2(), 'p2'))).toBeNull();

    const noTwin = makeState({
      hands: { p1: [card('blue', '1')], p2: [card('red', '6')] },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { jumpIn: true },
    });
    expect(findBotJumpIn(noTwin, botify(players2(), 'p2'))).toBeNull();
  });
});
