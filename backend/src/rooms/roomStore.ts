import { promises as fs } from 'fs';
import path from 'path';
import { Room } from './roomManager';
import { logger } from '../utils/logger';
import { getRedis, isRedisConfigured } from '../config/redis';

/**
 * Durable storage for rooms. The RoomManager keeps an in-memory Map as the fast,
 * synchronous source of truth and mirrors every mutation here (write-through), so
 * a server restart can rehydrate all in-progress games instead of dropping them.
 *
 * Implementations are intentionally simple key/value snapshots keyed by room code
 * — the whole Room (including its UnoGameState) is JSON-serializable.
 */
export interface RoomStore {
  /** Load every persisted room on startup. */
  loadAll(): Promise<Room[]>;
  /** Persist (create or overwrite) a single room snapshot. */
  save(room: Room): Promise<void>;
  /** Remove a room snapshot (room deleted / emptied). */
  remove(code: string): Promise<void>;
  /** Optional teardown (close connections). */
  close?(): Promise<void>;
}

/**
 * No-op store. Behaves exactly like the original in-memory-only server: nothing is
 * persisted and loadAll() returns nothing. Used when STORE=memory (or as a safe
 * fallback if a real store fails to initialize).
 */
export class MemoryRoomStore implements RoomStore {
  async loadAll(): Promise<Room[]> { return []; }
  async save(_room: Room): Promise<void> { /* no-op */ }
  async remove(_code: string): Promise<void> { /* no-op */ }
}

/**
 * File-backed store: one JSON file per room under DATA_DIR (default ./.data/rooms).
 * Writes are atomic (temp file + rename) so a crash mid-write can't corrupt a
 * snapshot. Zero infrastructure — survives restart on a single machine.
 */
export class FileRoomStore implements RoomStore {
  constructor(private dir: string) {}

  private fileFor(code: string): string {
    // Room codes are [A-Z0-9]{6}; still guard against path traversal.
    const safe = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return path.join(this.dir, `${safe}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async loadAll(): Promise<Room[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir).catch(() => [] as string[]);
    const rooms: Room[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf8');
        rooms.push(JSON.parse(raw) as Room);
      } catch (err: any) {
        logger.error(`[STORE] Skipping unreadable room file ${file}:`, err?.message);
      }
    }
    return rooms;
  }

  async save(room: Room): Promise<void> {
    await this.ensureDir();
    const target = this.fileFor(room.code);
    const tmp = `${target}.${process.pid}.tmp`;
    const data = JSON.stringify(room);
    await fs.writeFile(tmp, data, 'utf8');
    await fs.rename(tmp, target); // atomic replace
  }

  async remove(code: string): Promise<void> {
    await fs.rm(this.fileFor(code), { force: true });
  }
}

/**
 * Redis-backed store. Each room is a JSON string under key `uno:room:<CODE>`, all
 * tracked in a set `uno:rooms` for loadAll(). This is the production path and the
 * only one that also enables horizontal scaling (shared state across instances).
 *
 * Connection handling lives in config/redis.ts — this store borrows the shared
 * command client rather than opening its own, so rooms + profiles cost ONE
 * connection between them.
 */
export class RedisRoomStore implements RoomStore {
  private client: any;
  private readonly keyPrefix = 'uno:room:';
  private readonly indexKey = 'uno:rooms';
  /** Max keys fetched per MGET. Bounds both the Redis-side reply buffer and our
   *  peak heap when a deployment has thousands of live rooms. */
  private static readonly BATCH = 200;

  private constructor(client: any) {
    this.client = client;
  }

  /** Borrow the process-wide shared client (connects on first use). */
  static async create(): Promise<RedisRoomStore> {
    const client = await getRedis();
    logger.info('[STORE] Using Redis room store (uno:room:*).');
    return new RedisRoomStore(client);
  }

  private key(code: string): string {
    return `${this.keyPrefix}${code.toUpperCase()}`;
  }

  async loadAll(): Promise<Room[]> {
    const codes: string[] = await this.client.smembers(this.indexKey);
    if (!codes.length) return [];

    const rooms: Room[] = [];
    const dangling: string[] = [];

    // Fetch in bounded batches — a single MGET over every key would build one
    // giant reply, which is the classic way a rehydrate spikes memory on a busy
    // deployment.
    for (let start = 0; start < codes.length; start += RedisRoomStore.BATCH) {
      const slice = codes.slice(start, start + RedisRoomStore.BATCH);
      const values: (string | null)[] = await this.client.mget(slice.map((c) => this.key(c)));
      for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        if (!raw) {
          // The index references a room whose snapshot expired or was deleted.
          dangling.push(slice[i]);
          continue;
        }
        try {
          rooms.push(JSON.parse(raw) as Room);
        } catch (err: any) {
          logger.error(`[STORE] Skipping unparseable Redis room ${slice[i]}:`, err?.message);
          dangling.push(slice[i]);
        }
      }
    }

    // Clean up every dangling index entry in ONE round trip rather than issuing
    // an SREM per orphan inside the read loop.
    if (dangling.length) {
      await this.client.srem(this.indexKey, ...dangling).catch(() => {});
      logger.debug(`[STORE] Pruned ${dangling.length} dangling room index entr(ies).`);
    }

    return rooms;
  }

  async save(room: Room): Promise<void> {
    const code = room.code.toUpperCase();
    await this.client
      .multi()
      .set(this.key(code), JSON.stringify(room))
      .sadd(this.indexKey, code)
      .exec();
  }

  async remove(code: string): Promise<void> {
    const upper = code.toUpperCase();
    await this.client.multi().del(this.key(upper)).srem(this.indexKey, upper).exec();
  }

  // No close(): the shared client's lifecycle is owned by config/redis.ts and
  // closed once at shutdown. Closing it here would pull the connection out from
  // under the profile store.
}

/**
 * Build the configured store from env:
 *   STORE=redis  + REDIS_URL   -> RedisRoomStore  (production, scalable)
 *   STORE=memory               -> MemoryRoomStore (no persistence)
 *   STORE=file (default)       -> FileRoomStore   (DATA_DIR or ./.data/rooms)
 *
 * FAILURE POLICY — deliberately different by environment:
 *
 *   Production (NODE_ENV=production) with STORE=redis: a failure to reach Redis
 *   THROWS. Silently degrading to in-memory here is worse than not starting: the
 *   instance would look healthy, accept traffic, and quietly drop every game on
 *   restart — and in a multi-instance deploy it would serve state that diverges
 *   from its peers. Failing loudly lets the platform retry / hold the rollout.
 *
 *   Development: fall back to in-memory with a loud warning so a missing local
 *   Redis never blocks you from working on gameplay.
 */
export async function createRoomStore(): Promise<RoomStore> {
  const kind = (process.env.STORE || 'file').toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';

  try {
    if (kind === 'memory') {
      logger.info('[STORE] Using in-memory store (no persistence).');
      return new MemoryRoomStore();
    }
    if (kind === 'redis') {
      if (!isRedisConfigured()) {
        throw new Error('STORE=redis requires REDIS_URL to be set');
      }
      return await RedisRoomStore.create();
    }
    // Default: file
    const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data', 'rooms');
    logger.info(`[STORE] Using file store at ${dir}`);
    return new FileRoomStore(dir);
  } catch (err: any) {
    if (kind === 'redis' && isProd) {
      // Re-throw: index.ts turns this into a clear message + non-zero exit.
      throw new Error(`Failed to initialize the Redis room store: ${err?.message}`);
    }
    logger.error(
      `[STORE] Failed to initialize '${kind}' store, falling back to in-memory:`,
      err?.message
    );
    return new MemoryRoomStore();
  }
}
