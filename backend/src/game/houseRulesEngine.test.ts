import { describe, it, expect } from 'vitest';
import {
  playCardAction,
  drawCardAction,
  jumpInAction,
  swapTargetAction,
  callUnoAction,
} from './actions';
import { card, players2, players3, makeState, handCount } from '../test/helpers';

describe('Stacking disabled — draw cards resolve immediately', () => {
  it('a +2 makes the next player draw 2 and skips them', () => {
    const d2 = card('red', 'draw_two');
    const s = makeState({
      hands: { p1: [d2, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { stacking: false },
    });
    const next = playCardAction(s, players2(), 'p1', d2.id);
    expect(next.drawStack).toBe(0);
    expect(next.pendingDrawType).toBeNull();
    expect(handCount(next, 'p2')).toBe(3); // 1 + 2 drawn
    // 2-player skip returns to p1
    expect(next.currentPlayerId).toBe('p1');
  });
});

describe('Finishing restrictions', () => {
  it('blocks winning on an action card when disallowed', () => {
    const skip = card('red', 'skip');
    const s = makeState({
      hands: { p1: [skip], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { allowWinWithActionCard: false },
    });
    expect(() => playCardAction(s, players2(), 'p1', skip.id)).toThrow(/cannot win/i);
  });

  it('numberCardFinishOnly blocks winning on a wild', () => {
    const w = card('wild', 'wild');
    const s = makeState({
      hands: { p1: [w], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { numberCardFinishOnly: true },
    });
    expect(() => playCardAction(s, players2(), 'p1', w.id)).toThrow(/cannot win/i);
  });

  it('still allows winning on a number card', () => {
    const n = card('red', '7');
    const s = makeState({
      hands: { p1: [n], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { numberCardFinishOnly: true, allowWinWithActionCard: false },
    });
    const next = playCardAction(s, players2(), 'p1', n.id);
    expect(next.status).toBe('ended');
    expect(next.winnerId).toBe('p1');
  });
});

describe('UNO calling modes', () => {
  it('auto mode never penalizes forgetting UNO', () => {
    const play = card('red', '7');
    const s = makeState({
      hands: { p1: [play, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { mustSayUno: true, unoCallMode: 'auto' },
    });
    const next = playCardAction(s, players2(), 'p1', play.id);
    expect(handCount(next, 'p1')).toBe(1); // no penalty
    expect(next.unoCalled['p1']).toBe(true); // server declared it
  });

  it('mustSayUno off never penalizes', () => {
    const play = card('red', '7');
    const s = makeState({
      hands: { p1: [play, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { mustSayUno: false },
    });
    const next = playCardAction(s, players2(), 'p1', play.id);
    expect(handCount(next, 'p1')).toBe(1);
  });

  it('configurable penalty count is respected', () => {
    const play = card('red', '7');
    const s = makeState({
      hands: { p1: [play, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { mustSayUno: true, unoCallMode: 'manual', unoPenaltyCards: 2 },
    });
    const next = playCardAction(s, players2(), 'p1', play.id);
    // 2 cards -> play 1 -> 1 -> +2 penalty -> 3
    expect(handCount(next, 'p1')).toBe(3);
  });

  it('late UNO can be declared at exactly 1 card when allowed', () => {
    const s = makeState({
      hands: { p1: [card('red', '5')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { mustSayUno: true, unoCallMode: 'manual', allowLateUno: true },
    });
    expect(() => callUnoAction(s, 'p1')).not.toThrow();
    expect(s.unoCalled['p1']).toBe(true);
  });
});

describe('Reverse-as-skip toggle (2-player)', () => {
  it('when disabled, reverse just passes to the other player', () => {
    const rev = card('red', 'reverse');
    const s = makeState({
      hands: { p1: [rev, card('blue', '4')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      rules: { reverseAsSkipInTwoPlayer: false },
    });
    const next = playCardAction(s, players2(), 'p1', rev.id);
    expect(next.currentPlayerId).toBe('p2');
  });
});

describe('Seven-O rules', () => {
  it('playing a 0 rotates all hands in play direction', () => {
    const zero = card('red', '0');
    const s = makeState({
      hands: {
        p1: [zero, card('blue', '4')], // will keep blue-4 after playing 0
        p2: [card('green', '2'), card('green', '3')],
        p3: [card('yellow', '5')],
      },
      discardPile: [card('red', '3')],
      currentPlayerId: 'p1',
      rules: { zeroRotate: true, mustSayUno: false },
    });
    const next = playCardAction(s, players3(), 'p1', zero.id);
    // clockwise rotate: each hand comes from the previous seat.
    // p1 had [blue-4] left, p2 had 2, p3 had 1.
    expect(next.lastAction?.type).toBe('rotate');
    expect(handCount(next, 'p1')).toBe(1); // from p3 (1 card)
    expect(handCount(next, 'p2')).toBe(1); // from p1 (1 card left)
    expect(handCount(next, 'p3')).toBe(2); // from p2 (2 cards)
  });

  it('playing a 7 in a 2-player game auto-swaps hands', () => {
    const seven = card('red', '7');
    const s = makeState({
      hands: { p1: [seven, card('blue', '4')], p2: [card('green', '2'), card('green', '3'), card('green', '5')] },
      discardPile: [card('red', '3')],
      rules: { sevenSwap: true, mustSayUno: false },
    });
    const next = playCardAction(s, players2(), 'p1', seven.id);
    expect(next.lastAction?.type).toBe('swap');
    // p1 played the 7 (1 left) then took p2's 3-card hand.
    expect(handCount(next, 'p1')).toBe(3);
    expect(handCount(next, 'p2')).toBe(1);
  });

  it('playing a 7 with multiple opponents awaits a swap target', () => {
    const seven = card('red', '7');
    const s = makeState({
      hands: {
        p1: [seven, card('blue', '4')],
        p2: [card('green', '2')],
        p3: [card('yellow', '5')],
      },
      discardPile: [card('red', '3')],
      currentPlayerId: 'p1',
      rules: { sevenSwap: true, mustSayUno: false },
    });
    const afterPlay = playCardAction(s, players3(), 'p1', seven.id);
    expect(afterPlay.status).toBe('awaiting_swap_target');
    expect(afterPlay.swapChooserId).toBe('p1');

    const afterSwap = swapTargetAction(afterPlay, players3(), 'p1', 'p3');
    expect(afterSwap.status).toBe('playing');
    expect(handCount(afterSwap, 'p1')).toBe(1); // took p3's single card
    expect(handCount(afterSwap, 'p3')).toBe(1); // received p1's leftover
  });
});

describe('Jump-In', () => {
  it('lets an out-of-turn player jump in with an identical card', () => {
    const jump = card('red', '5');
    const s = makeState({
      hands: {
        p1: [card('blue', '1')], // p1 is current but not jumping
        p2: [jump, card('green', '9')],
        p3: [card('yellow', '4')],
      },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { jumpIn: true },
    });
    const next = jumpInAction(s, players3(), 'p2', jump.id);
    expect(next.discardPile[next.discardPile.length - 1].id).toBe(jump.id);
    // p2 jumped in, then turn advances from p2 -> p3
    expect(next.currentPlayerId).toBe('p3');
  });

  it('rejects a non-identical jump-in', () => {
    const jump = card('red', '9'); // value mismatch
    const s = makeState({
      hands: { p1: [card('blue', '1')], p2: [jump] },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { jumpIn: true },
    });
    expect(() => jumpInAction(s, players2(), 'p2', jump.id)).toThrow(/identical/i);
  });

  it('rejects jump-in when the rule is off', () => {
    const jump = card('red', '5');
    const s = makeState({
      hands: { p1: [card('blue', '1')], p2: [jump] },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { jumpIn: false },
    });
    expect(() => jumpInAction(s, players2(), 'p2', jump.id)).toThrow(/not enabled/i);
  });
});

describe('Draw-flow rules', () => {
  it('mustPlayIfPlayable blocks drawing when a playable card is held', () => {
    const s = makeState({
      hands: { p1: [card('red', '8')], p2: [card('green', '2')] }, // red-8 playable on red-3
      discardPile: [card('red', '3')],
      rules: { mustPlayIfPlayable: true },
    });
    expect(() => drawCardAction(s, players2(), 'p1')).toThrow(/must play/i);
  });

  it('drawThenPlay off passes the turn even if the drawn card is playable', () => {
    const s = makeState({
      hands: { p1: [card('blue', '9')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      deck: [card('red', '8')], // playable, but drawThenPlay is off
      rules: { drawThenPlay: false },
    });
    const next = drawCardAction(s, players2(), 'p1');
    expect(next.drawnCardId).toBeNull();
    expect(next.currentPlayerId).toBe('p2');
  });

  it('drawUntilPlayable keeps drawing until a playable card appears', () => {
    const s = makeState({
      hands: { p1: [card('blue', '9')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      // deck.pop() order: green-7 (no), green-8 (no), red-1 (yes!)
      deck: [card('red', '1'), card('green', '8'), card('green', '7')],
      rules: { drawUntilPlayable: true, drawThenPlay: true },
    });
    const next = drawCardAction(s, players2(), 'p1');
    // drew 3 cards until red-1 became playable; turn kept for the decision.
    expect(handCount(next, 'p1')).toBe(4);
    expect(next.currentPlayerId).toBe('p1');
    expect(next.drawnCardId).not.toBeNull();
  });

  it('forcePlayDrawnCard auto-plays a drawn playable card', () => {
    const s = makeState({
      hands: { p1: [card('blue', '9')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      deck: [card('red', '8')], // playable — should be auto-played
      rules: { drawThenPlay: true, forcePlayDrawnCard: true },
    });
    const next = drawCardAction(s, players2(), 'p1');
    expect(next.discardPile[next.discardPile.length - 1].value).toBe('8');
    expect(next.currentPlayerId).toBe('p2'); // turn advanced after the forced play
  });
});

describe('Wild Draw Four challenge', () => {
  it('a successful challenge makes the bluffer draw and keeps the challenger turn', () => {
    // p1 holds a red card AND a +4; top is red -> playing +4 is a bluff.
    const w4 = card('wild', 'wild_draw_four');
    const s = makeState({
      hands: { p1: [w4, card('red', '9')], p2: [card('green', '2'), card('green', '3')] },
      discardPile: [card('red', '5')],
      currentPlayerId: 'p1',
      rules: { challengeWildDrawFour: true, bluffingWildDrawFour: true, stacking: true, mustSayUno: false },
    });
    const afterPlay = playCardAction(s, players2(), 'p1', w4.id);
    expect(afterPlay.wildFourWasBluff).toBe(true);
    // p1 chooses a color, turn passes to p2 who may challenge
    const afterColor = playCardActionColor(afterPlay);
    const challenged = challenge(afterColor, 'p2');
    // bluff caught: accused p1 draws the stack (4); challenger p2 keeps the turn
    expect(handCount(challenged, 'p1')).toBe(1 + 4);
    expect(challenged.currentPlayerId).toBe('p2');
    expect(challenged.pendingDrawType).toBeNull();
  });
});

// --- small helpers local to the challenge test ---------------------------------
import { chooseColorAction, challengeWildFourAction } from './actions';
function playCardActionColor(state: any) {
  return chooseColorAction(state, players2(), 'p1', 'green');
}
function challenge(state: any, id: string) {
  return challengeWildFourAction(state, players2(), id);
}
