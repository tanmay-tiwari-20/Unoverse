import { describe, it, expect, beforeEach, vi } from 'vitest';
import { roomManager, Room, RoomManager } from './roomManager';
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

/** Storage that serializes only after the test releases the write. */
class DeferredStore extends FakeStore {
  public pending: Array<{
    type: 'save' | 'remove';
    code: string;
    snapshot?: Room;
    finish(error?: Error): void;
  }> = [];
  public closed = false;

  save(snapshot: Room): Promise<void> {
    this.saves++;
    return new Promise<void>((resolve, reject) => {
      this.pending.push({
        type: 'save', code: snapshot.code, snapshot,
        finish: (error) => {
          if (error) reject(error);
          else {
            this.data.set(snapshot.code, JSON.parse(JSON.stringify(snapshot)));
            resolve();
          }
        },
      });
    });
  }

  remove(code: string): Promise<void> {
    this.removes++;
    return new Promise<void>((resolve, reject) => {
      this.pending.push({
        type: 'remove', code,
        finish: (error) => {
          if (error) reject(error);
          else {
            this.data.delete(code);
            resolve();
          }
        },
      });
    });
  }

  completeNext(error?: Error): void {
    const next = this.pending.shift();
    if (!next) throw new Error('No storage operation is pending');
    next.finish(error);
  }

  async close(): Promise<void> { this.closed = true; }
}

describe('Room persistence during slow or failing storage', () => {
  function setup() {
    const manager = new RoomManager();
    const store = new DeferredStore();
    manager.setStore(store);
    return { manager, store };
  }

  it('serializes successive saves and gives storage immutable room snapshots', async () => {
    const { manager, store } = setup();
    const room = manager.createRoom();
    await flush();
    const firstSnapshot = store.pending[0].snapshot!;

    manager.joinRoom(room.code, 'Alice', 'slow-alice');
    await flush();

    expect(store.pending).toHaveLength(1);
    expect(firstSnapshot.players).toHaveLength(0);
    store.completeNext();
    await flush();
    expect(store.pending).toHaveLength(1);
    expect(store.pending[0].snapshot!.players[0].name).toBe('Alice');
    store.completeNext();
    await manager.shutdown();
    expect(store.data.get(room.code)!.players).toHaveLength(1);
  });

  it('retries the latest room revision after a save fails', async () => {
    const { manager, store } = setup();
    const room = manager.createRoom();
    await flush();
    manager.joinRoom(room.code, 'Latest', 'retry-latest');
    store.completeNext(new Error('temporary storage outage'));

    await vi.waitFor(() => expect(store.pending).toHaveLength(1));
    expect(store.pending[0].snapshot!.players[0].name).toBe('Latest');
    store.completeNext();
    await manager.shutdown();
    expect(store.data.get(room.code)!.players[0].name).toBe('Latest');
  });

  it('does not resurrect a removed room by retrying an older failed save', async () => {
    const { manager, store } = setup();
    const room = manager.createRoom();
    manager.joinRoom(room.code, 'Leaving', 'retry-leaver');
    await flush();
    manager.leaveRoom('retry-leaver');
    store.completeNext(new Error('failed old save'));

    await vi.waitFor(() => expect(store.pending).toHaveLength(1));
    expect(store.pending[0].type).toBe('remove');
    store.completeNext();
    await manager.shutdown();
    expect(store.saves).toBe(1);
    expect(store.data.has(room.code)).toBe(false);
  });

  it('retries failed removals instead of leaving deleted rooms in storage', async () => {
    const { manager, store } = setup();
    const room = manager.createRoom();
    manager.joinRoom(room.code, 'Leaving', 'remove-retry-leaver');
    await flush();
    store.completeNext();
    await flush();
    manager.leaveRoom('remove-retry-leaver');
    await flush();
    store.completeNext(new Error('temporary delete failure'));

    await vi.waitFor(() => expect(store.pending).toHaveLength(1));
    expect(store.pending[0].type).toBe('remove');
    store.completeNext();
    await manager.shutdown();
    expect(store.data.has(room.code)).toBe(false);
    expect(store.removes).toBe(2);
  });

  it('waits for in-flight and newly queued writes before closing storage', async () => {
    const { manager, store } = setup();
    const room = manager.createRoom();
    await flush();
    manager.joinRoom(room.code, 'Last mutation', 'drain-alice');
    let finished = false;
    const shutdown = manager.shutdown().then(() => { finished = true; });
    await flush();
    expect(finished).toBe(false);
    expect(store.closed).toBe(false);

    store.completeNext();
    await flush();
    expect(finished).toBe(false);
    expect(store.pending).toHaveLength(1);
    store.completeNext();
    await shutdown;

    expect(store.closed).toBe(true);
    expect(store.data.get(room.code)!.players[0].name).toBe('Last mutation');
  });

  it('retries pending snapshots while draining for shutdown', async () => {
    const manager = new RoomManager();
    class FailOnceStore extends FakeStore {
      private failed = false;
      async save(room: Room): Promise<void> {
        if (!this.failed) {
          this.failed = true;
          throw new Error('first write fails');
        }
        await super.save(room);
      }
    }
    const store = new FailOnceStore();
    manager.setStore(store);
    const room = manager.createRoom();
    await flush();
    await manager.shutdown();
    expect(store.data.has(room.code)).toBe(true);
  });

  it('does not retry a previous store\'s failed write into a replacement store', async () => {
    const { manager, store: previous } = setup();
    const oldRoom = manager.createRoom();
    await flush();
    const replacement = new FakeStore();
    manager.setStore(replacement);
    const newRoom = manager.createRoom();
    previous.completeNext(new Error('old store fails after replacement'));
    await manager.shutdown();

    expect(replacement.data.has(oldRoom.code)).toBe(false);
    expect(replacement.data.has(newRoom.code)).toBe(true);
  });

  it('reports a failed shutdown drain instead of claiming pending writes were saved', async () => {
    const manager = new RoomManager();
    class FailingStore extends FakeStore {
      public closed = false;
      async save(): Promise<void> { throw new Error('storage remains unavailable'); }
      async close(): Promise<void> { this.closed = true; }
    }
    const store = new FailingStore();
    manager.setStore(store);
    manager.createRoom();

    await expect(manager.shutdown()).rejects.toThrow(/did not drain/);
    expect(store.closed).toBe(false);
  });

  it('cancels disconnect grace callbacks before draining the last room snapshot', async () => {
    vi.useFakeTimers();
    try {
      const manager = new RoomManager();
      const store = new FakeStore();
      manager.setStore(store);
      const room = manager.createRoom();
      manager.joinRoom(room.code, 'Disconnecting', 'shutdown-grace-player');
      const expired = vi.fn();
      manager.startDisconnectGracePeriod('shutdown-grace-player', room.code, expired);

      await manager.shutdown();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(expired).not.toHaveBeenCalled();
      expect(manager.getRoom(room.code)!.players).toHaveLength(1);
      expect(store.data.get(room.code)!.players).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
