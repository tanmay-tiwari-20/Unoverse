/**
 * ============================================================================
 *  Persistent player profiles — domain types.
 * ============================================================================
 *
 * These codify the profile+stats schema that already lives on disk under
 * `backend/.data/profiles/*.json` (seed files), extended to cover the full set
 * of lifetime statistics the product spec asks for. The shape is a strict
 * superset of the seed files: every seed field is preserved (so existing
 * snapshots hydrate cleanly) and the new fields default to 0 / null.
 *
 * Identity + stats are SERVER-AUTHORITATIVE. A profile carries a private
 * `secret` (never broadcast — the profile analog of `Player.secret`) that
 * authenticates the only client→server writes we allow: renaming, avatar
 * changes, and stat resets. Clients NEVER send stat values; all counters are
 * computed and written on the server, keyed by the immutable profile `id`.
 */

/**
 * Lifetime statistics for one competitive context (casual `stats`, or the
 * reserved `rankedStats`). Every counter is a monotonically-increasing total
 * except the streak/closestLoss fields. Win rate is DERIVED at read time
 * (matchesWon / matchesPlayed), never stored, so it can never drift.
 */
export interface ProfileStats {
  // ---- General (match-level) ------------------------------------------------
  // A completed ROUND is the unit of record: it counts once here and once in the
  // round counters below, so matchesPlayed tracks rounds finished rather than
  // waiting for someone to reach the match target score.
  matchesPlayed: number;   // completed rounds participated in
  matchesWon: number;      // rounds won
  roundsPlayed: number;    // individual rounds participated in
  roundsWon: number;       // rounds won (emptied hand first)
  pointsScored: number;    // cumulative UNO points banked across rounds

  // Placement across rounds — placementSum/placementCount give an average finish.
  placementSum: number;
  placementCount: number;

  // ---- Streaks --------------------------------------------------------------
  currentStreak: number;   // current consecutive round wins
  bestStreak: number;      // best consecutive round wins ever
  // Smallest losing margin (points behind the round winner) in a lost round.
  // Surfaced as "so close!"; null until first recorded.
  closestLoss: number | null;

  // ---- Gameplay counters ----------------------------------------------------
  cardsPlayed: number;        // total cards played (all types)
  cardsDrawn: number;         // total cards drawn (incl. penalties / eating chains)
  wildsPlayed: number;        // plain Wild cards played
  wildDrawFourPlayed: number; // Wild Draw Four (+4) cards played
  drawCardsPlayed: number;    // draw cards played: Draw Two (+2) and Wild Draw Four (+4)
  reverseCardsPlayed: number; // Reverse cards played
  skipCardsPlayed: number;    // Skip cards played
  unoCalls: number;           // successful UNO declarations
  lastCardCalls: number;      // times reduced to exactly one card ("last card")
  unoPenalties: number;       // times penalized for not declaring UNO
  challengesWon: number;      // successful Wild Draw Four challenges
  challengesLost: number;     // failed Wild Draw Four challenges
  jumpIns: number;            // successful jump-in plays
}

/** All stat keys that are simple additive counters (everything except the
 *  streak / closestLoss / placement-aggregate fields, which need custom logic). */
export type CounterStatKey =
  | 'roundsPlayed'
  | 'roundsWon'
  | 'pointsScored'
  | 'cardsPlayed'
  | 'cardsDrawn'
  | 'wildsPlayed'
  | 'wildDrawFourPlayed'
  | 'drawCardsPlayed'
  | 'reverseCardsPlayed'
  | 'skipCardsPlayed'
  | 'unoCalls'
  | 'lastCardCalls'
  | 'unoPenalties'
  | 'challengesWon'
  | 'challengesLost'
  | 'jumpIns';

/**
 * Per-round accumulation of one player's gameplay actions, gathered live during
 * a round and folded into their profile at round end. This is the ONLY data
 * carried from the game engine into the stat commit — it contains counts, never
 * client-supplied values.
 */
export interface RoundStatDelta {
  cardsPlayed: number;
  cardsDrawn: number;
  wildsPlayed: number;
  wildDrawFourPlayed: number;
  drawCardsPlayed: number;
  reverseCardsPlayed: number;
  skipCardsPlayed: number;
  unoCalls: number;
  lastCardCalls: number;
  unoPenalties: number;
  challengesWon: number;
  challengesLost: number;
  jumpIns: number;
}

/** One player's line in a stored match record. */
export interface MatchPlayerRecord {
  name: string;
  placement: number; // 1 = winner of the match
}

/**
 * A completed round, stored on each participant's profile for the match-history
 * UI. Capped to the most recent N (see RECENT_MATCHES_MAX).
 */
export interface MatchRecord {
  date: number;                 // epoch ms the round finished
  players: MatchPlayerRecord[]; // final standings
  winnerName: string;
  placement: number;            // THIS profile owner's placement
  durationMs: number;           // wall-clock length of the round
  rounds: number;               // rounds covered by this record (currently always 1)
  settings: {
    targetScore: number;
    houseRulesSummary: string;  // short human-readable rules summary
  };
}

/**
 * A persistent player profile. Field names mirror the on-disk seed schema
 * exactly (`avatarUrl` holds a preset-avatar KEY, or null); additive fields
 * (`secret`, `totalPlayTimeMs`) are appended.
 *
 * Reserved-but-unpopulated fields are kept as future-proofing hooks:
 *   - `isGuest` / `providers` / `tokenVersion` — auth & cloud-save
 *   - `rankedStats` — Ranked mode / Seasons
 * Room in the type for `xp`/`level`/`friends`/`achievements`/`badges` is
 * documented here but intentionally NOT added until those features exist.
 */
export interface Profile {
  id: string;                 // immutable UUID — the durable player identity
  secret: string;             // private auth token (never broadcast)
  displayName: string;
  tag: string;                // short discriminator (e.g. "5LHL")
  avatarUrl: string | null;   // preset avatar key, or null for procedural fallback
  outfit: string | null;      // cosmetic outfit (skin) key, or null for default — purely visual
  isGuest: boolean;
  providers: string[];        // auth providers (["guest"] for now)
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  totalPlayTimeMs: number;    // cumulative time spent in completed matches
  tokenVersion: number;       // bumped to invalidate issued secrets (future auth)
  stats: ProfileStats;        // casual lifetime stats
  rankedStats: ProfileStats;  // reserved for Ranked mode
  recentMatches: MatchRecord[];
}

/** Public view of a profile: the private `secret` stripped. Everything else
 *  (stats, history, dates) is display data and safe to broadcast/serve. */
export type PublicProfile = Omit<Profile, 'secret'> & { winRate: number };

/** A zeroed stats block (used for new profiles and stat resets). */
export function emptyStats(): ProfileStats {
  return {
    matchesPlayed: 0,
    matchesWon: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    pointsScored: 0,
    placementSum: 0,
    placementCount: 0,
    currentStreak: 0,
    bestStreak: 0,
    closestLoss: null,
    cardsPlayed: 0,
    cardsDrawn: 0,
    wildsPlayed: 0,
    wildDrawFourPlayed: 0,
    drawCardsPlayed: 0,
    reverseCardsPlayed: 0,
    skipCardsPlayed: 0,
    unoCalls: 0,
    lastCardCalls: 0,
    unoPenalties: 0,
    challengesWon: 0,
    challengesLost: 0,
    jumpIns: 0,
  };
}

/** A zeroed per-round delta. */
export function emptyRoundDelta(): RoundStatDelta {
  return {
    cardsPlayed: 0,
    cardsDrawn: 0,
    wildsPlayed: 0,
    wildDrawFourPlayed: 0,
    drawCardsPlayed: 0,
    reverseCardsPlayed: 0,
    skipCardsPlayed: 0,
    unoCalls: 0,
    lastCardCalls: 0,
    unoPenalties: 0,
    challengesWon: 0,
    challengesLost: 0,
    jumpIns: 0,
  };
}

/**
 * Fill any missing stat fields from a (possibly older / partial) persisted
 * stats block. Guarantees every counter is a finite number so downstream
 * arithmetic and the derived win rate never produce NaN.
 */
export function normalizeStats(raw: Partial<ProfileStats> | undefined | null): ProfileStats {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  for (const key of Object.keys(base) as (keyof ProfileStats)[]) {
    if (key === 'closestLoss') {
      const v = (raw as ProfileStats).closestLoss;
      out.closestLoss = typeof v === 'number' && Number.isFinite(v) ? v : null;
      continue;
    }
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (out[key] as number) = v;
    }
  }
  return out;
}

/**
 * Normalize a raw persisted (or partial) profile into a complete Profile,
 * backfilling every field so seed files written before the current schema (or
 * missing the new `secret` / `totalPlayTimeMs` fields) hydrate cleanly.
 * A `mkSecret` factory supplies a fresh secret for legacy profiles that lack one.
 */
export function normalizeProfile(raw: Partial<Profile>, mkSecret: () => string): Profile {
  const now = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  return {
    id: String(raw.id),
    secret: typeof raw.secret === 'string' && raw.secret.length > 0 ? raw.secret : mkSecret(),
    displayName: typeof raw.displayName === 'string' ? raw.displayName : 'Player',
    tag: typeof raw.tag === 'string' ? raw.tag : '',
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
    outfit: typeof raw.outfit === 'string' ? raw.outfit : null,
    isGuest: raw.isGuest !== false,
    providers: Array.isArray(raw.providers) && raw.providers.length ? raw.providers : ['guest'],
    createdAt: now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    lastSeenAt: typeof raw.lastSeenAt === 'number' ? raw.lastSeenAt : now,
    totalPlayTimeMs: typeof raw.totalPlayTimeMs === 'number' && Number.isFinite(raw.totalPlayTimeMs) ? raw.totalPlayTimeMs : 0,
    tokenVersion: typeof raw.tokenVersion === 'number' ? raw.tokenVersion : 1,
    stats: normalizeStats(raw.stats),
    rankedStats: normalizeStats(raw.rankedStats),
    recentMatches: Array.isArray(raw.recentMatches) ? raw.recentMatches.slice(0, 100) : [],
  };
}

/** Derived lifetime win rate (0–1). Zero matches → 0 (never NaN). */
export function winRate(stats: ProfileStats): number {
  return stats.matchesPlayed > 0 ? stats.matchesWon / stats.matchesPlayed : 0;
}

/** Strip the private secret before a profile crosses the wire; attach the
 *  derived win rate for convenience. The profile analog of publicPlayer(). */
export function publicProfile(p: Profile): PublicProfile {
  const { secret, ...rest } = p;
  return { ...rest, winRate: winRate(p.stats) };
}
