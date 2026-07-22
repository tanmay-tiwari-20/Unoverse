/**
 * Per-socket token-bucket rate limiter.
 *
 * Each socket gets one bucket per event type. Tokens refill continuously at
 * `refillPerSec` up to `capacity`. A request costs 1 token; when the bucket is
 * empty the request is rejected. Buckets are lazily created and automatically
 * pruned when a socket disconnects.
 */

import { RateLimitRule, DEFAULT_RATE_LIMIT, RATE_LIMITS, RATE_LIMIT_NOTIFY_GAP_MS } from '../config/serverConfig';
import { logger } from './logger';

interface Bucket {
  tokens: number;
  lastRefill: number; // epoch ms
}

interface SocketState {
  buckets: Map<string, Bucket>;
  /** epoch ms of last throttle-notice emission per event, to avoid flooding the
   *  client with error events when they're already being rate-limited. */
  lastNotify: Map<string, number>;
}

export class SocketRateLimiter {
  /** socketId -> per-event buckets */
  private sockets = new Map<string, SocketState>();

  /** Call on socket disconnect to free memory. */
  removeSocket(socketId: string): void {
    this.sockets.delete(socketId);
  }

  /**
   * Attempt to consume one token for `event` on `socketId`.
   * Returns `{ allowed: true }` or `{ allowed: false, notify: boolean }`.
   * `notify` is true when the caller should emit a throttle error to the client.
   */
  consume(socketId: string, event: string): { allowed: boolean; notify: boolean } {
    const rule: RateLimitRule = RATE_LIMITS[event] ?? DEFAULT_RATE_LIMIT;
    const state = this.getOrCreate(socketId);
    const bucket = this.getOrCreateBucket(state, event, rule);

    this.refill(bucket, rule);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, notify: false };
    }

    // Throttled — decide whether to notify the client.
    const shouldNotify = !!(rule.notify);
    if (shouldNotify) {
      const now = Date.now();
      const last = state.lastNotify.get(event) ?? 0;
      if (now - last >= RATE_LIMIT_NOTIFY_GAP_MS) {
        state.lastNotify.set(event, now);
        logger.debug(`[RATE_LIMIT] socket=${socketId} event=${event} throttled`);
        return { allowed: false, notify: true };
      }
    }

    return { allowed: false, notify: false };
  }

  private getOrCreate(socketId: string): SocketState {
    let s = this.sockets.get(socketId);
    if (!s) {
      s = { buckets: new Map(), lastNotify: new Map() };
      this.sockets.set(socketId, s);
    }
    return s;
  }

  private getOrCreateBucket(state: SocketState, event: string, rule: RateLimitRule): Bucket {
    let b = state.buckets.get(event);
    if (!b) {
      b = { tokens: rule.capacity, lastRefill: Date.now() };
      state.buckets.set(event, b);
    }
    return b;
  }

  private refill(bucket: Bucket, rule: RateLimitRule): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    bucket.tokens = Math.min(rule.capacity, bucket.tokens + elapsed * rule.refillPerSec);
    bucket.lastRefill = now;
  }
}

/** Singleton shared across all socket handlers. */
export const socketRateLimiter = new SocketRateLimiter();
