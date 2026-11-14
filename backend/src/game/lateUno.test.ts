import { describe, expect, it } from 'vitest';
import {
  playCardAction, drawCardAction, passTurnAction, jumpInAction,
  chooseColorAction, swapTargetAction, challengeWildFourAction, callUnoAction,
} from './actions';
import { autoResolveTimedOutTurn } from './autoPlay';
import { calculateRoundPoints } from './scoring';
import { card, makeState, players2, players3 } from '../test/helpers';
import type { CardValue } from './deck';
import type { Player } from '../rooms/roomManager';

const lateRules = { allowLateUno: true, unoPenaltyCards: 2 };

function openGrace(value: CardValue = '5') {
  const first = card(value === 'wild' || value === 'wild_draw_four' ? 'wild' : 'red', value);
  const state = makeState({
    hands: {
      p1: [first, card('red', '9')],
      p2: [card('red', '6'), card('blue', '2')],
      p3: [card('green', '1'), card('blue', '8')],
    },
    discardPile: [card('red', '3')],
    rules: { ...lateRules, jumpIn: true, sevenSwap: value === '7',
      challengeWildDrawFour: true, bluffingWildDrawFour: true },
  });
  playCardAction(state, players3(), 'p1', first.id);
  return state;
}

describe('Manual late UNO grace', () => {
  it('opens a real one-card window, and a late call prevents the penalty', () => {
    const state = openGrace();
    expect(state.hands.p1).toHaveLength(1);
    expect(state.pendingUnoPlayerId).toBe('p1');
    expect(state.roundStats?.p1.unoPenalties ?? 0).toBe(0);
    expect(state.lastAction?.unoPenalties).toEqual([]);

    callUnoAction(state, 'p1');
    playCardAction(state, players3(), 'p2', state.hands.p2[0].id);

    expect(state.hands.p1).toHaveLength(1);
    expect(state.unoCalled.p1).toBe(true);
    expect(state.roundStats?.p1.unoCalls).toBe(1);
    expect(state.pendingUnoPlayerId).toBe('p2');
    expect(state.lastAction?.unoPenalties).toEqual([]);
  });

  it('keeps pre-calls at two cards and counts repeated declarations only once', () => {
    const first = card('red', '5');
    const state = makeState({ hands: { p1: [first, card('red', '9')], p2: [card('red', '6')] }, rules: lateRules });
    callUnoAction(state, 'p1');
    callUnoAction(state, 'p1');
    playCardAction(state, players2(), 'p1', first.id);
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.hands.p1).toHaveLength(1);
    expect(state.roundStats?.p1.unoCalls).toBe(1);
    expect(() => callUnoAction(state, 'p1')).toThrow(/right now/);
    expect(state.roundStats?.p1.unoCalls).toBe(1);
  });

  it.each([true, false])('rejects one-card calls without an open grace (late=%s)', (allowLateUno) => {
    const state = makeState({ hands: { p1: [card('red', '9')], p2: [card('red', '6')] }, rules: { allowLateUno } });
    const before = JSON.parse(JSON.stringify(state));
    expect(() => callUnoAction(state, 'p1')).toThrow(/right now/);
    expect(state).toEqual(before);
  });

  it('rejects finished players, unknown actors, and calls after the round ends', () => {
    const state = openGrace();
    state.hands.p3 = [];
    expect(() => callUnoAction(state, 'p3')).toThrow();
    expect(() => callUnoAction(state, 'spectator')).toThrow();
    expect(state.pendingUnoPlayerId).toBe('p1');
    state.status = 'ended';
    expect(() => callUnoAction(state, 'p1')).toThrow();
    expect(state.roundStats?.p1.unoCalls ?? 0).toBe(0);
  });

  it('does not expire or mutate grace on invalid gameplay requests', () => {
    const state = openGrace();
    state.rules.mustPlayIfPlayable = true;
    const requests = [
      () => playCardAction(state, players3(), 'p1', state.hands.p1[0].id),
      () => playCardAction(state, players3(), 'p2', 'missing-card'),
      () => playCardAction(state, players3(), 'p2', state.hands.p2[1].id),
      () => drawCardAction(state, players3(), 'p2'),
      () => passTurnAction(state, players3(), 'p2'),
      () => challengeWildFourAction(state, players3(), 'p2'),
      () => jumpInAction(state, players3(), 'p3', state.hands.p3[0].id),
      () => callUnoAction(state, 'spectator'),
    ];
    const before = JSON.parse(JSON.stringify(state));
    for (const request of requests) {
      expect(request).toThrow();
      expect(state).toEqual(before);
    }
    callUnoAction(state, 'p1');
    expect(state.pendingUnoPlayerId).toBeNull();
  });

  it('settles the prior debt once before a new player opens their own grace', () => {
    const state = openGrace();
    playCardAction(state, players3(), 'p2', state.hands.p2[0].id);
    expect(state.hands.p1).toHaveLength(3);
    expect(state.pendingUnoPlayerId).toBe('p2');
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
    expect(state.roundStats?.p1.unoPenalties).toBe(1);
    expect(state.roundStats?.p1.cardsDrawn).toBe(2);
    drawCardAction(state, players3(), 'p3');
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p2', drawCount: 2 }]);
    expect(state.roundStats?.p1.unoPenalties).toBe(1);
  });

  it.each(['draw', 'pass'] as const)('expires grace on a valid %s', (action) => {
    const state = openGrace();
    if (action === 'pass') state.drawnCardId = state.hands.p2[0].id;
    if (action === 'draw') drawCardAction(state, players3(), 'p2');
    else passTurnAction(state, players3(), 'p2');
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.hands.p1).toHaveLength(3);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
  });

  it('expires grace on a valid jump-in and opens the jumper\'s window', () => {
    const state = openGrace();
    const identical = card('red', '5');
    state.hands.p3 = [identical, card('blue', '8')];
    jumpInAction(state, players3(), 'p3', identical.id);
    expect(state.hands.p1).toHaveLength(3);
    expect(state.pendingUnoPlayerId).toBe('p3');
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
    expect(state.roundStats?.p3.jumpIns).toBe(1);
  });

  it.each(['skip', 'reverse'] as const)('settles before an undeclared %s extra-turn finisher', (value) => {
    const first = card('red', value);
    const last = card('red', '9');
    const state = makeState({ hands: { p1: [first, last], p2: [card('green', '2')] }, rules: lateRules });
    playCardAction(state, players2(), 'p1', first.id);
    expect(state.currentPlayerId).toBe('p1');
    expect(state.pendingUnoPlayerId).toBe('p1');
    playCardAction(state, players2(), 'p1', last.id);
    expect(state.hands.p1).toHaveLength(2);
    expect(state.winnerId).toBeNull();
    expect(state.status).toBe('playing');
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
  });

  it('allows an extra-turn win after the player calls within the grace', () => {
    const first = card('red', 'skip');
    const last = card('red', '9');
    const state = makeState({ hands: { p1: [first, last], p2: [card('green', '2')] }, rules: lateRules });
    playCardAction(state, players2(), 'p1', first.id);
    callUnoAction(state, 'p1');
    playCardAction(state, players2(), 'p1', last.id);
    expect(state.status).toBe('ended');
    expect(state.winnerId).toBe('p1');
    expect(state.pendingUnoPlayerId).toBeNull();
  });
});

describe('Late UNO with compound card effects', () => {
  it('a legal +4 stays legal when its immediate missed-UNO penalty draws the active color', () => {
    const four = card('wild', 'wild_draw_four');
    const state = makeState({
      hands: { p1: [four, card('blue', '9')], p2: [card('yellow', '2')] },
      discardPile: [card('red', '3')],
      deck: Array.from({ length: 10 }, () => card('red', '8')),
      rules: { challengeWildDrawFour: true, bluffingWildDrawFour: true, unoPenaltyCards: 2 },
    });
    playCardAction(state, players2(), 'p1', four.id);
    expect(state.hands.p1.some((card) => card.color === 'red')).toBe(true);
    expect(state.wildFourWasBluff).toBe(false);
    chooseColorAction(state, players2(), 'p1', 'red');
    challengeWildFourAction(state, players2(), 'p2');
    expect(state.lastAction?.challengeSuccess).toBe(false);
  });

  it('freezes +4 evidence before the same actor\'s older late-UNO debt draws cards', () => {
    const four = card('wild', 'wild_draw_four');
    const state = makeState({
      hands: { p1: [four], p2: [card('yellow', '2')] },
      discardPile: [card('red', '3')], pendingUnoPlayerId: 'p1',
      deck: Array.from({ length: 10 }, () => card('red', '8')),
      rules: { ...lateRules, challengeWildDrawFour: true, bluffingWildDrawFour: true },
    });
    playCardAction(state, players2(), 'p1', four.id);
    expect(state.wildFourWasBluff).toBe(false);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
    chooseColorAction(state, players2(), 'p1', 'red');
    challengeWildFourAction(state, players2(), 'p2');
    expect(state.lastAction?.challengeSuccess).toBe(false);
  });

  it('uses pre-penalty evidence for a force-played drawn +4', () => {
    const four = card('wild', 'wild_draw_four');
    const state = makeState({
      hands: { p1: [card('blue', '9')], p2: [card('yellow', '2')] },
      discardPile: [card('red', '3')], pendingUnoPlayerId: 'p1',
      deck: [four, card('red', '8'), card('red', '8')],
      rules: { ...lateRules, forcePlayDrawnCard: true, challengeWildDrawFour: true, bluffingWildDrawFour: true },
    });
    drawCardAction(state, players2(), 'p1');
    expect(state.wildFourWasBluff).toBe(false);
    expect(state.hands.p1.some((card) => card.color === 'red')).toBe(true);
  });

  it.each(['wild', 'wild_draw_four'] as const)('keeps grace through the %s color choice', (value) => {
    const state = openGrace(value);
    const before = JSON.parse(JSON.stringify(state));
    expect(() => chooseColorAction(state, players3(), 'p1', 'wild')).toThrow();
    expect(() => chooseColorAction(state, players3(), 'p2', 'red')).toThrow();
    expect(state).toEqual(before);
    chooseColorAction(state, players3(), 'p1', 'red');
    expect(state.pendingUnoPlayerId).toBe('p1');
    expect(state.hands.p1).toHaveLength(1);
    callUnoAction(state, 'p1');
    expect(state.pendingUnoPlayerId).toBeNull();
  });

  it.each(['wild', '7'] as const)('allows a late call while the same %s choice is still pending', (value) => {
    const state = openGrace(value);
    expect(state.status).toBe(value === 'wild' ? 'awaiting_color_selection' : 'awaiting_swap_target');
    callUnoAction(state, 'p1');
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.roundStats?.p1.unoCalls).toBe(1);
  });

  it.each([true, false])('settles grace before a %s Wild Draw Four challenge', (successful) => {
    const state = openGrace('wild_draw_four');
    state.wildFourWasBluff = successful;
    chooseColorAction(state, players3(), 'p1', 'red');
    challengeWildFourAction(state, players3(), 'p2');
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.hands.p1).toHaveLength(successful ? 7 : 3);
    expect(state.roundStats?.p1.unoPenalties).toBe(1);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
    expect(state.lastAction?.challengeSuccess).toBe(successful);
  });

  it.each([1, 2])('Seven Swap retains debt only if the original actor still has one card (target=%s)', (count) => {
    const state = openGrace('7');
    state.hands.p2 = Array.from({ length: count }, () => card('red', '8'));
    const before = JSON.parse(JSON.stringify(state));
    expect(() => swapTargetAction(state, players3(), 'p1', 'p1')).toThrow();
    expect(state).toEqual(before);
    swapTargetAction(state, players3(), 'p1', 'p2');
    expect(state.hands.p2).toHaveLength(1);
    expect(state.pendingUnoPlayerId).toBe(count === 1 ? 'p1' : null);
    expect(() => callUnoAction(state, 'p2')).toThrow();
    expect(state.roundStats?.p1.unoPenalties ?? 0).toBe(0);
  });

  it('automatic two-player Seven Swap does not transfer the omitted-call debt', () => {
    const seven = card('red', '7');
    const state = makeState({
      hands: { p1: [seven, card('red', '9')], p2: [card('blue', '1'), card('blue', '2')] },
      rules: { ...lateRules, sevenSwap: true },
    });
    playCardAction(state, players2(), 'p1', seven.id);
    expect(state.hands.p1).toHaveLength(2);
    expect(state.hands.p2).toHaveLength(1);
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(() => callUnoAction(state, 'p2')).toThrow();
  });

  it.each(['clockwise', 'counter-clockwise'] as const)('Zero Rotate keeps grace with its original player in %s play', (direction) => {
    const zero = card('red', '0');
    const state = makeState({
      hands: { p1: [zero, card('red', '9')], p2: [card('blue', '1')], p3: [card('yellow', '8')] },
      direction, rules: { ...lateRules, zeroRotate: true },
    });
    playCardAction(state, players3(), 'p1', zero.id);
    expect(state.pendingUnoPlayerId).toBe('p1');
    expect(state.hands.p1).toHaveLength(1);
    expect(() => callUnoAction(state, direction === 'clockwise' ? 'p2' : 'p3')).toThrow();
    callUnoAction(state, 'p1');
    expect(state.pendingUnoPlayerId).toBeNull();
  });

  it('Zero Rotate cancels grace when the original actor receives more than one card', () => {
    const zero = card('red', '0');
    const state = makeState({
      hands: { p1: [zero, card('red', '9')], p2: [card('blue', '1')], p3: [card('yellow', '8'), card('yellow', '9')] },
      rules: { ...lateRules, zeroRotate: true },
    });
    playCardAction(state, players3(), 'p1', zero.id);
    expect(state.hands.p1).toHaveLength(2);
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.roundStats?.p1.unoPenalties ?? 0).toBe(0);
  });

  it('settles existing debt before the next Seven play transfers the penalized hand', () => {
    const state = openGrace();
    const seven = card('red', '7');
    state.hands.p2 = [seven, card('blue', '1'), card('blue', '2')];
    state.rules.sevenSwap = true;
    playCardAction(state, players3(), 'p2', seven.id);
    expect(state.hands.p1).toHaveLength(3);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
    swapTargetAction(state, players3(), 'p2', 'p1');
    expect(state.hands.p2).toHaveLength(3);
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.roundStats?.p1.unoPenalties).toBe(1);
    expect(state.lastAction?.unoPenalties).toEqual([]);
  });
});

describe('Late UNO automation and round completion', () => {
  it('a forced drawn-card play settles old grace and opens the new actor\'s grace', () => {
    const state = openGrace();
    state.hands.p2 = [card('blue', '9')];
    state.deck = [card('red', '6'), card('green', '3'), card('green', '3')];
    state.rules.forcePlayDrawnCard = true;
    drawCardAction(state, players3(), 'p2');
    expect(state.hands.p1).toHaveLength(3);
    expect(state.hands.p2).toHaveLength(1);
    expect(state.pendingUnoPlayerId).toBe('p2');
    expect(state.lastAction?.type).toBe('play');
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
  });

  it('preserves UNO notification metadata across the timeout draw-and-pass compound action', () => {
    const state = openGrace();
    state.hands.p2 = [card('blue', '9')];
    state.deck = [card('red', '6'), card('green', '3'), card('green', '3')];
    autoResolveTimedOutTurn(state, players3());
    expect(state.currentPlayerId).toBe('p3');
    expect(state.drawnCardId).toBeNull();
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.lastAction?.type).toBe('pass');
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
    expect(state.roundStats?.p1.unoPenalties).toBe(1);
  });

  it('resolves timeout through a legal play when the rules forbid drawing', () => {
    const state = openGrace();
    state.rules.mustPlayIfPlayable = true;
    expect(() => autoResolveTimedOutTurn(state, players3())).not.toThrow();
    expect(state.currentPlayerId).toBe('p3');
    expect(state.pendingUnoPlayerId).toBe('p2');
    expect(state.hands.p1).toHaveLength(3);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
  });

  it('a timeout color choice does not expire the original play\'s grace', () => {
    const state = openGrace('wild');
    autoResolveTimedOutTurn(state, players3());
    expect(state.status).toBe('playing');
    expect(state.pendingUnoPlayerId).toBe('p1');
    expect(state.roundStats?.p1.unoPenalties ?? 0).toBe(0);
  });

  it('includes the old missed-call penalty in the final round score', () => {
    const first = card('red', '5');
    const last = card('red', '6');
    const state = makeState({ hands: { p1: [first, card('red', '9')], p2: [last] }, rules: lateRules });
    playCardAction(state, players2(), 'p1', first.id);
    playCardAction(state, players2(), 'p2', last.id);
    expect(state.status).toBe('ended');
    expect(state.winnerId).toBe('p2');
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(calculateRoundPoints(state.hands, 'p2')).toBe(15);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 2 }]);
  });

  it('settles new bot grace before a round with only bots left is finalized', () => {
    const players: Player[] = players3().map((player) => ({ ...player, isBot: player.id !== 'p1' }));
    const played = card('red', '5');
    const state = makeState({
      hands: { p1: [], p2: [played, card('blue', '8')], p3: [card('green', '2')] },
      currentPlayerId: 'p2', winnerId: 'p1', rules: lateRules,
    });
    playCardAction(state, players, 'p2', played.id);
    expect(state.status).toBe('ended');
    expect(state.winnerId).toBe('p1');
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.hands.p2).toHaveLength(3);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p2', drawCount: 2 }]);
  });

  it('settles debt once even when the exhausted deck cannot produce penalty cards', () => {
    const first = card('red', '5');
    const last = card('red', '6');
    const state = makeState({
      hands: { p1: [first, card('red', '9')], p2: [last] }, deck: [],
      rules: { ...lateRules, autoReshuffle: false },
    });
    playCardAction(state, players2(), 'p1', first.id);
    playCardAction(state, players2(), 'p2', last.id);
    expect(state.pendingUnoPlayerId).toBeNull();
    expect(state.roundStats?.p1.unoPenalties).toBe(1);
    expect(state.lastAction?.unoPenalties).toEqual([{ playerId: 'p1', drawCount: 0 }]);
  });
});
