import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotRunner } from './botRunner';
import { card, makeState, players2 } from '../test/helpers';
import type { Room } from '../rooms/roomManager';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

describe('bot UNO decisions', () => {
  it.each(['p1', 'p2'])('calls pending bot grace once while %s owns the turn', (currentPlayerId) => {
    vi.useFakeTimers();
    const players = players2();
    players[1].isBot = true;
    const game = makeState({
      currentPlayerId, pendingUnoPlayerId: 'p2',
      hands: { p1: [card('blue', '2')], p2: [card('red', '7')] },
      rules: { allowLateUno: true },
    });
    const room: Room = { code: 'LATE01', hostId: 'p1', players, status: 'playing', houseRules: game.rules, game };
    const called = vi.fn();
    let runner: BotRunner;
    const changed = vi.fn(() => runner.onStateChanged(room.code));
    runner = new BotRunner({ getRoom: () => room, onGameChanged: changed, onUnoCalled: called });
    runner.onStateChanged(room.code);
    runner.onStateChanged(room.code);

    expect(game.pendingUnoPlayerId).toBeNull();
    expect(game.unoCalled.p2).toBe(true);
    expect(game.roundStats?.p2.unoCalls).toBe(1);
    expect(called).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(currentPlayerId === 'p2' ? 1 : 0);
    runner.shutdown();
  });

  it('pre-calls UNO before a second-to-last jump-in and schedules only one reaction', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const players = players2();
    players[1].isBot = true;
    const identical = card('red', '5');
    const game = makeState({
      currentPlayerId: 'p1',
      hands: { p1: [card('blue', '2')], p2: [identical, card('blue', '4')] },
      discardPile: [card('red', '5')], rules: { jumpIn: true },
    });
    const room: Room = { code: 'JUMP01', hostId: 'p1', players, status: 'playing', houseRules: game.rules, game };
    const called = vi.fn();
    const changed = vi.fn();
    const runner = new BotRunner({ getRoom: () => room, onGameChanged: changed, onUnoCalled: called });
    runner.onStateChanged(room.code);
    runner.onStateChanged(room.code);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(900);

    expect(game.hands.p2).toHaveLength(1);
    expect(game.unoCalled.p2).toBe(true);
    expect(game.roundStats?.p2.unoPenalties ?? 0).toBe(0);
    expect(game.roundStats?.p2.unoCalls).toBe(1);
    expect(game.roundStats?.p2.jumpIns).toBe(1);
    expect(called).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    runner.shutdown();
  });

  it('never automatically calls a human\'s pending UNO grace', () => {
    vi.useFakeTimers();
    const players = players2();
    players[1].isBot = true;
    const game = makeState({
      currentPlayerId: 'p1', pendingUnoPlayerId: 'p1',
      hands: { p1: [card('blue', '2')], p2: [card('red', '7')] }, rules: { allowLateUno: true },
    });
    const room: Room = { code: 'HUMAN1', hostId: 'p1', players, status: 'playing', houseRules: game.rules, game };
    const called = vi.fn();
    const runner = new BotRunner({ getRoom: () => room, onGameChanged: vi.fn(), onUnoCalled: called });
    runner.onStateChanged(room.code);
    expect(game.pendingUnoPlayerId).toBe('p1');
    expect(called).not.toHaveBeenCalled();
    runner.shutdown();
  });
});
