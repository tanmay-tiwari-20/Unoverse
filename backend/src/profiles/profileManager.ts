import { randomUUID, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger';
import { ProfileStore, MemoryProfileStore } from './profileStore';
import { PROFILE_CONFIG } from '../config/serverConfig';
import {
  Profile,
  ProfileStats,
  PublicProfile,
  MatchRecord,
  RoundStatDelta,
  CounterStatKey,
  emptyStats,
  normalizeProfile,
  publicProfile,
} from './profileTypes';

/** Input for committing one player's completed round to their profile. */
export interface RoundResultInput {
  delta: RoundStatDelta;
  won: boolean;      // did this player win the round?
  placement: number; // finish position this round (1 = round winner)
  points: number;    // UNO points this player banked this round
}

/** Input for committing one player's completed round to their match-level stats. */
export interface MatchResultInput {
  won: boolean;       // did this player win the round?
  placement: number;  // final standing (1 = winner)
  record: MatchRecord;
  playTimeMs: number; // wall-clock length of the round
  lossMargin?: number | null; // points behind the winner (losers only)
}

/**
 * ============================================================================
 *  ProfileManager — server-authoritative store of player identities + stats.
 * ============================================================================
 *
 * Structurally identical to RoomManager: an in-memory Map is the synchronous
 * source of truth and every mutation is mirrored to a durable ProfileStore via
 * a coalesced, write-through flush. Stats are NEVER accepted from clients — the
 * only client-authenticated writes are display-name / avatar edits and stat
 * resets, each gated by the profile's private secret. All counters are computed
 * here from server-side game state.
 */
class ProfileManager {
  private profiles: Map<string, Profile> = new Map();
  private tags: Set<string> = new Set();

  private store: ProfileStore = new MemoryProfileStore();
  private dirty: Set<string> = new Set();
  private removed: Set<string> = new Set();
  private flushScheduled = false;

  /** Inject the durable store (called once at startup). */
  public setStore(store: ProfileStore): void {
    this.store = store;
  }

  /** Rehydrate all persisted profiles into memory on startup, backfilling any
   *  fields missing from older/seed snapshots. */
  public async hydrate(): Promise<void> {
    const loaded = await this.store.loadAll();
    let backfilled = 0;
    for (const raw of loaded) {
      if (!raw || typeof raw.id !== 'string' || !raw.id) continue;
      const before = JSON.stringify(raw);
      const profile = normalizeProfile(raw, () => randomUUID());
      this.profiles.set(profile.id, profile);
      if (profile.tag) this.tags.add(profile.tag.toUpperCase());
      // A legacy snapshot missing new fields (e.g. `secret`) is re-persisted so
      // the backfill is durable rather than recomputed every boot.
      if (JSON.stringify(profile) !== before) {
        this.markDirty(profile.id);
        backfilled++;
      }
    }
    if (loaded.length) {
      logger.info(`[PROFILE_STORE] Rehydrated ${loaded.length} profile(s)${backfilled ? ` (${backfilled} backfilled)` : ''}.`);
    }
  }

  // ---- Write-through persistence (mirror of RoomManager) --------------------

  public markDirty(id: string): void {
    this.removed.delete(id);
    this.dirty.add(id);
    this.scheduleFlush();
  }

  private markRemoved(id: string): void {
    this.dirty.delete(id);
    this.removed.add(id);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flush());
  }

  private async flush(): Promise<void> {
    this.flushScheduled = false;
    const toSave = [...this.dirty];
    const toRemove = [...this.removed];
    this.dirty.clear();
    this.removed.clear();

    await Promise.all([
      ...toSave.map(async (id) => {
        const profile = this.profiles.get(id);
        if (!profile) return;
        try {
          await this.store.save(profile);
        } catch (err: any) {
          logger.error(`[PROFILE_STORE] Failed to persist profile ${id}:`, err?.message);
        }
      }),
      ...toRemove.map(async (id) => {
        try {
          await this.store.remove(id);
        } catch (err: any) {
          logger.error(`[PROFILE_STORE] Failed to remove profile ${id}:`, err?.message);
        }
      }),
    ]);
  }

  /** Flush pending writes and close the store on graceful shutdown. */
  public async shutdown(): Promise<void> {
    await this.flush();
    if (this.store.close) {
      try {
        await this.store.close();
      } catch (err: any) {
        logger.error('[PROFILE_STORE] Error closing store on shutdown:', err?.message);
      }
    }
  }

  // ---- Identity ------------------------------------------------------------

  private generateTag(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let tag = '';
    let attempts = 0;
    do {
      tag = '';
      for (let i = 0; i < 4; i++) {
        tag += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
    } while (this.tags.has(tag) && attempts < 50);
    this.tags.add(tag);
    return tag;
  }

  /**
   * Create a brand-new profile. Returns the FULL profile including its private
   * `secret` — this is the only time the secret is handed out (to the creator,
   * who stores it client-side and presents it to authenticate future edits).
   */
  public createProfile(input: { displayName: string; avatar?: string | null; outfit?: string | null }): Profile {
    const now = Date.now();
    const displayName = input.displayName.trim().slice(0, 40) || 'Player';
    const profile: Profile = {
      id: randomUUID(),
      secret: randomUUID(),
      displayName,
      tag: this.generateTag(),
      avatarUrl: input.avatar ? String(input.avatar).slice(0, 64) : null,
      outfit: input.outfit ? String(input.outfit).slice(0, 64) : null,
      isGuest: true,
      providers: ['guest'],
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      totalPlayTimeMs: 0,
      tokenVersion: 1,
      stats: emptyStats(),
      rankedStats: emptyStats(),
      recentMatches: [],
    };
    this.profiles.set(profile.id, profile);
    this.markDirty(profile.id);
    logger.debug(`[PROFILE_CREATED] ${displayName}#${profile.tag} (${profile.id})`);
    return profile;
  }

  public getProfile(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  public getPublicProfile(id: string): PublicProfile | undefined {
    const p = this.profiles.get(id);
    return p ? publicProfile(p) : undefined;
  }

  /** Verify a caller owns a profile by matching its secret (constant-time). */
  public verify(id: string, secret: string | undefined | null): boolean {
    const p = this.profiles.get(id);
    if (!p || !secret) return false;
    const a = Buffer.from(p.secret);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /** Update last-seen timestamp (called on join). No-op for unknown ids. */
  public touchLastSeen(id: string): void {
    const p = this.profiles.get(id);
    if (!p) return;
    p.lastSeenAt = Date.now();
    this.markDirty(id);
  }

  /** Rename a profile (secret-authenticated). Player ID and stats are untouched. */
  public renameProfile(id: string, secret: string, displayName: string): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.profiles.get(id)!;
    const trimmed = displayName.trim().slice(0, 40);
    if (!trimmed) throw new Error('Display name cannot be empty');
    p.displayName = trimmed;
    p.updatedAt = Date.now();
    this.markDirty(id);
    return publicProfile(p);
  }

  /** Change a profile's preset avatar (secret-authenticated). */
  public setAvatar(id: string, secret: string, avatar: string | null): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.profiles.get(id)!;
    p.avatarUrl = avatar ? String(avatar).slice(0, 64) : null;
    p.updatedAt = Date.now();
    this.markDirty(id);
    return publicProfile(p);
  }

  /** Change a profile's cosmetic outfit (secret-authenticated). Purely visual;
   *  never touches identity or stats. Mirror of setAvatar. */
  public setOutfit(id: string, secret: string, outfit: string | null): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.profiles.get(id)!;
    p.outfit = outfit ? String(outfit).slice(0, 64) : null;
    p.updatedAt = Date.now();
    this.markDirty(id);
    return publicProfile(p);
  }

  /** Reset all statistics/history (secret-authenticated). Keeps the same id/tag. */
  public resetProfile(id: string, secret: string): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.profiles.get(id)!;
    p.stats = emptyStats();
    p.rankedStats = emptyStats();
    p.recentMatches = [];
    p.totalPlayTimeMs = 0;
    p.updatedAt = Date.now();
    this.markDirty(id);
    logger.debug(`[PROFILE_RESET] ${p.displayName}#${p.tag} (${id})`);
    return publicProfile(p);
  }

  // ---- Server-authoritative stat commits -----------------------------------

  /**
   * Commit one completed ROUND to a profile's casual stats. Folds the per-round
   * action delta into the lifetime counters, banks points, updates placement
   * aggregates, and increments rounds played/won. Match-level counters and
   * streaks are handled separately by applyMatchResult.
   */
  public applyRoundResult(id: string, input: RoundResultInput): void {
    const p = this.profiles.get(id);
    if (!p) return;
    const s = p.stats;

    s.roundsPlayed += 1;
    if (input.won) s.roundsWon += 1;
    s.pointsScored += Math.max(0, Math.round(input.points));

    if (input.placement > 0) {
      s.placementSum += input.placement;
      s.placementCount += 1;
    }

    // Fold every additive per-round counter into the lifetime totals.
    const d = input.delta;
    const counterKeys: CounterStatKey[] = [
      'cardsPlayed', 'cardsDrawn', 'wildsPlayed', 'wildDrawFourPlayed',
      'drawCardsPlayed', 'reverseCardsPlayed', 'skipCardsPlayed', 'unoCalls',
      'lastCardCalls', 'unoPenalties', 'challengesWon', 'challengesLost', 'jumpIns',
    ];
    for (const key of counterKeys) {
      const add = (d as unknown as Record<string, number>)[key] ?? 0;
      if (Number.isFinite(add) && add > 0) {
        (s[key] as number) += add;
      }
    }

    p.updatedAt = Date.now();
    this.markDirty(id);
  }

  /**
   * Commit one completed ROUND to a profile's match-level stats: matches
   * played/won, win-streak update, total play time, closest-loss, and push a
   * capped history record. A round IS the unit of record, so this is called once
   * per participant per completed round, alongside applyRoundResult.
   */
  public applyMatchResult(id: string, input: MatchResultInput): void {
    const p = this.profiles.get(id);
    if (!p) return;
    const s = p.stats;

    s.matchesPlayed += 1;
    if (input.won) {
      s.matchesWon += 1;
      s.currentStreak += 1;
      if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
    } else {
      s.currentStreak = 0;
      if (typeof input.lossMargin === 'number' && input.lossMargin >= 0) {
        s.closestLoss = s.closestLoss === null ? input.lossMargin : Math.min(s.closestLoss, input.lossMargin);
      }
    }

    p.totalPlayTimeMs += Math.max(0, Math.round(input.playTimeMs));

    p.recentMatches.unshift(input.record);
    if (p.recentMatches.length > PROFILE_CONFIG.recentMatchesMax) {
      p.recentMatches.length = PROFILE_CONFIG.recentMatchesMax;
    }

    p.updatedAt = Date.now();
    p.lastSeenAt = Date.now();
    this.markDirty(id);
  }

  // ---- Diagnostics ---------------------------------------------------------

  public getProfileCount(): number {
    return this.profiles.size;
  }
}

export const profileManager = new ProfileManager();
