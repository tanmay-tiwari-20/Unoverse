/**
 * Tests for the shared Redis connection module.
 *
 * `ioredis` is mocked at the module boundary, so these exercise the REAL logic in
 * config/redis.ts — connection memoization (the thing that keeps us at 3
 * connections per instance), failure recovery, TLS selection, and the bounded
 * health probe — without needing a live Redis server.
 *
 * For a check against a real server, run: npm run redis:check
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Every FakeRedis constructed during a test, in order. */
const instances: FakeRedis[] = [];

class FakeRedis {
  url: string;
  options: any;
  connectCalls = 0;
  quitCalls = 0;
  listeners = new Map<string, Function[]>();
  /** Set to an Error to make connect() reject. */
  connectError: Error | null = null;
  /** PING reply, or an Error to make it reject. */
  pingReply: string | Error = 'PONG';

  constructor(url: string, options: any) {
    this.url = url;
    this.options = options;
    instances.push(this);
  }

  on(event: string, fn: Function) {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
    return this;
  }

  async connect() {
    this.connectCalls++;
    if (this.connectError) throw this.connectError;
  }

  async ping() {
    if (this.pingReply instanceof Error) throw this.pingReply;
    return this.pingReply;
  }

  async quit() {
    this.quitCalls++;
  }
}

vi.mock('ioredis', () => ({ default: FakeRedis }));

// Imported after the mock is registered (vi.mock is hoisted by Vitest).
import {
  getRedis,
  createRedisClient,
  redisHealth,
  closeRedis,
  isRedisConfigured,
  requireRedisUrl,
  __resetRedisForTests,
} from './redis';

const originalEnv = { ...process.env };

beforeEach(() => {
  instances.length = 0;
  __resetRedisForTests();
  process.env.REDIS_URL = 'redis://localhost:6379';
});

afterEach(() => {
  process.env = { ...originalEnv };
  __resetRedisForTests();
});

describe('getRedis', () => {
  it('opens exactly ONE connection no matter how many callers ask', async () => {
    // This is the whole point of the shared client: the room store and the
    // profile store must not each open their own connection.
    const a = await getRedis();
    const b = await getRedis();
    const c = await getRedis();

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(instances).toHaveLength(1);
    expect(instances[0].connectCalls).toBe(1);
  });

  it('shares a single in-flight connect between concurrent callers', async () => {
    // Both stores call this during startup, concurrently — a naive memo that
    // caches only after resolution would open two connections here.
    const [a, b] = await Promise.all([getRedis(), getRedis()]);

    expect(a).toBe(b);
    expect(instances).toHaveLength(1);
  });

  it('does not cache a failed connection, so a later call can retry', async () => {
    // Fail the first attempt.
    const failing = new Error('ECONNREFUSED 127.0.0.1:6379');
    const spy = vi.spyOn(FakeRedis.prototype, 'connect').mockRejectedValueOnce(failing);

    await expect(getRedis()).rejects.toThrow(/ECONNREFUSED/);
    spy.mockRestore();

    // A retry must open a fresh connection rather than replaying the rejection.
    const client = await getRedis();
    expect(client).toBeDefined();
    expect(instances).toHaveLength(2);
  });

  it('rejects (never throws synchronously) when REDIS_URL is missing', async () => {
    delete process.env.REDIS_URL;
    // Callers use `await` / `.catch()`; a synchronous throw from an
    // async-looking API would escape those handlers entirely.
    const promise = getRedis();
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow(/REDIS_URL is not set/);
  });

  it('registers an error listener before connecting', async () => {
    // An unhandled ioredis 'error' event terminates the Node process — the
    // single most common way a Redis blip becomes a full outage.
    await getRedis();
    expect(instances[0].listeners.get('error')?.length).toBeGreaterThan(0);
  });

  it('never gives up on a request or on reconnecting', async () => {
    await getRedis();
    const opts = instances[0].options;

    // null = queue the command and retry across reconnects, rather than failing.
    expect(opts.maxRetriesPerRequest).toBeNull();
    expect(opts.enableOfflineQueue).toBe(true);
    // retryStrategy must always return a delay (never null = stop retrying).
    expect(typeof opts.retryStrategy(1)).toBe('number');
    expect(opts.retryStrategy(9999)).toBe(5000); // capped backoff
  });
});

describe('TLS selection', () => {
  it('enables TLS for rediss:// URLs', async () => {
    process.env.REDIS_URL = 'rediss://default:token@eu1.upstash.io:6380';
    await getRedis();
    expect(instances[0].options.tls).toEqual({});
  });

  it('does not enable TLS for plain redis:// URLs', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    await getRedis();
    expect(instances[0].options.tls).toBeUndefined();
  });
});

describe('createRedisClient', () => {
  it('returns a NEW connection each time (pub/sub cannot share the command client)', async () => {
    const shared = await getRedis();
    const pub = await createRedisClient('socketio-pub');
    const sub = await createRedisClient('socketio-sub');

    expect(pub).not.toBe(shared);
    expect(sub).not.toBe(pub);
    // 3 connections per instance: shared + pub + sub.
    expect(instances).toHaveLength(3);
  });

  it('names each connection so it is identifiable in CLIENT LIST', async () => {
    await createRedisClient('socketio-pub');
    expect(instances[0].options.connectionName).toBe('unoverse:socketio-pub');
  });
});

describe('redisHealth', () => {
  it('reports disabled when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL;
    expect(await redisHealth()).toEqual({ status: 'disabled' });
  });

  it('reports ready with a latency when PING succeeds', async () => {
    const health = await redisHealth();
    expect(health.status).toBe('ready');
    expect(typeof health.latencyMs).toBe('number');
  });

  it('reports error (not throw) when the connection cannot be established', async () => {
    vi.spyOn(FakeRedis.prototype, 'connect').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // A health endpoint must always answer, never reject.
    const health = await redisHealth();
    expect(health.status).toBe('error');
    expect(health.detail).toMatch(/ECONNREFUSED/);
  });

  it('reports degraded when connected but PING misbehaves', async () => {
    const client = (await getRedis()) as unknown as FakeRedis;
    client.pingReply = 'WEIRD';

    const health = await redisHealth();
    expect(health.status).toBe('degraded');
  });
});

describe('closeRedis', () => {
  it('quits the shared client and allows a fresh connection afterwards', async () => {
    await getRedis();
    await closeRedis();

    expect(instances[0].quitCalls).toBe(1);

    await getRedis();
    expect(instances).toHaveLength(2);
  });

  it('is a no-op when nothing was ever connected', async () => {
    await expect(closeRedis()).resolves.toBeUndefined();
    expect(instances).toHaveLength(0);
  });

  it('swallows errors so shutdown always completes', async () => {
    await getRedis();
    vi.spyOn(FakeRedis.prototype, 'quit').mockRejectedValueOnce(new Error('already closed'));

    // Shutdown must never hang or crash on a failing quit().
    await expect(closeRedis()).resolves.toBeUndefined();
  });
});

describe('config helpers', () => {
  it('isRedisConfigured reflects REDIS_URL presence', () => {
    expect(isRedisConfigured()).toBe(true);
    delete process.env.REDIS_URL;
    expect(isRedisConfigured()).toBe(false);
  });

  it('requireRedisUrl explains what to set when missing', () => {
    delete process.env.REDIS_URL;
    expect(() => requireRedisUrl()).toThrow(/REDIS_URL is not set/);
  });
});
