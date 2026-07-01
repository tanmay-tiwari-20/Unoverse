import { promises as fs } from 'fs';
import path from 'path';
import { Room } from './roomManager';
import { logger } from '../utils/logger';

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
 * only one that also enables horizontal scaling later (shared state across
 * instances). ioredis is imported lazily so the file/memory paths need no Redis.
 */
export class RedisRoomStore implements RoomStore {
  private client: any;
  private readonly keyPrefix = 'uno:room:';
  private readonly indexKey = 'uno:rooms';

  private constructor(client: any) {
    this.client = client;
  }

  static async create(url: string): Promise<RedisRoomStore> {
    // Lazy import: only pulled in when Redis is actually selected.
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    await client.connect();
    logger.info(`[STORE] Connected to Redis at ${url.replace(/\/\/.*@/, '//***@')}`);
    return new RedisRoomStore(client);
  }

  private key(code: string): string {
    return `${this.keyPrefix}${code.toUpperCase()}`;
  }

  async loadAll(): Promise<Room[]> {
    const codes: string[] = await this.client.smembers(this.indexKey);
    if (!codes.length) return [];
    const keys = codes.map((c) => this.key(c));
    const values: (string | null)[] = await this.client.mget(keys);
    const rooms: Room[] = [];
    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      if (!raw) {
        // Index references a room whose snapshot is gone — clean up the dangling ref.
        await this.client.srem(this.indexKey, codes[i]);
        continue;
      }
      try {
        rooms.push(JSON.parse(raw) as Room);
      } catch (err: any) {
        logger.error(`[STORE] Skipping unparseable Redis room ${codes[i]}:`, err?.message);
      }
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

  async close(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Build the configured store from env:
 *   STORE=redis  + REDIS_URL   -> RedisRoomStore  (production, scalable)
 *   STORE=memory               -> MemoryRoomStore (no persistence)
 *   STORE=file (default)       -> FileRoomStore   (DATA_DIR or ./.data/rooms)
 *
 * If a real store fails to initialize we fall back to MemoryRoomStore rather than
 * refusing to boot — the game still works, just without durability.
 */
export async function createRoomStore(): Promise<RoomStore> {
  const kind = (process.env.STORE || 'file').toLowerCase();

  try {
    if (kind === 'memory') {
      logger.info('[STORE] Using in-memory store (no persistence).');
      return new MemoryRoomStore();
    }
    if (kind === 'redis') {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error('STORE=redis requires REDIS_URL to be set');
      return await RedisRoomStore.create(url);
    }
    // Default: file
    const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data', 'rooms');
    logger.info(`[STORE] Using file store at ${dir}`);
    return new FileRoomStore(dir);
  } catch (err: any) {
    logger.error(`[STORE] Failed to initialize '${kind}' store, falling back to in-memory:`, err?.message);
    return new MemoryRoomStore();
  }
}
