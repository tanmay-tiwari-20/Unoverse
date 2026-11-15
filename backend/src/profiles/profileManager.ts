import { randomUUID, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger';
import { ProfileStore, MemoryProfileStore } from './profileStore';
import { PROFILE_CONFIG } from '../config/serverConfig';
import { PlayerIdAllocator, isPlayerId, parsePlayerId, isPlayerIdFragment } from './playerId';
import {
  Profile,
  ProfileStats,
  PublicProfile,
  MatchRecord,
  SocialGraph,
  RoundStatDelta,
  CounterStatKey,
  PrivacySettings,
  emptyStats,
  emptySocialGraph,
  defaultPrivacy,
  normalizePrivacy,
  normalizeProfile,
  publicProfile,
  sanitizeDisplayName,
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
 *
 * IDENTITY MODEL. `Profile.id` is the permanent short Player ID (6–7 digits) and
 * is the ONLY canonical identity in the system. The display name is not an
 * identity — two players may share one — and neither is the avatar, the legacy
 * `tag`, or any socket id. Every map, lookup and graph edge here is keyed by
 * Player ID.
 */
class ProfileManager {
  /** Player ID -> profile. The single index of record. */
  private profiles: Map<string, Profile> = new Map();
  private tags: Set<string> = new Set();

  /** Owns the live Player ID set and mints collision-free new ones. */
  private ids = new PlayerIdAllocator();

  /**
   * Pre-migration UUID -> current Player ID. Lets an already-issued reference
   * (a client's localStorage, a persisted room snapshot, an in-flight request)
   * still resolve after the migration. Read-only aliasing — a legacy id is never
   * an identity of its own and can never be searched, displayed or claimed.
   */
  private legacyIds: Map<string, string> = new Map();

  /**
   * `"<provider>:<externalId>"` -> Player ID. The reverse of `Profile.externalIds`,
   * rebuilt from the profiles themselves on every hydrate so it can never drift
   * from what is actually persisted.
   *
   * This is what makes a returning platform player the SAME player: without it a
   * CrazyGames account would mint a fresh profile (and fresh stats) on every
   * session. Like `legacyIds` it is an alias, not an identity — everything
   * downstream still deals only in Player IDs.
   */
  private externalIds: Map<string, string> = new Map();

  private store: ProfileStore = new MemoryProfileStore();
  private dirty: Set<string> = new Set();
  private removed: Set<string> = new Set();
  /** Old migration keys can be deleted only after their replacement is durable. */
  private migrationRemovals = new Map<string, string>();
  private flushScheduled = false;
  private flushPromise: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private revisions = new Map<string, number>();
  private storeGeneration = 0;
  private draining = false;
  private readonly retryDelayMs = 250;

  /** Inject the durable store (called once at startup). */
  public setStore(store: ProfileStore): void {
    this.storeGeneration++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.flushPromise = null;
    this.flushScheduled = false;
    this.draining = false;
    this.dirty.clear();
    this.removed.clear();
    this.migrationRemovals.clear();
    this.revisions.clear();
    this.store = store;
  }

  /**
   * Drop every in-memory profile, ID reservation and legacy alias.
   *
   * TEST ISOLATION ONLY. The manager is a process-wide singleton, so without
   * this a suite that seeds "Tanmay" leaks that profile into the next suite's
   * search results and the next hydrate's ID space. Never called in production —
   * the live registry is only ever emptied by restarting the process.
   */
  public resetForTests(store?: ProfileStore): void {
    this.profiles.clear();
    this.tags.clear();
    this.ids.clear();
    this.legacyIds.clear();
    this.externalIds.clear();
    this.setStore(store ?? new MemoryProfileStore());
  }

  /**
   * Rehydrate all persisted profiles into memory on startup, backfilling any
   * fields missing from older/seed snapshots and MIGRATING any profile that
   * still carries a pre-Player-ID (UUID) identity.
   *
   * The migration is done in two passes because it must be order-independent and
   * lossless:
   *
   *   Pass 1 reserves every ID that is ALREADY a valid Player ID, so a profile
   *   created after the migration can never have its id stolen by one minted for
   *   a legacy profile in the same boot.
   *
   *   Pass 2 mints an ID for each remaining legacy profile and records the
   *   old -> new mapping. Only then is the friend graph rewritten, because an
   *   edge may point at a profile that had not been migrated yet when its owner
   *   was processed.
   *
   * Nothing is dropped: stats, outfits, match history, privacy and every friend
   * / request / block edge survive under the new id, and the old UUID is kept on
   * the profile as `legacyId` so outstanding references keep resolving.
   */
  public async hydrate(): Promise<void> {
    const loaded = await this.store.loadAll();
    let backfilled = 0;
    // A crash after saving the new key but before deleting the old one leaves
    // both snapshots. Adopt the durable migrated identity, not a second remint.
    const knownMigrations = new Map<string, string>();
    for (const raw of loaded) {
      if (raw && isPlayerId(raw.id) && typeof raw.legacyId === 'string'
        && raw.legacyId && !isPlayerId(raw.legacyId)) knownMigrations.set(raw.legacyId, raw.id);
    }
    const redundantLegacy = new Set<string>();

    // ---- Pass 1: adopt profiles that already hold a valid Player ID ----------
    // `snapshot` is the exact on-disk JSON and `storedKey` the key it was filed
    // under, both captured before any mutation so the re-persist decision below
    // compares like with like.
    const pending: { raw: Partial<Profile>; snapshot: string; storedKey: string }[] = [];
    for (const raw of loaded) {
      if (!raw || typeof raw.id !== 'string' || !raw.id) continue;
      if (!isPlayerId(raw.id) && knownMigrations.has(raw.id)) {
        redundantLegacy.add(raw.id);
        continue;
      }
      const entry = { snapshot: JSON.stringify(raw), storedKey: raw.id };
      if (isPlayerId(raw.id) && this.ids.reserve(raw.id)) {
        pending.push({ ...entry, raw });
      } else {
        // Either a legacy UUID, or a Player ID that collides with one already
        // claimed by an earlier snapshot. Both need a freshly minted id.
        pending.push({ ...entry, raw: { ...raw, id: '', legacyId: raw.id } });
      }
    }

    // ---- Pass 2: mint ids for everything still unresolved --------------------
    const remap = new Map<string, string>(knownMigrations); // old id -> new Player ID
    const newMigrations = new Map<string, string>();
    for (const { raw, storedKey } of pending) {
      if (raw.id) continue;
      raw.id = this.ids.allocate();
      if (!isPlayerId(storedKey)) {
        remap.set(storedKey, raw.id);
        newMigrations.set(storedKey, raw.id);
      } else {
        // A duplicate valid ID is ambiguous; preserve the first canonical key
        // and never delete or alias it to the reminted second profile.
        raw.legacyId = null;
      }
    }

    // ---- Commit: normalize, rewrite graph edges, index ----------------------
    for (const { raw, snapshot, storedKey } of pending) {
      const profile = normalizeProfile(raw, () => randomUUID());
      // Friend / request / block edges stored under a pre-migration id are
      // rewritten to the migrated id so no relationship is lost. Edges pointing
      // at ids that were never seen are left alone — they resolve through the
      // legacy alias, or refer to a profile that no longer exists.
      if (remap.size) this.remapSocialGraph(profile, remap);

      this.profiles.set(profile.id, profile);
      if (profile.tag) this.tags.add(profile.tag.toUpperCase());
      if (profile.legacyId) this.legacyIds.set(profile.legacyId, profile.id);
      this.indexExternalIds(profile);

      // A snapshot that changed (backfilled field, or a migrated id) is
      // re-persisted so the work is durable rather than redone every boot.
      if (profile.id !== storedKey || JSON.stringify(profile) !== snapshot) {
        this.markDirty(profile.id);
        backfilled++;
      }
    }

    // Register each dependency before the queued flush runs. Failed replacement
    // saves leave the old copy intact; successful saves unlock its removal.
    for (const [oldId, newId] of newMigrations) {
      this.migrationRemovals.set(oldId, newId);
      this.markRemoved(oldId);
    }
    for (const oldId of redundantLegacy) this.markRemoved(oldId);

    if (loaded.length) {
      const migrated = remap.size ? ` (${remap.size} migrated to short Player IDs)` : '';
      logger.info(
        `[PROFILE_STORE] Rehydrated ${loaded.length} profile(s)${backfilled ? ` (${backfilled} backfilled)` : ''}${migrated}.`
      );
    }
  }

  /** Rewrite every social-graph edge that references a pre-migration id. */
  private remapSocialGraph(profile: Profile, remap: Map<string, string>): void {
    const social: SocialGraph = profile.social;
    for (const link of social.friends) link.id = remap.get(link.id) ?? link.id;
    for (const link of social.incoming) link.id = remap.get(link.id) ?? link.id;
    for (const link of social.outgoing) link.id = remap.get(link.id) ?? link.id;
    social.blocked = social.blocked.map((id) => remap.get(id) ?? id);
  }

  // ---- Write-through persistence (mirror of RoomManager) --------------------

  public markDirty(id: string): void {
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    this.removed.delete(id);
    this.dirty.add(id);
    this.scheduleFlush();
  }

  private markRemoved(id: string): void {
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    this.dirty.delete(id);
    this.removed.add(id);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.flushPromise || this.retryTimer || this.draining) return;
    const generation = this.storeGeneration;
    this.flushScheduled = true;
    queueMicrotask(() => {
      if (generation !== this.storeGeneration) return;
      this.flushScheduled = false;
      void this.flush();
    });
  }

  /** One tracked loop owns writes; each batch uses immutable, revisioned snapshots. */
  private flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    const generation = this.storeGeneration;
    const store = this.store;
    let failed = false;
    this.flushPromise = (async () => {
      while (generation === this.storeGeneration && (this.dirty.size || this.removed.size)) {
        // During a partial migration, snapshots keep references to legacy IDs
        // until every referenced replacement has actually been saved. Those
        // IDs resolve through the old copy or the new copy's legacyId on reboot.
        const pendingReferences = new Map([...this.migrationRemovals].map(([oldId, newId]) => [newId, oldId]));
        const saves = [...this.dirty].flatMap((id) => {
          const profile = this.profiles.get(id);
          if (!profile) return [];
          const snapshot = JSON.parse(JSON.stringify(profile)) as Profile;
          const socialBefore = JSON.stringify(snapshot.social);
          if (pendingReferences.size) this.remapSocialGraph(snapshot, pendingReferences);
          return [{ id, revision: this.revisions.get(id), snapshot, finalizeGraph: socialBefore !== JSON.stringify(snapshot.social) }];
        });
        this.dirty.clear();
        await Promise.all(saves.map(async ({ id, revision, snapshot, finalizeGraph }) => {
            try {
              await store.save(snapshot);
              if (generation === this.storeGeneration) {
                for (const [oldId, newId] of this.migrationRemovals) {
                  if (newId === id) this.migrationRemovals.delete(oldId);
                }
                if (finalizeGraph) this.markDirty(id);
              }
            } catch (err: any) {
              failed = true;
              if (generation === this.storeGeneration && this.revisions.get(id) === revision) this.dirty.add(id);
              logger.error(`[PROFILE_STORE] Failed to persist profile ${id} (will retry):`, err?.message);
            }
          }));
        if (generation !== this.storeGeneration) break;
        const removals = [...this.removed]
          .filter((id) => !this.migrationRemovals.has(id))
          .map((id) => ({ id, revision: this.revisions.get(id) }));
        for (const { id } of removals) this.removed.delete(id);
        await Promise.all(removals.map(async ({ id, revision }) => {
            try {
              await store.remove(id);
              if (generation === this.storeGeneration && this.revisions.get(id) === revision) this.revisions.delete(id);
            } catch (err: any) {
              failed = true;
              if (generation === this.storeGeneration && this.revisions.get(id) === revision) this.removed.add(id);
              logger.error(`[PROFILE_STORE] Failed to remove profile ${id} (will retry):`, err?.message);
            }
          }));
        if (failed) break;
      }
    })().finally(() => {
      if (generation !== this.storeGeneration) return;
      this.flushPromise = null;
      if (this.draining || (!this.dirty.size && !this.removed.size)) return;
      if (failed) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush();
        }, this.retryDelayMs);
        this.retryTimer.unref?.();
      } else {
        this.scheduleFlush();
      }
    });
    return this.flushPromise;
  }

  /** Flush pending writes and close the store on graceful shutdown. */
  public async shutdown(): Promise<void> {
    this.draining = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    try {
      // This also awaits a save that was already running when shutdown began.
      await this.flush();
      for (let attempt = 0; attempt < 3 && (this.dirty.size || this.removed.size); attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.retryDelayMs));
        await this.flush();
      }
      if (this.dirty.size || this.removed.size) {
        throw new Error('Profile persistence still has pending writes after shutdown retries');
      }
    } finally {
      if (this.store.close) await this.store.close();
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
   *
   * The Player ID is minted here, server-side, from the allocator — never taken
   * from the request and never derived from the display name, so a client cannot
   * choose its own identity or claim someone else's.
   */
  public createProfile(input: { displayName: string; avatar?: string | null; outfit?: string | null }): Profile {
    const now = Date.now();
    const displayName = sanitizeDisplayName(input.displayName) || 'Player';
    const profile: Profile = {
      id: this.ids.allocate(),
      legacyId: null,
      secret: randomUUID(),
      displayName,
      tag: this.generateTag(),
      avatarUrl: input.avatar ? String(input.avatar).slice(0, 64) : null,
      outfit: input.outfit ? String(input.outfit).slice(0, 64) : null,
      isGuest: true,
      providers: ['guest'],
      // Populated only by resolveExternalIdentity(), from a verified signature.
      externalIds: {},
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      totalPlayTimeMs: 0,
      tokenVersion: 1,
      stats: emptyStats(),
      rankedStats: emptyStats(),
      recentMatches: [],
      social: emptySocialGraph(),
      privacy: defaultPrivacy(),
    };
    this.profiles.set(profile.id, profile);
    this.markDirty(profile.id);
    logger.debug(`[PROFILE_CREATED] ${displayName} #${profile.id}`);
    return profile;
  }

  /**
   * Resolve any reference we may be handed for a profile — its Player ID, or a
   * pre-migration UUID aliased during hydrate — to the CURRENT Player ID.
   *
   * This is the one place aliasing happens. Everything downstream deals in
   * Player IDs only, so a legacy id can be read through but never stored, echoed
   * back, searched or displayed as a second identity.
   */
  public resolveId(ref: string | null | undefined): string | undefined {
    if (typeof ref !== 'string' || !ref) return undefined;
    if (this.profiles.has(ref)) return ref;
    const aliased = this.legacyIds.get(ref);
    return aliased && this.profiles.has(aliased) ? aliased : undefined;
  }

  /** Resolve a reference straight to the profile it names. */
  private resolve(ref: string | null | undefined): Profile | undefined {
    const id = this.resolveId(ref);
    return id ? this.profiles.get(id) : undefined;
  }

  public getProfile(id: string): Profile | undefined {
    return this.resolve(id);
  }

  public getPublicProfile(id: string, viewer?: { id: string; secret: string }): PublicProfile | undefined {
    const p = this.resolve(id);
    if (!p) return undefined;
    if (!viewer || !this.verify(viewer.id, viewer.secret)) return publicProfile(p);
    const owner = this.resolve(viewer.id)!;
    if (owner.id === p.id) return publicProfile(p, 'owner');
    const friends = owner.social.friends.some((link) => link.id === p.id)
      && p.social.friends.some((link) => link.id === owner.id)
      && !owner.social.blocked.includes(p.id) && !p.social.blocked.includes(owner.id);
    return publicProfile(p, friends ? 'friend' : 'public');
  }

  // ---- External identities (platform auth) ---------------------------------

  private static externalKey(provider: string, externalId: string): string {
    return `${provider}:${externalId}`;
  }

  /** Add every link a profile carries to the reverse index. */
  private indexExternalIds(profile: Profile): void {
    for (const [provider, externalId] of Object.entries(profile.externalIds)) {
      this.externalIds.set(ProfileManager.externalKey(provider, externalId), profile.id);
    }
  }

  /**
   * Find the profile a VERIFIED external identity already owns, or create one and
   * link it. This is the single entry point for platform sign-in.
   *
   * `externalId` must come from a server-verified signature — see
   * `auth/crazyGamesAuth.ts`. Nothing here validates it, because by the time it
   * arrives that decision has already been made; passing a client-supplied id
   * would hand out someone else's profile.
   *
   * The returned profile is the SAME player model the guest path produces, so the
   * caller hands back the usual `{ profile, secret }` pair and every downstream
   * system — rooms, stats, friends, sockets — is untouched.
   *
   * Note on avatars: `avatarUrl` holds a preset-avatar KEY, not a URL, so a
   * platform profile picture is deliberately NOT written into it — that would
   * break avatar rendering for the linked player. New platform profiles start on
   * the procedural fallback and the player can pick a preset as usual.
   */
  public resolveExternalIdentity(input: {
    provider: string;
    externalId: string;
    displayName: string;
  }): { profile: Profile; created: boolean } {
    const provider = input.provider.slice(0, 32);
    const externalId = input.externalId.slice(0, 128);
    const key = ProfileManager.externalKey(provider, externalId);

    const existingId = this.externalIds.get(key);
    const existing = existingId ? this.profiles.get(existingId) : undefined;
    if (existing) {
      existing.lastSeenAt = Date.now();
      this.markDirty(existing.id);
      return { profile: existing, created: false };
    }
    // A stale index entry (profile since deleted) must not block a fresh link.
    if (existingId) this.externalIds.delete(key);

    const profile = this.createProfile({ displayName: input.displayName });
    profile.externalIds[provider] = externalId;
    profile.providers = [provider];
    profile.isGuest = false;
    profile.updatedAt = Date.now();
    this.externalIds.set(key, profile.id);
    this.markDirty(profile.id);
    logger.info(`[PROFILE_LINKED] ${provider} identity -> #${profile.id} (new profile)`);
    return { profile, created: true };
  }

  /** Verify a caller owns a profile by matching its secret (constant-time). */
  public verify(id: string, secret: string | undefined | null): boolean {
    const p = this.resolve(id);
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
    const p = this.resolve(id);
    if (!p) return;
    p.lastSeenAt = Date.now();
    this.markDirty(p.id);
  }

  /** Rename a profile (secret-authenticated). Player ID and stats are untouched:
   *  a rename is a DISPLAY change, never an identity change, so the profile that
   *  comes back is the same player under a new label. */
  public renameProfile(id: string, secret: string, displayName: string): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.resolve(id)!;
    const trimmed = sanitizeDisplayName(displayName);
    if (!trimmed) throw new Error('Display name cannot be empty');
    p.displayName = trimmed;
    p.updatedAt = Date.now();
    this.markDirty(p.id);
    return publicProfile(p, 'owner');
  }

  /** Change a profile's preset avatar (secret-authenticated). */
  public setAvatar(id: string, secret: string, avatar: string | null): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.resolve(id)!;
    p.avatarUrl = avatar ? String(avatar).slice(0, 64) : null;
    p.updatedAt = Date.now();
    this.markDirty(p.id);
    return publicProfile(p, 'owner');
  }

  /** Change a profile's cosmetic outfit (secret-authenticated). Purely visual;
   *  never touches identity or stats. Mirror of setAvatar. */
  public setOutfit(id: string, secret: string, outfit: string | null): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.resolve(id)!;
    p.outfit = outfit ? String(outfit).slice(0, 64) : null;
    p.updatedAt = Date.now();
    this.markDirty(p.id);
    return publicProfile(p, 'owner');
  }

  /** Reset all statistics/history (secret-authenticated). Keeps the same Player
   *  ID — resetting your stats does not make you a different player. */
  public resetProfile(id: string, secret: string): PublicProfile {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.resolve(id)!;
    p.stats = emptyStats();
    p.rankedStats = emptyStats();
    p.recentMatches = [];
    p.totalPlayTimeMs = 0;
    p.updatedAt = Date.now();
    this.markDirty(p.id);
    logger.debug(`[PROFILE_RESET] ${p.displayName} #${p.id}`);
    return publicProfile(p, 'owner');
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

  // ---- Social support ------------------------------------------------------
  // The friend graph itself is owned by SocialManager; ProfileManager exposes
  // only the lookups it can answer efficiently from the profile table it owns.

  /** Resolve many profiles at once (friend lists, request lists). Unknown ids
   *  are skipped rather than returned as holes; pre-migration ids resolve
   *  through the legacy alias so no stored list loses members. */
  public getProfiles(ids: readonly string[]): Profile[] {
    const out: Profile[] = [];
    for (const id of ids) {
      const p = this.resolve(id);
      if (p) out.push(p);
    }
    return out;
  }

  /**
   * Find players by Player ID, username, or the legacy `Username#TAG` forms.
   *
   * IDENTITY vs LABEL. A Player ID names exactly one player, so an exact ID hit
   * short-circuits and returns that single profile — this is what makes
   * "search 4827315" resolve unambiguously even when a dozen players share a
   * name. A username is only a label, so a name query deliberately returns EVERY
   * player wearing it; the caller renders them as `Tanmay · #4827315`,
   * `Tanmay · #7392146` and the viewer picks. Duplicate names are a display
   * problem, never a lookup failure.
   *
   * Ranking is deterministic: exact tag, then exact name, then name prefix, then
   * Player-ID prefix (someone typing an ID), then name substring. Within a band
   * results order by name then by ID, so two identically-named players always
   * come back in the same order rather than in Map insertion order.
   *
   * The scan is linear over the in-memory profile Map, which is a few hundred
   * microseconds at realistic profile counts and needs no secondary index to
   * keep in sync; `scanCap` bounds the worst case regardless of table size.
   */
  public searchProfiles(rawQuery: string, limit = 20): Profile[] {
    const query = rawQuery.trim().slice(0, 64);
    if (!query) return [];

    // An exact Player ID identifies exactly one player: "4827315", "#4827315"
    // and a copy-pasted "482 7315" all collapse to the same lookup, and nothing
    // else is worth ranking against a direct identity hit.
    const exactId = parsePlayerId(query);
    if (exactId) {
      const direct = this.profiles.get(exactId);
      return direct ? [direct] : [];
    }

    const hash = query.indexOf('#');

    // "Tanmay #4827315" / "Tanmay · #4827315" / "Tanmay 4827315" — the forms
    // that fall out of the UI's own rendering, typed back or pasted with the
    // separator mangled. The ID half identifies; the name half is decoration.
    //
    // Falls THROUGH when no profile holds that id, so a display name that merely
    // happens to end in seven digits is still searchable as a name.
    const trailing = query.slice(hash >= 0 ? hash : query.lastIndexOf(' ') + 1);
    const trailingId = parsePlayerId(trailing);
    if (trailingId) {
      const direct = this.profiles.get(trailingId);
      if (direct) return [direct];
    }

    // Legacy `Name#TAG` / `#TAG` — the tag is the discriminating half.
    const namePart = (hash >= 0 ? query.slice(0, hash) : query).trim().toLowerCase();
    const tagPart = (hash >= 0 ? query.slice(hash + 1) : '').trim().toUpperCase();
    const lower = query.toLowerCase();

    // A digits-only query is a Player ID mid-typing ("48273" → #4827315).
    const idFragment = isPlayerIdFragment(query)
      ? query.trim().replace(/^#/, '').replace(/[\s-]/g, '')
      : null;

    const scanCap = 20_000;
    const scored: { p: Profile; rank: number }[] = [];
    let scanned = 0;

    for (const p of this.profiles.values()) {
      if (++scanned > scanCap) break;
      const name = p.displayName.toLowerCase();
      const tag = p.tag.toUpperCase();

      let rank = -1;
      if (tagPart && !idFragment) {
        // A tag was supplied: it must match, and the name half (if any) must too.
        if (tag !== tagPart) continue;
        if (namePart && !name.startsWith(namePart)) continue;
        rank = 0;
      } else if (tag && tag === query.toUpperCase()) {
        rank = 0;                                 // bare tag, e.g. "5LHL"
      } else if (name === lower) {
        rank = 1;                                 // exact username — may be MANY
      } else if (name.startsWith(lower)) {
        rank = 2;                                 // name prefix
      } else if (idFragment && p.id.startsWith(idFragment)) {
        rank = 3;                                 // Player ID prefix
      } else if (name.includes(lower)) {
        rank = 4;                                 // name substring
      } else {
        continue;
      }
      scored.push({ p, rank });
    }

    scored.sort(
      (a, b) =>
        a.rank - b.rank ||
        a.p.displayName.localeCompare(b.p.displayName) ||
        a.p.id.localeCompare(b.p.id)
    );
    return scored.slice(0, Math.max(1, Math.min(limit, 50))).map((s) => s.p);
  }

  /** Update privacy settings (secret-authenticated). Partial — only supplied
   *  keys change; the rest keep their current values. */
  public setPrivacy(id: string, secret: string, patch: Partial<PrivacySettings>): PrivacySettings {
    if (!this.verify(id, secret)) throw new Error('Not authorized to edit this profile');
    const p = this.profiles.get(id)!;
    p.privacy = normalizePrivacy({ ...p.privacy, ...patch });
    p.updatedAt = Date.now();
    this.markDirty(id);
    return p.privacy;
  }

  // ---- Diagnostics ---------------------------------------------------------

  public getProfileCount(): number {
    return this.profiles.size;
  }
}

export const profileManager = new ProfileManager();
