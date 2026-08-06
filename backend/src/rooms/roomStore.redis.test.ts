/**
 * Tests for the Redis-backed stores and the shared client helpers.
 *
 * These run WITHOUT a live Redis: `FakeRedis` implements the exact subset of the
 * ioredis surface the stores use (smembers / mget / multi / srem / set / del),
 * including multi()'s chainable-then-exec shape. That keeps the suite hermetic
 * and fast while still exercising the real logic — batching, dangling-index
 * pruning, and unparseable-value handling — which is where the bugs actually
 * live. A live-Redis integration check is `npm run redis:check`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisRoomStore, createRoomStore, MemoryRoomStore } from './roomStore';
import { Room } from './roomManager';
import { redactRedisUrl, isRedisConfigured } from '../config/redis';

// ---------------------------------------------------------------------------
// A minimal in-process stand-in for ioredis.
// ---------------------------------------------------------------------------

class FakeRedis {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  /** Every command issued, so tests can assert on round-trip COUNT (batching). */
  calls: string[] = [];

  async smembers(key: string): Promise<string[]> {
    this.calls.push('smembers');
    return [...(this.sets.get(key) ?? [])];
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    this.calls.push('mget');
    return keys.map((k) => this.strings.get(k) ?? null);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.calls.push('srem');
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) if (set.delete(m)) removed++;
    return removed;
  }

  /** Chainable MULTI that applies every queued op on exec(). */
  multi() {
    const ops: Array<() => void> = [];
    const chain = {
      set: (k: string, v: string) => { ops.push(() => { this.strings.set(k, v); }); return chain; },
      del: (k: string) => { ops.push(() => { this.strings.delete(k); }); return chain; },
      sadd: (k: string, m: string) => {
        ops.push(() => {
          const set = this.sets.get(k) ?? new Set<string>();
          set.add(m);
          this.sets.set(k, set);
        });
        return chain;
      },
      srem: (k: string, m: string) => { ops.push(() => { this.sets.get(k)?.delete(m); }); return chain; },
      exec: async () => {
        this.calls.push('multi.exec');
        ops.forEach((op) => op());
        return [];
      },
    };
    return chain;
  }
}

/** Build a RedisRoomStore around a fake client (bypasses the private ctor). */
function storeWith(fake: FakeRedis): RedisRoomStore {
  return new (RedisRoomStore as any)(fake);
}

function sampleRoom(code: string): Room {
  return {
    code,
    hostId: 'sock1',
    status: 'lobby',
    players: [{ id: 'sock1', name: 'Alice', seatNumber: 1, isHost: true, secret: 'sec-a' }],
  } as Room;
}

// ---------------------------------------------------------------------------

describe('RedisRoomStore', () => {
  let fake: FakeRedis;
  let store: RedisRoomStore;

  beforeEach(() => {
    fake = new FakeRedis();
    store = storeWith(fake);
  });

  it('saves a room under uno:room:<CODE> and indexes it in uno:rooms', async () => {
    await store.save(sampleRoom('ABC123'));

    expect(fake.strings.has('uno:room:ABC123')).toBe(true);
    expect([...fake.sets.get('uno:rooms')!]).toEqual(['ABC123']);
    expect(JSON.parse(fake.strings.get('uno:room:ABC123')!).hostId).toBe('sock1');
  });

  it('uppercases room codes on save, load and remove', async () => {
    // Codes arrive from clients in mixed case; the key must be canonical or the
    // same room would occupy two keys.
    await store.save(sampleRoom('abc123'));
    expect(fake.strings.has('uno:room:ABC123')).toBe(true);

    await store.remove('AbC123');
    expect(fake.strings.has('uno:room:ABC123')).toBe(false);
    expect(fake.sets.get('uno:rooms')!.size).toBe(0);
  });

  it('round-trips rooms through loadAll', async () => {
    await store.save(sampleRoom('AAA111'));
    await store.save(sampleRoom('BBB222'));

    const loaded = await store.loadAll();
    expect(loaded.map((r) => r.code).sort()).toEqual(['AAA111', 'BBB222']);
  });

  it('returns an empty array when nothing is stored', async () => {
    expect(await store.loadAll()).toEqual([]);
  });

  it('prunes index entries whose snapshot is gone, in ONE srem', async () => {
    await store.save(sampleRoom('GOOD01'));
    // Simulate two expired/evicted snapshots that the index still references.
    fake.sets.get('uno:rooms')!.add('GONE01');
    fake.sets.get('uno:rooms')!.add('GONE02');

    const loaded = await store.loadAll();

    expect(loaded.map((r) => r.code)).toEqual(['GOOD01']);
    expect([...fake.sets.get('uno:rooms')!]).toEqual(['GOOD01']);
    // Batched cleanup: exactly one srem, not one per orphan.
    expect(fake.calls.filter((c) => c === 'srem')).toHaveLength(1);
  });

  it('skips unparseable JSON and prunes it instead of throwing', async () => {
    await store.save(sampleRoom('GOOD01'));
    fake.strings.set('uno:room:BAD001', '{ this is not json');
    fake.sets.get('uno:rooms')!.add('BAD001');

    const loaded = await store.loadAll();

    expect(loaded.map((r) => r.code)).toEqual(['GOOD01']);
    // The corrupt entry is removed from the index so it isn't retried forever.
    expect(fake.sets.get('uno:rooms')!.has('BAD001')).toBe(false);
  });

  it('batches loadAll into bounded MGETs rather than one giant call', async () => {
    // BATCH is 200 — 450 rooms must take exactly 3 MGETs (200 + 200 + 50).
    for (let i = 0; i < 450; i++) {
      await store.save(sampleRoom(`R${String(i).padStart(5, '0')}`));
    }
    fake.calls = [];

    const loaded = await store.loadAll();

    expect(loaded).toHaveLength(450);
    expect(fake.calls.filter((c) => c === 'mget')).toHaveLength(3);
  });

  it('does not expose close() — the shared client is owned by config/redis', async () => {
    // Closing here would pull the connection out from under the profile store.
    expect((store as any).close).toBeUndefined();
  });
});

describe('createRoomStore', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns a MemoryRoomStore for STORE=memory', async () => {
    process.env.STORE = 'memory';
    expect(await createRoomStore()).toBeInstanceOf(MemoryRoomStore);
  });

  it('falls back to memory in DEVELOPMENT when STORE=redis has no REDIS_URL', async () => {
    process.env.STORE = 'redis';
    process.env.NODE_ENV = 'development';
    delete process.env.REDIS_URL;

    // A missing local Redis must never block gameplay work.
    expect(await createRoomStore()).toBeInstanceOf(MemoryRoomStore);
  });

  it('THROWS in PRODUCTION when STORE=redis has no REDIS_URL', async () => {
    process.env.STORE = 'redis';
    process.env.NODE_ENV = 'production';
    delete process.env.REDIS_URL;

    // Silently degrading here would serve a healthy-looking instance that drops
    // every game on restart — failing loudly is the whole point.
    await expect(createRoomStore()).rejects.toThrow(/Redis room store/i);
  });
});

describe('redis config helpers', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; });

  it('redacts credentials from connection strings', () => {
    expect(redactRedisUrl('redis://user:hunter2@redis.example.com:6379'))
      .toBe('redis://***@redis.example.com:6379');
    expect(redactRedisUrl('rediss://default:tok3n@eu1.upstash.io:6380'))
      .toBe('rediss://***@eu1.upstash.io:6380');
  });

  it('leaves credential-free URLs unchanged', () => {
    expect(redactRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379');
  });

  it('treats blank / whitespace REDIS_URL as not configured', () => {
    process.env.REDIS_URL = '   ';
    expect(isRedisConfigured()).toBe(false);

    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(isRedisConfigured()).toBe(true);

    delete process.env.REDIS_URL;
    expect(isRedisConfigured()).toBe(false);
  });
});
