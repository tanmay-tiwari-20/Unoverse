import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotRunner } from './botRunner';
import { card, makeState, players2 } from '../test/helpers';
import type { Room } from '../rooms/roomManager';

afterEach(() => vi.useRealTimers());

describe('bot shutdown', () => {
  it('cancels pending actions and cannot schedule new actions during persistence drain', () => {
    vi.useFakeTimers();
    const players = players2();
    players[1].isBot = true;
    const game = makeState({
      currentPlayerId: 'p2',
      hands: { p1: [card('blue', '2')], p2: [card('red', '7'), card('blue', '4')] },
    });
    const room: Room = { code: 'TEST01', hostId: 'p1', players, status: 'playing', houseRules: game.rules, game };
    const changed = vi.fn();
    const runner = new BotRunner({ getRoom: () => room, onGameChanged: changed });
    runner.onStateChanged(room.code);
    expect(vi.getTimerCount()).toBe(1);
    runner.shutdown();
    runner.onStateChanged(room.code);
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(changed).not.toHaveBeenCalled();
    expect(game.hands.p2).toHaveLength(2);
  });
});
