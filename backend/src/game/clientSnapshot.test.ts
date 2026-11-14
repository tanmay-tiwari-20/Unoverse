import { describe, expect, it } from 'vitest';
import { createGameSnapshot } from './clientSnapshot';
import { drawCardAction } from './actions';
import { card, makeState, players2 } from '../test/helpers';
import type { Room } from '../rooms/roomManager';

function drawnCardRoom(): Room {
  const players = players2();
  const drawn = card('red', '7');
  const state = makeState({
    hands: { p1: [card('blue', '2')], p2: [card('green', '8')] },
    deck: [drawn],
  });
  const game = drawCardAction(state, players, 'p1');
  return {
    code: 'TEST01', hostId: 'p1', players, status: 'playing',
    houseRules: game.rules, game,
  };
}

describe('recipient game snapshots', () => {
  it('reveals the draw decision only to the player who drew the card', () => {
    const room = drawnCardRoom();
    expect(room.game!.drawnCardId).not.toBeNull();
    const owner = createGameSnapshot(room, 'p1');
    const opponent = createGameSnapshot(room, 'p2');
    const spectator = createGameSnapshot(room, null);

    expect(owner.drawnCardId).toBe(room.game!.drawnCardId);
    expect(owner.hand).toEqual(room.game!.hands.p1);
    expect(opponent.drawnCardId).toBeNull();
    expect(opponent.hand).toEqual(room.game!.hands.p2);
    expect(spectator.drawnCardId).toBeNull();
    expect(spectator.hand).toEqual([]);
    expect(spectator.ownSeat).toBeNull();
    expect(JSON.stringify(opponent)).not.toContain(room.game!.drawnCardId!);
    expect(JSON.stringify(spectator)).not.toContain(room.game!.drawnCardId!);
  });

  it('does not expose hands to an unseated or stale socket', () => {
    const room = drawnCardRoom();
    room.game!.hands.stale = [card('yellow', '9')];
    const snapshot = createGameSnapshot(room, 'stale');
    expect(snapshot.hand).toEqual([]);
    expect(snapshot.ownSeat).toBeNull();
    expect(snapshot.drawnCardId).toBeNull();
  });

  it('withholds secrets, the draw pile and private challenge context', () => {
    const room = drawnCardRoom();
    room.game!.wildFourWasBluff = true;
    const snapshot = createGameSnapshot(room, 'p2');
    expect(snapshot).not.toHaveProperty('deck');
    expect(snapshot).not.toHaveProperty('hands');
    expect(snapshot).not.toHaveProperty('wildFourWasBluff');
    expect(snapshot).not.toHaveProperty('roundStats');
    expect(JSON.stringify(snapshot)).not.toContain('"secret"');
    expect(snapshot.handCounts).toEqual({ 1: 2, 2: 1 });
  });
});
