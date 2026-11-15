/**
 * Per-socket and persistent per-IP token-bucket rate limiter.
 *
 * Each socket gets one bucket per event type. Tokens refill continuously at
 * `refillPerSec` up to `capacity`. A request costs 1 token; when the bucket is
 * empty the request is rejected. Buckets are lazily created and automatically
 * pruned when a socket disconnects. IP buckets survive reconnects and expire
 * only after inactivity; aggregate limits allow several humans behind one NAT.
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

interface IpState extends SocketState {
  connections: number;
  lastSeen: number;
}

export interface IpLimitConfig {
  maxConnections: number;
  connectionCapacity: number;
  connectionRefillPerSec: number;
  eventMultiplier: number;
  totalCapacity: number;
  totalRefillPerSec: number;
  retentionMs: number;
  maxTrackedIps: number;
}

const positive = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return raw?.trim() && Number.isFinite(value) && value > 0 ? value : fallback;
};

export const IP_LIMIT_CONFIG: IpLimitConfig = {
  maxConnections: positive(process.env.RL_IP_MAX_CONNECTIONS, 32),
  connectionCapacity: positive(process.env.RL_IP_CONNECTION_CAPACITY, 60),
  connectionRefillPerSec: positive(process.env.RL_IP_CONNECTION_REFILL_PER_SEC, 1),
  eventMultiplier: positive(process.env.RL_IP_EVENT_MULTIPLIER, 4),
  totalCapacity: positive(process.env.RL_IP_TOTAL_CAPACITY, 500),
  totalRefillPerSec: positive(process.env.RL_IP_TOTAL_REFILL_PER_SEC, 150),
  retentionMs: 5 * 60_000,
  maxTrackedIps: 10_000,
};

export class SocketRateLimiter {
  /** socketId -> per-event buckets */
  private sockets = new Map<string, SocketState>();
  private socketIps = new Map<string, string>();
  private ips = new Map<string, IpState>();
  private lastPrune = 0;

  constructor(private readonly ipConfig: IpLimitConfig = IP_LIMIT_CONFIG) {}

  /** Admission burst and event buckets survive namespace/socket reconnects. */
  registerSocket(socketId: string, ip: string): boolean {
    if (this.socketIps.has(socketId)) return true;
    const now = Date.now();
    if (now - this.lastPrune > 60_000 || this.ips.size >= this.ipConfig.maxTrackedIps) this.pruneIps(now);
    let state = this.ips.get(ip);
    if (!state) {
      if (this.ips.size >= this.ipConfig.maxTrackedIps) return false;
      state = { buckets: new Map(), lastNotify: new Map(), connections: 0, lastSeen: now };
      this.ips.set(ip, state);
    }
    state.lastSeen = now;
    if (state.connections >= this.ipConfig.maxConnections) return false;
    const rule = { capacity: this.ipConfig.connectionCapacity, refillPerSec: this.ipConfig.connectionRefillPerSec };
    if (!this.take(state, ':connections', rule)) return false;
    state.connections++;
    this.socketIps.set(socketId, ip);
    return true;
  }

  private pruneIps(now: number): void {
    this.lastPrune = now;
    for (const [ip, state] of this.ips) {
      if (state.connections === 0 && now - state.lastSeen >= this.ipConfig.retentionMs) this.ips.delete(ip);
    }
  }

  /** Call on socket disconnect to free memory. */
  removeSocket(socketId: string): void {
    this.sockets.delete(socketId);
    const ip = this.socketIps.get(socketId);
    this.socketIps.delete(socketId);
    const state = ip && this.ips.get(ip);
    if (state) { state.connections = Math.max(0, state.connections - 1); state.lastSeen = Date.now(); }
  }

  /**
   * Attempt to consume one token for `event` on `socketId`.
   * Returns `{ allowed: true }` or `{ allowed: false, notify: boolean }`.
   * `notify` is true when the caller should emit a throttle error to the client.
   */
  consume(socketId: string, event: string): { allowed: boolean; notify: boolean } {
    const rule: RateLimitRule = RATE_LIMITS[event] ?? DEFAULT_RATE_LIMIT;
    const state = this.getOrCreate(socketId);
    const ip = this.socketIps.get(socketId);
    const ipState = ip ? this.ips.get(ip) : undefined;
    let ipAllowed = true;
    if (ipState) {
      ipState.lastSeen = Date.now();
      const eventRule = {
        capacity: rule.capacity * this.ipConfig.eventMultiplier,
        refillPerSec: rule.refillPerSec * this.ipConfig.eventMultiplier,
      };
      ipAllowed = this.take(ipState, ':total', {
        capacity: this.ipConfig.totalCapacity, refillPerSec: this.ipConfig.totalRefillPerSec,
      }) && this.take(ipState, event, eventRule);
    }

    if (ipAllowed && this.take(state, event, rule)) {
      return { allowed: true, notify: false };
    }

    // Throttled — decide whether to notify the client.
    const shouldNotify = !!(rule.notify);
    if (shouldNotify) {
      const now = Date.now();
      const noticeState = ipState ?? state;
      const last = noticeState.lastNotify.get(event) ?? -Infinity;
      if (now - last >= RATE_LIMIT_NOTIFY_GAP_MS) {
        noticeState.lastNotify.set(event, now);
        logger.debug(`[RATE_LIMIT] socket=${socketId} event=${event} throttled`);
        return { allowed: false, notify: true };
      }
    }

    return { allowed: false, notify: false };
  }

  private take(state: SocketState, event: string, rule: RateLimitRule): boolean {
    const bucket = this.getOrCreateBucket(state, event, rule);
    this.refill(bucket, rule);
    if (bucket.tokens < 1) return false;
    bucket.tokens--;
    return true;
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
