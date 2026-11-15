import { randomUUID } from 'crypto';

/** Process-local room/profile maps require exactly one Redis-backed writer. */
export const REDIS_AUTHORITY_KEY = 'uno:authority:lease';

export class AuthorityLostError extends Error {
  constructor(message = 'Redis authority lease is no longer owned') {
    super(message);
    this.name = 'AuthorityLostError';
  }
}

type LeaseClient = {
  set(...args: any[]): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: any[]): Promise<unknown>;
};

export interface AuthorityLeaseOptions {
  ttlMs?: number;
  renewIntervalMs?: number;
  commandTimeoutMs?: number;
  onLost?: (error: Error) => void;
  /** Monotonic clock by default; injectable for deterministic expiry tests. */
  now?: () => number;
}

const OWNED_GUARD = "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end\n";

export class RedisAuthorityLease {
  private readonly token = randomUUID();
  private readonly ttlMs: number;
  private readonly renewIntervalMs: number;
  private readonly commandTimeoutMs: number;
  private readonly now: () => number;
  private deadline = 0;
  private active = false;
  private timer: NodeJS.Timeout | null = null;

  private constructor(private client: LeaseClient, private options: AuthorityLeaseOptions) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.renewIntervalMs = options.renewIntervalMs ?? 10_000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 3_000;
    this.now = options.now ?? (() => performance.now());
    if (![this.ttlMs, this.renewIntervalMs, this.commandTimeoutMs].every((n) => Number.isFinite(n) && n > 0)
      || this.renewIntervalMs + this.commandTimeoutMs >= this.ttlMs) {
      throw new Error('Redis lease renewal interval plus command timeout must be shorter than its TTL');
    }
  }

  static async acquire(client: LeaseClient, options: AuthorityLeaseOptions = {}): Promise<RedisAuthorityLease> {
    const lease = new RedisAuthorityLease(client, options);
    const startedAt = lease.now();
    const result = await lease.bounded(client.set(REDIS_AUTHORITY_KEY, lease.token, 'PX', lease.ttlMs, 'NX'));
    if (result !== 'OK') throw new Error('Another backend already owns the Redis authority lease; run one active writer per Redis database');
    lease.deadline = startedAt + lease.ttlMs;
    lease.active = true;
    lease.assertOwned();
    lease.scheduleRenewal();
    return lease;
  }

  private bounded<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Redis authority command timed out')), this.commandTimeoutMs);
      timer.unref();
      operation.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  private lose(error: Error): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.options.onLost?.(error);
  }

  assertOwned(): void {
    if (!this.active || this.now() >= this.deadline) {
      const error = new AuthorityLostError();
      this.lose(error);
      throw error;
    }
  }

  get isOwned(): boolean {
    if (!this.active) return false;
    if (this.now() >= this.deadline) this.lose(new AuthorityLostError());
    return this.active;
  }

  private scheduleRenewal(): void {
    this.timer = setTimeout(() => { void this.renew(); }, this.renewIntervalMs);
    this.timer.unref();
  }

  private async renew(): Promise<void> {
    try {
      this.assertOwned();
      const startedAt = this.now();
      const result = await this.bounded(this.client.eval(
        OWNED_GUARD + "return redis.call('PEXPIRE', KEYS[1], ARGV[2])",
        1, REDIS_AUTHORITY_KEY, this.token, this.ttlMs
      ));
      // A late reply cannot revive an authority that already failed closed.
      this.assertOwned();
      if (result !== 1) throw new AuthorityLostError();
      this.deadline = startedAt + this.ttlMs;
      this.scheduleRenewal();
    } catch (error) {
      this.lose(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Every durable mutation checks the token inside Redis, including commands
   * still in flight after a partition. Body KEYS start at 2; ARGV start at 2.
   * Body must return 1 on success. The token is private and never logged.
   */
  async write(client: LeaseClient, body: string, keys: string[], args: (string | number)[] = []): Promise<void> {
    this.assertOwned();
    try {
      const result = await this.bounded(client.eval(
        OWNED_GUARD + body, keys.length + 1, REDIS_AUTHORITY_KEY, ...keys, this.token, ...args
      ));
      this.assertOwned();
      if (result !== 1) throw new AuthorityLostError();
    } catch (error) {
      this.lose(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  saveIndexedSnapshot(client: LeaseClient, key: string, index: string, id: string, json: string): Promise<void> {
    return this.write(client,
      "redis.call('SET', KEYS[2], ARGV[3]); redis.call('SADD', KEYS[3], ARGV[2]); return 1",
      [key, index], [id, json]);
  }

  removeIndexedSnapshot(client: LeaseClient, key: string, index: string, id: string): Promise<void> {
    return this.write(client,
      "redis.call('DEL', KEYS[2]); redis.call('SREM', KEYS[3], ARGV[2]); return 1",
      [key, index], [id]);
  }

  pruneIndex(client: LeaseClient, index: string, ids: string[]): Promise<void> {
    if (!ids.length) return Promise.resolve();
    return this.write(client,
      "for i = 2, #ARGV do redis.call('SREM', KEYS[2], ARGV[i]) end; return 1",
      [index], ids);
  }

  /** Called only after clean persistence drains; never deletes a newer lease. */
  async release(): Promise<void> {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.bounded(this.client.eval(
      OWNED_GUARD + "return redis.call('DEL', KEYS[1])", 1, REDIS_AUTHORITY_KEY, this.token
    ));
  }
}
