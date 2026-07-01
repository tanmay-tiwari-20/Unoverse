import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager, Room } from './roomManager';
import { RoomStore } from './roomStore';

/**
 * A fake store that keeps snapshots in a Map and records save/remove calls, so we
 * can assert the RoomManager writes through on mutation and rehydrates on load.
 */
class FakeStore implements RoomStore {
  public data = new Map<string, Room>();
  public saves = 0;
  public removes = 0;
  private seed: Room[];

  constructor(seed: Room[] = []) {
    this.seed = seed;
  }
  async loadAll(): Promise<Room[]> {
    return this.seed.map((r) => JSON.parse(JSON.stringify(r)));
  }
  async save(room: Room): Promise<void> {
    this.saves++;
    this.data.set(room.code.toUpperCase(), JSON.parse(JSON.stringify(room)));
  }
  async remove(code: string): Promise<void> {
    this.removes++;
    this.data.delete(code.toUpperCase());
  }
}

// Persistence flushes on a microtask; wait for it to settle.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('RoomManager write-through persistence', () => {
  beforeEach(() => {
    // Reset any store from a previous test to a clean fake.
    roomManager.setStore(new FakeStore());
  });

  it('persists a room after creation', async () => {
    const store = new FakeStore();
    roomManager.setStore(store);

    const room = roomManager.createRoom();
    await flush();

    expect(store.data.has(room.code)).toBe(true);
    expect(store.saves).toBeGreaterThan(0);
  });

  it('coalesces a burst of mutations into fewer writes than mutations', async () => {
    const store = new FakeStore();
    roomManager.setStore(store);

    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Alice', 'sock1');
    roomManager.joinRoom(room.code, 'Bob', 'sock2');
    // Three synchronous mutations before the microtask flush...
    await flush();

    // ...collapse into a single coalesced save for this room.
    expect(store.saves).toBe(1);
    const persisted = store.data.get(room.code)!;
    expect(persisted.players.map((p) => p.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('removes the snapshot when the room empties out', async () => {
    const store = new FakeStore();
    roomManager.setStore(store);

    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Solo', 'sockX');
    await flush();
    expect(store.data.has(room.code)).toBe(true);

    roomManager.leaveRoom('sockX'); // last player leaves -> room deleted
    await flush();

    expect(store.data.has(room.code)).toBe(false);
    expect(store.removes).toBeGreaterThan(0);
  });

  it('hydrate() restores persisted rooms into memory', async () => {
    const seeded: Room = {
      code: 'SEED01',
      hostId: 'h1',
      status: 'lobby',
      players: [{ id: 'h1', name: 'Host', seatNumber: 1, isHost: true, secret: 'sec' }],
    };
    roomManager.setStore(new FakeStore([seeded]));

    await roomManager.hydrate();

    const restored = roomManager.getRoom('SEED01');
    expect(restored).toBeDefined();
    expect(restored!.players[0].name).toBe('Host');

    // Clean up so we don't leak this room into other tests.
    roomManager.leaveRoom('h1');
    await flush();
  });
});
