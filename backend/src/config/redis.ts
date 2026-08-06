/**
 * ============================================================================
 *  Redis — one shared, resilient connection for the whole process.
 * ============================================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * Redis plays three separate roles in this server:
 *
 *   1. Durable room state   (RedisRoomStore    — uno:room:*)
 *   2. Durable profiles     (RedisProfileStore — uno:profile:*)
 *   3. Cross-instance fan-out for Socket.IO broadcasts (pub/sub adapter)
 *
 * Roles 1 and 2 are ordinary command traffic and can share ONE connection.
 * Role 3 cannot: a Redis connection in subscriber mode may only issue
 * (un)subscribe commands, so the adapter needs its own dedicated pub + sub pair.
 *
 * That is the entire connection budget: **3 connections per instance**
 * (shared commands + adapter pub + adapter sub). Previously each store opened
 * its own client and the adapter opened two more — 4+ connections doing the work
 * of 3, which matters on managed Redis where the free tiers cap connections
 * (Upstash free = 100, but they are counted per-instance and multiply as you
 * scale out).
 *
 * DESIGN NOTES
 * ------------
 * - `getRedis()` is memoized: every caller gets the SAME client, and concurrent
 *   callers during startup share one in-flight connect (no thundering herd).
 * - `retryStrategy` reconnects with capped exponential backoff FOREVER. A Redis
 *   blip must degrade the server, never kill it — see `maxRetriesPerRequest`.
 * - `maxRetriesPerRequest: null` + `enableOfflineQueue: true` means commands
 *   issued while the link is down are queued and replayed on reconnect rather
 *   than throwing. Combined with the write-through design in RoomManager (which
 *   already swallows persistence errors), a short outage is invisible to players.
 * - `rediss://` URLs enable TLS automatically in ioredis. Managed providers
 *   (Upstash, Redis Cloud, Railway, Render) all hand out `rediss://`, so no
 *   extra config is needed — but we set `tls` explicitly for that scheme so a
 *   provider that omits SNI still validates.
 */

import type { Redis as RedisClient } from 'ioredis';
import { logger } from '../utils/logger';

/** Mask credentials so a connection string is never written to logs verbatim. */
export function redactRedisUrl(url: string): string {
  // redis://user:password@host:6379 -> redis://***@host:6379
  return url.replace(/\/\/[^@/]*@/, '//***@');
}

/** Is Redis configured for this process? */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL?.trim();
}

/**
 * Read REDIS_URL, or throw a message that says exactly what to fix. Callers that
 * require Redis (STORE=redis) surface this; callers that merely prefer it check
 * `isRedisConfigured()` first.
 */
export function requireRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(
      'REDIS_URL is not set. Set it to your Redis connection string ' +
        '(e.g. redis://localhost:6379, or rediss://... for a managed provider).'
    );
  }
  return url;
}

/**
 * Shared ioredis options. `connectionName` makes each role identifiable in
 * `CLIENT LIST` / provider dashboards, which is the difference between "3
 * mystery connections" and an obvious topology when debugging production.
 */
function baseOptions(url: string, role: string) {
  const useTls = url.startsWith('rediss://');
  return {
    connectionName: `unoverse:${role}`,
    // Never give up on a request because the link is briefly down — queue it.
    // A capped-backoff reconnect (below) will drain the queue shortly.
    maxRetriesPerRequest: null as null,
    enableOfflineQueue: true,
    // Don't dial until we explicitly connect(), so startup can fail loudly and
    // in a controlled order rather than mid-import.
    lazyConnect: true,
    /**
     * Reconnect forever with exponential backoff capped at 5s. Returning a
     * number = "retry after N ms"; returning null would stop retrying, which is
     * exactly what we must avoid — a 30-second Redis restart should not require
     * a backend restart.
     */
    retryStrategy(times: number): number {
      const delay = Math.min(times * 200, 5_000);
      // Log the first few attempts, then only every 10th, so a long outage
      // doesn't flood the logs at 5s intervals forever.
      if (times <= 3 || times % 10 === 0) {
        logger.warn(`[REDIS] Connection lost (attempt ${times}) — retrying in ${delay}ms.`);
      }
      return delay;
    },
    /**
     * Reconnect (rather than just erroring) when Redis reports a failover or a
     * read-only replica — standard practice for managed/HA Redis.
     */
    reconnectOnError(err: Error): boolean {
      return /READONLY|ETIMEDOUT|ECONNRESET/.test(err.message);
    },
    ...(useTls ? { tls: {} } : {}),
  };
}

/**
 * Construct a NEW client for a given role and wire its lifecycle logging.
 * Exported for the Socket.IO adapter, which needs dedicated pub/sub connections
 * that must NOT be the shared command client.
 */
export async function createRedisClient(role: string, url = requireRedisUrl()): Promise<RedisClient> {
  // Lazy import keeps ioredis out of the module graph for file/memory deploys.
  const { default: Redis } = await import('ioredis');
  const client = new Redis(url, baseOptions(url, role));

  // An 'error' event with no listener is an unhandled exception in Node and
  // would take the process down — the single most common way a Redis blip
  // becomes an outage. Attach BEFORE connecting.
  client.on('error', (err: Error) => {
    logger.error(`[REDIS:${role}] ${err?.message}`);
  });
  client.on('end', () => logger.warn(`[REDIS:${role}] Connection closed.`));
  client.on('reconnecting', () => logger.debug(`[REDIS:${role}] Reconnecting...`));
  client.on('ready', () => logger.info(`[REDIS:${role}] Ready.`));

  await client.connect();
  return client;
}

// ---------------------------------------------------------------------------
// The shared command client (roles 1 + 2).
// ---------------------------------------------------------------------------

/** Memoized shared client. Holds the in-flight promise so concurrent startup
 *  callers (room store + profile store) share ONE connection attempt. */
let sharedClient: Promise<RedisClient> | null = null;

/**
 * Get the process-wide shared Redis client, connecting on first use.
 * Both durable stores call this, so they share a single connection.
 *
 * Throws if REDIS_URL is unset or the initial connection fails — callers decide
 * whether that is fatal (see STORE=redis fail-fast in roomStore/profileStore).
 */
export function getRedis(): Promise<RedisClient> {
  if (!sharedClient) {
    let url: string;
    try {
      url = requireRedisUrl();
    } catch (err) {
      // Always fail as a REJECTED PROMISE, never a synchronous throw. Callers use
      // `getRedis().catch(...)` / `await`, and a sync throw from an async-looking
      // API escapes those handlers entirely.
      return Promise.reject(err);
    }
    logger.info(`[REDIS] Connecting to ${redactRedisUrl(url)}`);
    sharedClient = createRedisClient('shared', url).catch((err) => {
      // Reset the memo so a later retry can attempt a fresh connection instead
      // of permanently caching the rejected promise.
      sharedClient = null;
      throw err;
    });
  }
  return sharedClient;
}

/**
 * Liveness probe for /health. Returns a small, JSON-safe status object and never
 * throws — a health endpoint must always answer.
 *
 * `status` is one of:
 *   'disabled'  — no REDIS_URL; the server is running on file/memory storage.
 *   'ready'     — PING succeeded.
 *   'degraded'  — configured and connected, but PING failed or timed out.
 *   'error'     — configured but we could not get a client at all.
 */
export async function redisHealth(): Promise<{
  status: 'disabled' | 'ready' | 'degraded' | 'error';
  latencyMs?: number;
  detail?: string;
}> {
  if (!isRedisConfigured()) return { status: 'disabled' };
  try {
    const client = await getRedis();
    const startedAt = Date.now();
    // Bound the probe so a wedged connection can't hang the health check (and
    // with it, the platform's load-balancer probe).
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PING timed out after 2000ms')), 2_000).unref()
      ),
    ]);
    if (pong !== 'PONG') return { status: 'degraded', detail: `Unexpected PING reply: ${pong}` };
    return { status: 'ready', latencyMs: Date.now() - startedAt };
  } catch (err: any) {
    // `status` distinguishes "we have a client but it isn't answering" from
    // "we never got a client", which are different operational problems.
    return { status: sharedClient ? 'degraded' : 'error', detail: err?.message };
  }
}

/**
 * Close the shared client on graceful shutdown. `quit()` drains in-flight
 * commands (unlike `disconnect()`, which drops them), so pending room/profile
 * writes flushed during shutdown still land. Never throws.
 */
export async function closeRedis(): Promise<void> {
  if (!sharedClient) return;
  const pending = sharedClient;
  sharedClient = null;
  try {
    const client = await pending;
    await client.quit();
    logger.info('[REDIS] Shared connection closed.');
  } catch (err: any) {
    logger.error('[REDIS] Error closing shared connection:', err?.message);
  }
}

/** Test-only: drop the memoized client without touching the network. */
export function __resetRedisForTests(): void {
  sharedClient = null;
}
