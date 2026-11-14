import { describe, expect, it, vi } from 'vitest';
import { UnoPenaltyNotifier } from './unoNotifications';
import { card, makeState, players2 } from '../test/helpers';
import type { Room } from '../rooms/roomManager';

function room(): Room {
  const game = makeState({ hands: { p1: [card('red', '7')], p2: [card('blue', '8')] } });
  return { code: 'TEST01', hostId: 'p1', players: players2(), status: 'playing', houseRules: game.rules, game };
}

describe('UNO penalty notices', () => {
  it('reports the penalized player and actual count even when another player acted', () => {
    const table = room();
    table.game!.lastAction = {
      type: 'draw', playerId: 'p2', unoPenalties: [{ playerId: 'p1', drawCount: 2 }],
    };
    const emit = vi.fn();
    new UnoPenaltyNotifier(emit).announce(table);
    expect(emit).toHaveBeenCalledExactlyOnceWith('TEST01', { playerId: 'p1', playerName: 'Alice', drawCount: 2 });
  });

  it('does not duplicate notices on repeated snapshots or reconnect remapping', () => {
    const table = room();
    const action = { type: 'play' as const, playerId: 'p2', unoPenalties: [{ playerId: 'p1', drawCount: 3 }] };
    table.game!.lastAction = action;
    const emit = vi.fn();
    const notifier = new UnoPenaltyNotifier(emit);
    notifier.announce(table);
    table.players[0].id = 'reconnected';
    action.unoPenalties[0].playerId = 'reconnected';
    notifier.announce(table);
    expect(emit).toHaveBeenCalledTimes(1);
    table.game!.lastAction = { type: 'pass', playerId: 'p2', unoPenalties: [{ playerId: 'reconnected', drawCount: 1 }] };
    notifier.announce(table);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('does not replay a stored penalty when a restored room is first joined', () => {
    const table = room();
    table.game!.lastAction = { type: 'play', playerId: 'p1', unoPenalty: true };
    const emit = vi.fn();
    const notifier = new UnoPenaltyNotifier(emit);
    notifier.remember(table.game);
    notifier.announce(table);
    expect(emit).not.toHaveBeenCalled();
  });

  it('preserves zero-card notices and uses the configured count for legacy actions', () => {
    const table = room();
    const emit = vi.fn();
    const notifier = new UnoPenaltyNotifier(emit);
    table.game!.lastAction = { type: 'draw', playerId: 'p2', unoPenalties: [{ playerId: 'p1', drawCount: 0 }] };
    notifier.announce(table);
    expect(emit).toHaveBeenLastCalledWith('TEST01', { playerId: 'p1', playerName: 'Alice', drawCount: 0 });
    table.game!.rules.unoPenaltyCards = 2;
    table.game!.lastAction = { type: 'play', playerId: 'p1', unoPenalty: true };
    notifier.announce(table);
    expect(emit).toHaveBeenLastCalledWith('TEST01', { playerId: 'p1', playerName: 'Alice', drawCount: 2 });
  });
});
