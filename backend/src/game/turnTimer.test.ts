import { describe, expect, it } from 'vitest';
import { callUnoAction, chooseColorAction, drawCardAction, passTurnAction, playCardAction } from './actions';
import { turnSignatureOf } from './turnTimer';
import { card, makeState, players2 } from '../test/helpers';

describe('turn timer identity', () => {
  it.each(['skip', 'reverse', 'draw_two'] as const)('starts a new timed turn after a two-player %s', (value) => {
    const actionCard = card('red', value);
    const players = players2();
    const game = makeState({
      hands: { p1: [actionCard, card('blue', '8')], p2: [card('green', '2')] },
      rules: { mustSayUno: false, stacking: false },
    });
    const before = turnSignatureOf(game, players);
    playCardAction(game, players, 'p1', actionCard.id);
    expect(game.currentPlayerId).toBe('p1');
    expect(game.turnNumber).toBe(1);
    expect(turnSignatureOf(game, players)).not.toBe(before);
  });

  it('keeps the same timer for an UNO call, repeated broadcast, or socket rebind', () => {
    const players = players2();
    const game = makeState({ hands: { p1: [card('blue', '8'), card('red', '2')], p2: [card('green', '2')] } });
    const before = turnSignatureOf(game, players);
    callUnoAction(game, 'p1');
    expect(turnSignatureOf(game, players)).toBe(before);
    const restored = JSON.parse(JSON.stringify(game));
    expect(turnSignatureOf(restored, players)).toBe(before);
    players[0].id = 'reconnected-p1';
    game.currentPlayerId = players[0].id;
    expect(turnSignatureOf(game, players)).toBe(before);
  });

  it('times the draw decision separately and starts a new turn after passing', () => {
    const players = players2();
    const drawn = card('red', '2');
    const game = makeState({
      hands: { p1: [card('blue', '8')], p2: [card('green', '2')] },
      deck: [drawn], rules: { mustSayUno: false, forcePlayDrawnCard: false, drawThenPlay: true },
    });
    const before = turnSignatureOf(game, players);
    drawCardAction(game, players, 'p1');
    const decision = turnSignatureOf(game, players);
    expect(game.drawnCardId).toBe(drawn.id);
    expect(decision).not.toBe(before);
    expect(turnSignatureOf(game, players)).toBe(decision);
    passTurnAction(game, players, 'p1');
    expect(turnSignatureOf(game, players)).not.toBe(decision);
    expect(game.turnNumber).toBe(1);
  });

  it('starts a fresh timer when a forced drawn Skip gives the same player another turn', () => {
    const players = players2();
    const skip = card('red', 'skip');
    const game = makeState({
      hands: { p1: [card('blue', '8')], p2: [card('green', '2')] },
      deck: [skip], rules: { mustSayUno: false, forcePlayDrawnCard: true },
    });
    const before = turnSignatureOf(game, players);
    drawCardAction(game, players, 'p1');
    expect(game.currentPlayerId).toBe('p1');
    expect(game.turnNumber).toBe(1);
    expect(turnSignatureOf(game, players)).not.toBe(before);
  });

  it('retains a color decision through reconnect and times the following turn separately', () => {
    const players = players2();
    const wild = card('wild', 'wild');
    const game = makeState({
      hands: { p1: [wild, card('blue', '8')], p2: [card('green', '2')] },
      rules: { mustSayUno: false },
    });
    const before = turnSignatureOf(game, players);
    playCardAction(game, players, 'p1', wild.id);
    const decision = turnSignatureOf(game, players);
    expect(decision).not.toBe(before);
    players[0].id = 'reconnected-p1';
    game.currentPlayerId = players[0].id;
    game.colorChooserId = players[0].id;
    game.hands[players[0].id] = game.hands.p1;
    delete game.hands.p1;
    expect(turnSignatureOf(game, players)).toBe(decision);
    chooseColorAction(game, players, players[0].id, 'red');
    expect(game.currentPlayerId).toBe('p2');
    expect(turnSignatureOf(game, players)).not.toBe(decision);
  });
});
