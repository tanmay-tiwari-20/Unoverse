import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomManager, type Room } from './roomManager';
import { MemoryRoomStore, type RoomStore } from './roomStore';
import { card } from '../test/helpers';

const managers: RoomManager[] = [];

function pendingRoom() {
  const manager = new RoomManager();
  managers.push(manager);
  manager.setStore(new MemoryRoomStore());
  const room = manager.createRoom();
  const actor = manager.joinRoom(room.code, 'Same name', 'debtor').player!;
  manager.joinRoom(room.code, 'Same name', 'next');
  manager.joinRoom(room.code, 'Third', 'third');
  manager.startGame(room.code, actor.id);
  const game = room.game!;
  game.status = 'playing';
  // An opening Reverse is random; this fixture's seat-order assertions are not.
  game.direction = 'clockwise';
  game.currentPlayerId = 'next';
  game.colorChooserId = null;
  game.swapChooserId = null;
  game.drawStack = 0;
  game.pendingDrawType = null;
  game.drawnCardId = null;
  game.rules = { ...game.rules, mustSayUno: true, unoCallMode: 'manual', allowLateUno: true };
  game.hands = {
    debtor: [card('red', '5')], next: [card('blue', '2'), card('blue', '3')],
    third: [card('green', '4'), card('green', '6')],
  };
  game.unoCalled = { debtor: false, next: false, third: false };
  game.pendingUnoPlayerId = actor.id;
  return { manager, room, actor, game };
}

function seededStore(seed: Room): RoomStore {
  return {
    async loadAll() { return [JSON.parse(JSON.stringify(seed))]; },
    async save() {},
    async remove() {},
  };
}

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    for (const code of manager.getAvailableRooms()) {
      const room = manager.getRoom(code)!;
      for (const player of [...room.players]) manager.leaveRoom(player.id);
    }
    await manager.shutdown();
  }
  vi.useRealTimers();
});

describe('late-UNO debt follows seat identity', () => {
  it('preserves the debt during disconnect grace and remaps only its reconnecting owner', () => {
    const { manager, room, actor, game } = pendingRoom();
    game.lastAction = {
      type: 'play', playerId: 'next',
      unoPenalties: [{ playerId: 'debtor', drawCount: 4 }, { playerId: 'third', drawCount: 2 }],
    };
    manager.startDisconnectGracePeriod('debtor', room.code, () => {});
    expect(game.pendingUnoPlayerId).toBe('debtor');

    const returned = manager.joinRoom(room.code, 'Renamed', 'debtor-new', actor.secret);
    expect(returned.player!.uid).toBe(actor.uid);
    expect(game.pendingUnoPlayerId).toBe('debtor-new');
    expect(game.hands['debtor-new']).toHaveLength(1);
    expect(game.unoCalled['debtor-new']).toBe(false);
    expect(game.currentPlayerId).toBe('next');
    expect(game.lastAction.unoPenalties).toEqual([
      { playerId: 'debtor-new', drawCount: 4 }, { playerId: 'third', drawCount: 2 },
    ]);
    expect(manager.leaveRoom('debtor')).toBeNull();
    expect(game.pendingUnoPlayerId).toBe('debtor-new');
  });

  it('does not transfer or close the debt when the next player reconnects', () => {
    const { manager, room, game } = pendingRoom();
    const next = room.players.find((player) => player.id === 'next')!;
    manager.joinRoom(room.code, 'Same name', 'next-new', next.secret);
    expect(game.currentPlayerId).toBe('next-new');
    expect(game.pendingUnoPlayerId).toBe('debtor');
  });

  it('clears the debt when its owner leaves and keeps it when someone else leaves', () => {
    const first = pendingRoom();
    first.manager.leaveRoom('next');
    expect(first.game.pendingUnoPlayerId).toBe('debtor');
    expect(first.game.currentPlayerId).toBe('third');

    const second = pendingRoom();
    second.manager.leaveRoom('debtor');
    expect(second.game.pendingUnoPlayerId).toBeNull();
    expect(second.game.hands.debtor).toBeUndefined();
    expect(second.room.players).toHaveLength(2);
  });

  it('clears the debt when disconnect grace expires instead of assigning it to another seat', async () => {
    vi.useFakeTimers();
    const { manager, room, game } = pendingRoom();
    let expired = false;
    manager.startDisconnectGracePeriod('debtor', room.code, () => { expired = true; });
    expect(game.pendingUnoPlayerId).toBe('debtor');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(expired).toBe(true);
    expect(game.pendingUnoPlayerId).toBeNull();
    expect(room.players.map((player) => player.id)).toEqual(['next', 'third']);
  });
});

describe('late-UNO debt in persisted rooms', () => {
  it('restores a valid window without transferring it during reconnect', async () => {
    const { room, actor } = pendingRoom();
    const manager = new RoomManager();
    managers.push(manager);
    manager.setStore(seededStore(room));
    await manager.hydrate();
    const restored = manager.getRoom(room.code)!;
    expect(restored.game!.pendingUnoPlayerId).toBe('debtor');
    manager.joinRoom(room.code, 'Same name', 'returned', actor.secret);
    expect(restored.game!.pendingUnoPlayerId).toBe('returned');
    expect(restored.game!.currentPlayerId).toBe('next');
  });

  it.each(['legacy', 'removed', 'changed-hand', 'called', 'ended'])(
    'clears %s debt without inventing a new window', async (kind) => {
      const { room, game } = pendingRoom();
      if (kind === 'legacy') delete game.pendingUnoPlayerId;
      if (kind === 'removed') game.pendingUnoPlayerId = 'removed-socket';
      if (kind === 'changed-hand') game.hands.debtor.push(card('yellow', '9'));
      if (kind === 'called') game.unoCalled.debtor = true;
      if (kind === 'ended') game.status = 'ended';
      const manager = new RoomManager();
      managers.push(manager);
      manager.setStore(seededStore(room));
      await manager.hydrate();
      expect(manager.getRoom(room.code)!.game!.pendingUnoPlayerId).toBeNull();
    },
  );
});
