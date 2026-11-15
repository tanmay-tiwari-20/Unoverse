import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorityLostError, REDIS_AUTHORITY_KEY, RedisAuthorityLease } from './redisAuthority';
import { FakeAuthorityRedis } from './redisAuthority.testUtils';
import { RedisRoomStore } from '../rooms/roomStore';
import { RedisProfileStore } from '../profiles/profileStore';

describe('Redis authority ownership and fencing', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('rejects a second writer and renews the first lease past its original expiry', async () => {
    const redis = new FakeAuthorityRedis();
    const first = await RedisAuthorityLease.acquire(redis, { now: () => Date.now() });
    await expect(RedisAuthorityLease.acquire(redis)).rejects.toThrow(/Another backend/);
    await vi.advanceTimersByTimeAsync(35_000);
    await expect(RedisAuthorityLease.acquire(redis)).rejects.toThrow(/Another backend/);
    expect(first.isOwned).toBe(true);
    await first.release();
    await (await RedisAuthorityLease.acquire(redis)).release();
  });

  it('permits takeover after expiry and rejects an old in-flight write atomically', async () => {
    const redis = new FakeAuthorityRedis();
    let serverNow = 0;
    redis.now = () => serverNow;
    const lost = vi.fn();
    // Simulate an old process whose event loop/clock has not observed expiry.
    const first = await RedisAuthorityLease.acquire(redis, { now: () => 0, onLost: lost });
    const delayed = redis.delayNextEval();
    const pending = first.saveIndexedSnapshot(redis, 'uno:room:ABC123', 'uno:rooms', 'ABC123', '{"version":1}');
    const rejected = expect(pending).rejects.toBeInstanceOf(AuthorityLostError);
    serverNow = 31_000;
    const second = await RedisAuthorityLease.acquire(redis, { now: () => 0 });
    await second.saveIndexedSnapshot(redis, 'uno:room:ABC123', 'uno:rooms', 'ABC123', '{"version":2}');
    delayed.resume();
    await rejected;
    expect(redis.strings.get('uno:room:ABC123')).toBe('{"version":2}');
    expect(lost).toHaveBeenCalledTimes(1);
    await first.release();
    expect(redis.strings.has(REDIS_AUTHORITY_KEY)).toBe(true);
    await expect(RedisAuthorityLease.acquire(redis)).rejects.toThrow(/Another backend/);
    await second.release();
  });

  it('fences both room and profile save/remove/index cleanup when Redis replaces the token', async () => {
    for (const Store of [RedisRoomStore, RedisProfileStore]) {
      const redis = new FakeAuthorityRedis();
      const lease = await RedisAuthorityLease.acquire(redis);
      const store = new (Store as any)(redis, lease);
      const room = Store === RedisRoomStore;
      const prefix = room ? 'uno:room:' : 'uno:profile:';
      const index = room ? 'uno:rooms' : 'uno:profiles';
      redis.strings.set(`${prefix}ABC123`, '{"id":"ABC123","code":"ABC123"}');
      redis.sets.set(index, new Set(['ABC123', 'DANGLING']));
      redis.strings.set(REDIS_AUTHORITY_KEY, 'replacement-token');
      await expect(store.loadAll()).rejects.toBeInstanceOf(AuthorityLostError);
      await expect(store.save({ code: 'ABC123', id: 'ABC123', changed: true })).rejects.toBeInstanceOf(AuthorityLostError);
      await expect(store.remove('ABC123')).rejects.toBeInstanceOf(AuthorityLostError);
      expect(redis.sets.get(index)?.has('DANGLING')).toBe(true);
      expect(redis.strings.get(`${prefix}ABC123`)).not.toContain('changed');
      await lease.release();
    }
  });

  it('fails closed on a timed-out renewal and never revives on a late response', async () => {
    const redis = new FakeAuthorityRedis();
    const lost = vi.fn();
    const lease = await RedisAuthorityLease.acquire(redis, { now: () => Date.now(), onLost: lost });
    const delayed = redis.delayNextEval();
    await vi.advanceTimersByTimeAsync(13_000);
    expect(lease.isOwned).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    delayed.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(lease.isOwned).toBe(false);
    await expect(lease.saveIndexedSnapshot(redis, 'snapshot', 'index', 'id', '{}')).rejects.toBeInstanceOf(AuthorityLostError);
    await lease.release();
  });

  it('rejects a locally expired lease before sending new Redis writes', async () => {
    const redis = new FakeAuthorityRedis();
    let localNow = 0;
    const lost = vi.fn();
    const lease = await RedisAuthorityLease.acquire(redis, { now: () => localNow, onLost: lost });
    const callsBefore = redis.calls.length;
    localNow = 30_000;
    await expect(lease.removeIndexedSnapshot(redis, 'snapshot', 'index', 'id')).rejects.toBeInstanceOf(AuthorityLostError);
    expect(redis.calls).toHaveLength(callsBefore);
    expect(lost).toHaveBeenCalledTimes(1);
    await lease.release();
  });
});
