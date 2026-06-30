import { describe, it, expect } from 'vitest';
import {
  startGameState,
  playCardAction,
  drawCardAction,
  passTurnAction,
  chooseColorAction,
  callUnoAction,
} from '../game/actions';
import { isValidMove } from '../game/rules';
import { card, players2, players3, makeState, handCount } from '../test/helpers';

describe('startGameState', () => {
  it('requires at least 2 players', () => {
    expect(() => startGameState([players2()[0]])).toThrow(/at least 2/i);
  });

  it('deals 7 cards to each player and reveals one discard', () => {
    const s = startGameState(players2());
    expect(handCount(s, 'p1')).toBe(7);
    expect(handCount(s, 'p2')).toBe(7);
    expect(s.discardPile).toHaveLength(1);
    expect(s.status).toMatch(/playing|awaiting_color_selection/);
  });

  it('never starts on a wild or +4 discard', () => {
    for (let i = 0; i < 25; i++) {
      const top = startGameState(players3()).discardPile[0];
      expect(top.color).not.toBe('wild');
      expect(top.value).not.toBe('wild_draw_four');
    }
  });

  it('conserves total card count (108)', () => {
    const s = startGameState(players3());
    const inHands = Object.values(s.hands).reduce((n, h) => n + h.length, 0);
    expect(inHands + s.deck.length + s.discardPile.length).toBe(108);
  });
});

describe('playCardAction — turn & validation guards', () => {
  it('rejects a play when it is not your turn', () => {
    const c = card('red', '5');
    const s = makeState({ hands: { p1: [c], p2: [] }, currentPlayerId: 'p2' });
    expect(() => playCardAction(s, players2(), 'p1', c.id)).toThrow(/not your turn/i);
  });

  it('rejects a card not in hand', () => {
    const s = makeState({ hands: { p1: [card('red', '5')], p2: [] } });
    expect(() => playCardAction(s, players2(), 'p1', 'ghost')).toThrow(/not found/i);
  });

  it('rejects an invalid move (color & value mismatch)', () => {
    const c = card('blue', '9');
    const s = makeState({ hands: { p1: [c], p2: [] }, discardPile: [card('red', '3')] });
    expect(() => playCardAction(s, players2(), 'p1', c.id)).toThrow(/invalid move/i);
  });

  it('a valid number card advances the turn to the next player', () => {
    const c = card('red', '7');
    const s = makeState({
      hands: { p1: [c, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const next = playCardAction(s, players2(), 'p1', c.id);
    expect(next.currentPlayerId).toBe('p2');
    expect(next.discardPile[next.discardPile.length - 1].id).toBe(c.id);
  });
});

describe('playCardAction — action cards (2-player)', () => {
  it('skip gives the same player another turn in 2-player', () => {
    const skip = card('red', 'skip');
    const s = makeState({
      hands: { p1: [skip, card('blue', '4')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const next = playCardAction(s, players2(), 'p1', skip.id);
    expect(next.currentPlayerId).toBe('p1');
  });

  it('reverse flips direction and acts like skip in 2-player', () => {
    const rev = card('red', 'reverse');
    const s = makeState({
      hands: { p1: [rev, card('blue', '4')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      direction: 'clockwise',
    });
    const next = playCardAction(s, players2(), 'p1', rev.id);
    expect(next.direction).toBe('counter-clockwise');
    expect(next.currentPlayerId).toBe('p1');
  });
});

describe('playCardAction — winning', () => {
  it('playing the last card ends the game with that player as winner', () => {
    const last = card('red', '7');
    const s = makeState({ hands: { p1: [last], p2: [card('green', '2')] }, discardPile: [card('red', '3')] });
    const next = playCardAction(s, players2(), 'p1', last.id);
    expect(next.status).toBe('ended');
    expect(next.winnerId).toBe('p1');
  });
});

describe('Auto UNO penalty', () => {
  it('+4 penalty when a play drops you to 1 card without calling UNO', () => {
    const play = card('red', '7');
    const s = makeState({
      hands: { p1: [play, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const next = playCardAction(s, players2(), 'p1', play.id);
    // 2 cards -> play 1 -> would be 1 -> +4 penalty -> 5
    expect(handCount(next, 'p1')).toBe(5);
    expect(next.lastAction?.unoPenalty).toBe(true);
  });

  it('no penalty when UNO was declared at 2 cards', () => {
    const play = card('red', '7');
    const s = makeState({
      hands: { p1: [play, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    callUnoAction(s, 'p1');
    const next = playCardAction(s, players2(), 'p1', play.id);
    expect(handCount(next, 'p1')).toBe(1);
    expect(next.lastAction?.unoPenalty).toBeFalsy();
  });

  it('callUnoAction throws when holding more than 2 cards', () => {
    const s = makeState({ hands: { p1: [card('red', '1'), card('red', '2'), card('red', '3')], p2: [] } });
    expect(() => callUnoAction(s, 'p1')).toThrow(/more than 2/i);
  });
});

describe('Draw-card stacking (+2/+4 chain)', () => {
  it('playing a +2 opens a chain of 2 and passes the turn', () => {
    const d2 = card('red', 'draw_two');
    const s = makeState({
      hands: { p1: [d2, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const next = playCardAction(s, players2(), 'p1', d2.id);
    expect(next.drawStack).toBe(2);
    expect(next.pendingDrawType).toBe('draw_two');
    expect(next.currentPlayerId).toBe('p2');
  });

  it('stacking +2 on +2 accumulates to 4', () => {
    const myD2 = card('blue', 'draw_two');
    const s = makeState({
      hands: { p2: [myD2, card('green', '9')], p1: [card('red', '1')] },
      discardPile: [card('red', 'draw_two')],
      currentPlayerId: 'p2',
      drawStack: 2,
      pendingDrawType: 'draw_two',
    });
    const next = playCardAction(s, players2(), 'p2', myD2.id);
    expect(next.drawStack).toBe(4);
    expect(next.pendingDrawType).toBe('draw_two');
  });

  it('cannot stack +2 onto a +4 chain', () => {
    const myD2 = card('red', 'draw_two');
    const s = makeState({
      hands: { p2: [myD2, card('green', '9')], p1: [] },
      discardPile: [card('wild', 'wild_draw_four')],
      currentPlayerId: 'p2',
      wildColor: 'red',
      drawStack: 4,
      pendingDrawType: 'wild_draw_four',
    });
    expect(() => playCardAction(s, players2(), 'p2', myD2.id)).toThrow(/\+2 on a \+4/i);
  });

  it('drawing into an active chain eats the whole stack and skips the player', () => {
    const s = makeState({
      hands: { p2: [card('green', '9')], p1: [card('red', '1')] },
      discardPile: [card('red', 'draw_two')],
      currentPlayerId: 'p2',
      drawStack: 6,
      pendingDrawType: 'draw_two',
    });
    const next = drawCardAction(s, players2(), 'p2');
    expect(handCount(next, 'p2')).toBe(1 + 6);
    expect(next.drawStack).toBe(0);
    expect(next.pendingDrawType).toBeNull();
    // p2 ate the stack and is skipped; in 2-player that returns to p1.
    expect(next.currentPlayerId).toBe('p1');
  });
});

describe('Wild / Wild +4 color selection', () => {
  it('playing a wild awaits color selection without advancing', () => {
    const w = card('wild', 'wild');
    const s = makeState({
      hands: { p1: [w, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const next = playCardAction(s, players2(), 'p1', w.id);
    expect(next.status).toBe('awaiting_color_selection');
    expect(next.colorChooserId).toBe('p1');
    expect(next.currentPlayerId).toBe('p1');
  });

  it('chooseColor sets the active color and advances after a plain wild', () => {
    const w = card('wild', 'wild');
    const s = makeState({
      hands: { p1: [w, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const afterPlay = playCardAction(s, players2(), 'p1', w.id);
    const afterColor = chooseColorAction(afterPlay, players2(), 'p1', 'green');
    expect(afterColor.wildColor).toBe('green');
    expect(afterColor.status).toBe('playing');
    expect(afterColor.currentPlayerId).toBe('p2');
  });

  it('a +4 banks 4 into the chain and passes the turn after color choice', () => {
    const w4 = card('wild', 'wild_draw_four');
    const s = makeState({
      hands: { p1: [w4, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const afterPlay = playCardAction(s, players2(), 'p1', w4.id);
    expect(afterPlay.drawStack).toBe(4);
    expect(afterPlay.pendingDrawType).toBe('wild_draw_four');
    const afterColor = chooseColorAction(afterPlay, players2(), 'p1', 'red');
    expect(afterColor.currentPlayerId).toBe('p2');
    // p2 hasn't drawn yet — the stack is still pending for them to stack or eat.
    expect(afterColor.drawStack).toBe(4);
  });

  it('chooseColor rejects wild as a color and the wrong chooser', () => {
    const w = card('wild', 'wild');
    const s = makeState({
      hands: { p1: [w, card('blue', '1')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
    });
    const afterPlay = playCardAction(s, players2(), 'p1', w.id);
    expect(() => chooseColorAction(afterPlay, players2(), 'p1', 'wild')).toThrow(/specific color/i);
    expect(() => chooseColorAction(afterPlay, players2(), 'p2', 'red')).toThrow(/not authorized/i);
  });
});

describe('Draw-then-play decision window', () => {
  it('drawing a playable card keeps the turn and opens the decision', () => {
    // p1 holds only a blue-9 (not playable on red-3); draws a red card on top.
    const s = makeState({
      hands: { p1: [card('blue', '9')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      deck: [card('red', '8')], // the next pop() — playable
    });
    const next = drawCardAction(s, players2(), 'p1');
    expect(next.currentPlayerId).toBe('p1'); // turn kept
    expect(next.drawnCardId).not.toBeNull();
    const drawn = next.hands['p1'].find((c) => c.id === next.drawnCardId)!;
    expect(isValidMove(drawn, next.discardPile[next.discardPile.length - 1], next.wildColor, next.pendingDrawType)).toBe(true);
  });

  it('drawing an unplayable card with an unplayable hand passes the turn', () => {
    const s = makeState({
      hands: { p1: [card('blue', '9')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      deck: [card('green', '7')], // not playable on red-3, and hand has none
    });
    const next = drawCardAction(s, players2(), 'p1');
    expect(next.currentPlayerId).toBe('p2');
    expect(next.drawnCardId).toBeNull();
  });

  it('cannot draw twice during the decision window', () => {
    const s = makeState({
      hands: { p1: [card('red', '5')], p2: [] },
      discardPile: [card('red', '3')],
      drawnCardId: 'someid',
    });
    expect(() => drawCardAction(s, players2(), 'p1')).toThrow(/already drew/i);
  });

  it('passTurnAction advances and clears the decision', () => {
    const s = makeState({
      hands: { p1: [card('red', '5')], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      drawnCardId: 'someid',
    });
    const next = passTurnAction(s, players2(), 'p1');
    expect(next.drawnCardId).toBeNull();
    expect(next.currentPlayerId).toBe('p2');
    expect(next.lastAction?.type).toBe('pass');
  });

  it('passTurnAction is illegal without an open decision', () => {
    const s = makeState({ hands: { p1: [card('red', '5')], p2: [] } });
    expect(() => passTurnAction(s, players2(), 'p1')).toThrow(/only pass after drawing/i);
  });

  it('during the decision the player may play ANY valid card (house rule)', () => {
    const held = card('red', '6'); // playable on red-3, was held back
    const drawn = card('green', '9');
    const s = makeState({
      hands: { p1: [held, drawn], p2: [card('green', '2')] },
      discardPile: [card('red', '3')],
      drawnCardId: drawn.id,
    });
    const next = playCardAction(s, players2(), 'p1', held.id);
    expect(next.drawnCardId).toBeNull();
    expect(next.currentPlayerId).toBe('p2');
  });
});
