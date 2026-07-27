import { promises as fs } from 'fs';
import path from 'path';
import { Profile } from './profileTypes';
import { logger } from '../utils/logger';

/**
 * Durable storage for player profiles. Mirrors the RoomStore pattern exactly:
 * the ProfileManager keeps an in-memory Map as the fast, synchronous source of
 * truth and mirrors every mutation here (write-through), so profiles + lifetime
 * stats survive a server restart.
 *
 * Implementations are simple key/value snapshots keyed by profile id — the whole
 * Profile (stats, match history) is JSON-serializable.
 */
export interface ProfileStore {
  /** Load every persisted profile on startup. */
  loadAll(): Promise<Profile[]>;
  /** Persist (create or overwrite) a single profile snapshot. */
  save(profile: Profile): Promise<void>;
  /** Remove a profile snapshot. */
  remove(id: string): Promise<void>;
  /** Optional teardown (close connections). */
  close?(): Promise<void>;
}

/**
 * No-op store. Nothing is persisted and loadAll() returns nothing. Used when
 * STORE=memory (or as a safe fallback if a real store fails to initialize), and
 * as the default in unit tests.
 */
export class MemoryProfileStore implements ProfileStore {
  async loadAll(): Promise<Profile[]> { return []; }
  async save(_profile: Profile): Promise<void> { /* no-op */ }
  async remove(_id: string): Promise<void> { /* no-op */ }
}

/**
 * File-backed store: one JSON file per profile under PROFILE_DIR (default
 * ./.data/profiles). Writes are atomic (temp file + rename) so a crash mid-write
 * can't corrupt a snapshot. Zero infrastructure — survives restart on a single
 * machine. This is the store that reads/writes the existing seed files.
 */
export class FileProfileStore implements ProfileStore {
  constructor(private dir: string) {}

  private fileFor(id: string): string {
    // Profile ids are UUIDs; still guard against path traversal by allowing only
    // the characters a UUID uses.
    const safe = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
    return path.join(this.dir, `${safe}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async loadAll(): Promise<Profile[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir).catch(() => [] as string[]);
    const profiles: Profile[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf8');
        profiles.push(JSON.parse(raw) as Profile);
      } catch (err: any) {
        logger.error(`[PROFILE_STORE] Skipping unreadable profile file ${file}:`, err?.message);
      }
    }
    return profiles;
  }

  async save(profile: Profile): Promise<void> {
    await this.ensureDir();
    const target = this.fileFor(profile.id);
    const tmp = `${target}.${process.pid}.tmp`;
    const data = JSON.stringify(profile);
    await fs.writeFile(tmp, data, 'utf8');
    await fs.rename(tmp, target); // atomic replace
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.fileFor(id), { force: true });
  }
}

/**
 * Redis-backed store. Each profile is a JSON string under `uno:profile:<id>`,
 * all tracked in a set `uno:profiles` for loadAll(). The production path and the
 * one that also enables cross-instance shared profiles / leaderboards later.
 * ioredis is imported lazily so the file/memory paths need no Redis.
 */
export class RedisProfileStore implements ProfileStore {
  private client: any;
  private readonly keyPrefix = 'uno:profile:';
  private readonly indexKey = 'uno:profiles';

  private constructor(client: any) {
    this.client = client;
  }

  static async create(url: string): Promise<RedisProfileStore> {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    await client.connect();
    logger.info(`[PROFILE_STORE] Connected to Redis at ${url.replace(/\/\/.*@/, '//***@')}`);
    return new RedisProfileStore(client);
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  async loadAll(): Promise<Profile[]> {
    const ids: string[] = await this.client.smembers(this.indexKey);
    if (!ids.length) return [];
    const keys = ids.map((id) => this.key(id));
    const values: (string | null)[] = await this.client.mget(keys);
    const profiles: Profile[] = [];
    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      if (!raw) {
        await this.client.srem(this.indexKey, ids[i]);
        continue;
      }
      try {
        profiles.push(JSON.parse(raw) as Profile);
      } catch (err: any) {
        logger.error(`[PROFILE_STORE] Skipping unparseable Redis profile ${ids[i]}:`, err?.message);
      }
    }
    return profiles;
  }

  async save(profile: Profile): Promise<void> {
    await this.client
      .multi()
      .set(this.key(profile.id), JSON.stringify(profile))
      .sadd(this.indexKey, profile.id)
      .exec();
  }

  async remove(id: string): Promise<void> {
    await this.client.multi().del(this.key(id)).srem(this.indexKey, id).exec();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Build the configured profile store from env — the SAME STORE / REDIS_URL knobs
 * that select the room store, so profiles and rooms persist to the same backend:
 *   STORE=redis  + REDIS_URL   -> RedisProfileStore
 *   STORE=memory               -> MemoryProfileStore (no persistence)
 *   STORE=file (default)       -> FileProfileStore (PROFILE_DIR or ./.data/profiles)
 *
 * Falls back to MemoryProfileStore on failure rather than refusing to boot.
 */
export async function createProfileStore(): Promise<ProfileStore> {
  const kind = (process.env.STORE || 'file').toLowerCase();

  try {
    if (kind === 'memory') {
      logger.info('[PROFILE_STORE] Using in-memory profile store (no persistence).');
      return new MemoryProfileStore();
    }
    if (kind === 'redis') {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error('STORE=redis requires REDIS_URL to be set');
      return await RedisProfileStore.create(url);
    }
    // Default: file. PROFILE_DIR is the sibling of the rooms' DATA_DIR.
    const dir = process.env.PROFILE_DIR || path.join(process.cwd(), '.data', 'profiles');
    logger.info(`[PROFILE_STORE] Using file store at ${dir}`);
    return new FileProfileStore(dir);
  } catch (err: any) {
    logger.error(`[PROFILE_STORE] Failed to initialize '${kind}' store, falling back to in-memory:`, err?.message);
    return new MemoryProfileStore();
  }
}
