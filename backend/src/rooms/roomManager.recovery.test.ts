import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, RoomManager } from './roomManager';
import { RoomStore } from './roomStore';

class RecoveryStore implements RoomStore {
  saved = new Map<string, Room>();
  constructor(private seed: Room[]) {}
  async loadAll(): Promise<Room[]> { return structuredClone(this.seed); }
  async save(room: Room): Promise<void> { this.saved.set(room.code, structuredClone(room)); }
  async remove(code: string): Promise<void> { this.saved.delete(code); }
}

async function restore(snapshot: Room) {
  const manager = new RoomManager();
  const store = new RecoveryStore([snapshot]);
  manager.setStore(store);
  await manager.hydrate();
  return { manager, store, room: manager.getRoom(snapshot.code)! };
}

function snapshot(): Room {
  const source = new RoomManager();
  const room = source.createRoom();
  source.joinRoom(room.code, 'Alice', 'alice-old');
  source.joinRoom(room.code, 'Bob', 'bob-old');
  source.updateHouseRules(room.code, 'alice-old', { maxPlayers: 2, maxSpectators: 2 });
  source.joinRoom(room.code, 'Viewer', 'viewer-old');
  source.startGame(room.code, 'alice-old');
  return structuredClone(room);
}

describe('restored room connection recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('marks crashed sockets disconnected and gives humans/spectators bounded reconnect grace', async () => {
    const { manager, room } = await restore(snapshot());
    const expired = vi.fn();
    manager.reconcileRestoredConnections(expired);
    expect(room.players.every((p) => p.disconnectedAt === 100_000)).toBe(true);
    expect(room.spectators?.[0].disconnectedAt).toBe(100_000);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(room.players).toHaveLength(2);
    expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(manager.getRoom(room.code)).toBeUndefined();
    expect(expired).toHaveBeenCalledTimes(3);
    await manager.shutdown();
  });

  it('reconnects the same seat and hand and cancels only that seat deadline', async () => {
    const { manager, room } = await restore(snapshot());
    const expired = vi.fn();
    manager.reconcileRestoredConnections(expired);
    const alice = room.players[0];
    const hand = structuredClone(room.game!.hands[alice.id]);
    await vi.advanceTimersByTimeAsync(30_000);
    manager.joinRoom(room.code, 'Alice renamed', 'alice-new', alice.secret);
    expect(room.players[0].uid).toBe(alice.uid);
    expect(room.players[0].disconnectedAt).toBeUndefined();
    expect(room.hostId).toBe('alice-new');
    expect(room.game!.hands['alice-new']).toEqual(hand);
    expect(room.game!.hands['alice-old']).toBeUndefined();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(room.players.map((p) => p.id)).toEqual(['alice-new']);
    expect(room.spectators).toEqual([]);
    expect(room.status).toBe('lobby');
    expect(expired).toHaveBeenCalledTimes(2);
    expect(manager.sweepIdleRooms({ emptyTtlMs: 0, finishedTtlMs: 0 }).total).toBe(0);
    await manager.shutdown();
  });

  it('preserves a prior disconnect deadline across restart instead of granting another minute', async () => {
    const saved = snapshot();
    for (const member of [...saved.players, ...saved.spectators!]) member.disconnectedAt = 50_000;
    const { manager, room, store } = await restore(saved);
    manager.reconcileRestoredConnections(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.saved.get(room.code)?.players[0].disconnectedAt).toBe(50_000);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(manager.getRoom(room.code)).toBeDefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(manager.getRoom(room.code)).toBeUndefined();
    await manager.shutdown();
  });

  it('immediately removes already expired restored members and bots once their human owner leaves', async () => {
    const source = new RoomManager();
    const original = source.createRoom();
    source.joinRoom(original.code, 'Owner', 'owner-old');
    source.addBots(original.code, 'owner-old', 2);
    source.startGame(original.code, 'owner-old');
    const saved = structuredClone(original);
    saved.players[0].disconnectedAt = 1;
    const { manager, room } = await restore(saved);
    const expired = vi.fn();
    manager.reconcileRestoredConnections(expired);
    expect(manager.getRoom(room.code)).toBeUndefined();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(expired.mock.calls[0][1].gameStopped).toBe(true);
    await manager.shutdown();
  });

  it('honors allowRejoin=false after a crash', async () => {
    const saved = snapshot();
    saved.houseRules.allowRejoin = false;
    const { manager, room } = await restore(saved);
    manager.reconcileRestoredConnections(vi.fn());
    expect(manager.getRoom(room.code)).toBeUndefined();
    await manager.shutdown();
  });

  it('collects stale disconnected rosters even if an expiry timer was never armed', async () => {
    const { manager, room } = await restore(snapshot());
    expect(manager.sweepIdleRooms({ emptyTtlMs: 0, finishedTtlMs: 0 }).total).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(manager.sweepIdleRooms({ emptyTtlMs: 0, finishedTtlMs: 0 }).total).toBe(1);
    expect(manager.getRoom(room.code)).toBeUndefined();
    await manager.shutdown();
  });

  it('does not list a crashed public lobby as a live matchmaking destination', async () => {
    const saved = snapshot();
    saved.status = 'lobby';
    saved.game = undefined;
    saved.visibility = 'public';
    saved.players = saved.players.slice(0, 1);
    const { manager, room } = await restore(saved);
    expect(manager.findQuickPlayRoom()).toBeNull();
    const alice = room.players[0];
    manager.joinRoom(room.code, 'Alice', 'alice-new', alice.secret);
    expect(manager.findQuickPlayRoom()?.code).toBe(room.code);
    await manager.shutdown();
  });
});
