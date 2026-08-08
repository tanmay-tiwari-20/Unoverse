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

/** One player's line in a stored match record.
 *
 *  `name` is DISPLAY ONLY and may repeat across lines — two players called
 *  "Tanmay" are two distinct entries. `playerId` is what actually identifies the
 *  participant; it is absent only for bots, profile-less guests, and records
 *  written before Player IDs existed. */
export interface MatchPlayerRecord {
  name: string;
  placement: number; // 1 = winner of the match
  /** The participant's permanent Player ID, when they had a profile. */
  playerId?: string | null;
}

// ---------------------------------------------------------------------------
// Social graph (Friends & Social System).
// ---------------------------------------------------------------------------
//
// The friend graph lives on the PROFILE, not on the ephemeral seated `Player`:
// `Profile.id` is the durable identity that survives reconnects, name changes
// and room churn, and it is already secret-authenticated. Storing it here also
// means the graph rides the existing ProfileStore (memory / file / redis) with
// no second persistence layer to keep in sync.
//
// Every edge is stored on BOTH endpoints (a friendship appears in each
// profile's `friends`; a pending request appears as `outgoing` on the sender and
// `incoming` on the receiver). That costs one extra write per mutation and buys
// O(1) reads for the two queries the UI actually makes — "who are my friends"
// and "who is waiting on me" — with no scan over the profile table.

/** An established, mutual friendship edge. */
export interface FriendLink {
  /** The OTHER profile's immutable id. */
  id: string;
  /** Epoch ms the friendship was established. */
  since: number;
}

/** A pending friend request edge (stored on both sender and receiver). */
export interface FriendRequestLink {
  /** The OTHER profile's immutable id. */
  id: string;
  /** Epoch ms the request was created. */
  at: number;
}

/**
 * One profile's slice of the social graph.
 *
 * Deliberately a set of id lists rather than embedded profile snapshots: names,
 * avatars, outfits and presence are all resolved at read time from the live
 * profile + presence registry, so a friend renaming themselves can never leave
 * a stale copy behind in someone else's list.
 *
 * Forward-compatible by construction — Direct Messages, Parties, Guilds and
 * "Recently Played With" are all additional id lists / edge kinds on this same
 * shape, and need no change to the persistence or projection layers.
 */
export interface SocialGraph {
  friends: FriendLink[];
  /** Requests others sent to me, awaiting my accept/decline. */
  incoming: FriendRequestLink[];
  /** Requests I sent, awaiting their accept/decline. */
  outgoing: FriendRequestLink[];
  /**
   * Profiles I have blocked. Architecture-ready: the graph, persistence and
   * every mutation gate already honor it (a block clears existing edges and
   * refuses new ones in both directions); only a dedicated block/report UI is
   * left to build.
   */
  blocked: string[];
}

/** Who may send this profile a friend request. */
export type FriendRequestPolicy = 'everyone' | 'friends-of-friends' | 'nobody';

/**
 * Per-profile privacy settings. Enforced SERVER-SIDE in the social projection
 * (see `socialManager.inspect`), never by hiding things client-side — a viewer
 * who is not allowed to see match history simply never receives it.
 */
export interface PrivacySettings {
  /** Gate on inbound friend requests. */
  friendRequests: FriendRequestPolicy;
  /** When false, non-friends see this profile as permanently Offline. */
  showOnlineStatus: boolean;
  /** When false, `recentMatches` is withheld from other players' inspections. */
  showMatchHistory: boolean;
  /** When false, the 3D outfit preview is withheld from other players. */
  showOutfit: boolean;
  /** When false, friends cannot use "Join" to drop into this player's room. */
  allowFriendJoin: boolean;
}

/** Default privacy: open and social, matching the game's party-game feel. */
export function defaultPrivacy(): PrivacySettings {
  return {
    friendRequests: 'everyone',
    showOnlineStatus: true,
    showMatchHistory: true,
    showOutfit: true,
    allowFriendJoin: true,
  };
}

/** An empty social graph (new profiles and legacy backfill). */
export function emptySocialGraph(): SocialGraph {
  return { friends: [], incoming: [], outgoing: [], blocked: [] };
}

/** Coerce a persisted (possibly legacy / partial) social graph into a complete
 *  one, dropping malformed entries and self-references. */
export function normalizeSocialGraph(raw: unknown, selfId: string): SocialGraph {
  const out = emptySocialGraph();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Partial<SocialGraph>;

  const links = (list: unknown, stamp: 'since' | 'at'): any[] => {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const acc: any[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const id = (entry as { id?: unknown }).id;
      if (typeof id !== 'string' || !id || id === selfId || seen.has(id)) continue;
      const when = (entry as Record<string, unknown>)[stamp];
      seen.add(id);
      acc.push({ id, [stamp]: typeof when === 'number' && Number.isFinite(when) ? when : 0 });
    }
    return acc;
  };

  out.friends = links(src.friends, 'since');
  out.incoming = links(src.incoming, 'at');
  out.outgoing = links(src.outgoing, 'at');
  out.blocked = Array.isArray(src.blocked)
    ? Array.from(new Set(src.blocked.filter((id): id is string => typeof id === 'string' && !!id && id !== selfId)))
    : [];
  return out;
}

/** Coerce persisted privacy settings, backfilling anything missing. */
export function normalizePrivacy(raw: unknown): PrivacySettings {
  const base = defaultPrivacy();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<PrivacySettings>;
  return {
    friendRequests:
      src.friendRequests === 'nobody' || src.friendRequests === 'friends-of-friends'
        ? src.friendRequests
        : 'everyone',
    showOnlineStatus: src.showOnlineStatus !== false,
    showMatchHistory: src.showMatchHistory !== false,
    showOutfit: src.showOutfit !== false,
    allowFriendJoin: src.allowFriendJoin !== false,
  };
}

/**
 * A completed round, stored on each participant's profile for the match-history
 * UI. Capped to the most recent N (see RECENT_MATCHES_MAX).
 */
export interface MatchRecord {
  date: number;                 // epoch ms the round finished
  players: MatchPlayerRecord[]; // final standings
  /** DISPLAY ONLY — see MatchPlayerRecord.name. `winnerId` identifies the winner. */
  winnerName: string;
  /** The winner's permanent Player ID, when they had a profile. Absent on bot
   *  wins, profile-less guests, and records written before IDs were stamped. */
  winnerId?: string | null;
  placement: number;            // THIS profile owner's placement
  durationMs: number;           // wall-clock length of the round
  rounds: number;               // rounds covered by this record (currently always 1)
  // Themed arena the round was played in. Optional purely for backward
  // compatibility with records written before arenas were recorded; it is
  // display/derivation data only (it powers "favorite arena" on the profile)
  // and is never read by the game engine.
  arena?: string | null;
  settings: {
    targetScore: number;
    houseRulesSummary: string;  // short human-readable rules summary
  };
}

/** Longest display name we store. Names are labels, not identifiers — this cap
 *  is about layout and payload size, nothing else. */
export const DISPLAY_NAME_MAX = 40;

/**
 * Clean a client-supplied display name.
 *
 * Display names are the one identity-adjacent field a client controls, so they
 * are sanitized server-side on every write: control characters and zero-width /
 * bidi-override codepoints are removed (they let a name impersonate another by
 * rendering identically or by reversing the text), runs of whitespace collapse
 * to a single space, and the result is trimmed and capped.
 *
 * Sanitizing is NOT de-duplicating: two players may legitimately end up with the
 * exact same cleaned name, and that is allowed — they are told apart by their
 * Player IDs, never by their names.
 *
 * Returns '' when nothing usable is left; callers decide whether to reject or
 * substitute a default.
 */
export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    // Strip C0/C1 controls + DEL, zero-width marks, bidi embeddings/overrides,
    // deprecated format chars and the BOM. Every one of these lets a name render
    // identically to another - impersonation by codepoint rather than spelling.
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]/g, '')
    // Whatever whitespace survives (including exotic Unicode spaces) collapses.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX)
    .trim();
}

/**
 * A persistent player profile. Field names mirror the on-disk seed schema
 * exactly (`avatarUrl` holds a preset-avatar KEY, or null); additive fields
 * (`secret`, `totalPlayTimeMs`) are appended.
 *
 * Reserved-but-unpopulated fields are kept as future-proofing hooks:
 *   - `isGuest` / `providers` / `tokenVersion` — auth & cloud-save
 *   - `rankedStats` — Ranked mode / Seasons
 * Room in the type for `xp`/`level`/`achievements`/`badges` is documented here
 * but intentionally NOT added until those features exist. `social` + `privacy`
 * back the Friends & Social System.
 */
export interface Profile {
  /**
   * The permanent Player ID — a short 6–7 digit numeric string (see
   * `playerId.ts`). This is the CANONICAL identity of the player: room
   * membership, stats, the friend graph, invitations and presence are all keyed
   * by it. Server-generated, never derived from the username, and never
   * regenerated (renames, avatar changes, stat resets and reconnects all leave
   * it alone).
   */
  id: string;
  /**
   * The UUID this profile used as its id before the short-Player-ID migration.
   * Retained purely so already-issued references still resolve — clients holding
   * the old id in localStorage, and room snapshots persisted with it. Never
   * displayed, never searchable, never a second identity: it resolves to `id`
   * and nothing else. Absent on profiles created after the migration.
   */
  legacyId?: string | null;
  secret: string;             // private auth token (never broadcast)
  displayName: string;
  /** Legacy 4-character discriminator, e.g. "5LHL". Superseded by the Player ID
   *  as the way to tell same-named players apart; kept so profiles written
   *  before the migration round-trip unchanged. Never an identity. */
  tag: string;
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
  /** Friend graph. Private to the owner — never rides `PublicProfile`; it is
   *  served only to the authenticated owner through the social layer. */
  social: SocialGraph;
  /** Owner-configurable privacy. Enforced server-side on every projection. */
  privacy: PrivacySettings;
}

/**
 * Public view of a profile: the private `secret`, the private `social` graph AND
 * the internal `legacyId` alias stripped. Everything else (stats, history, dates)
 * is display data and safe to broadcast/serve. `friendCount` is the one derived
 * social figure that is public.
 *
 * `id` here IS the short Player ID — the value the UI renders as `#4827315` and
 * the only identity a client ever needs to hold.
 *
 * NOTE: this is the OWNER-facing view (`GET /api/profiles/:id`, unchanged
 * behavior). Inspecting *another* player goes through the social layer's
 * viewer-aware projection, which additionally applies that player's privacy
 * settings — see `socialManager.inspect`.
 */
export type PublicProfile = Omit<Profile, 'secret' | 'social' | 'legacyId'> & {
  winRate: number;
  friendCount: number;
};

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
  const id = String(raw.id);
  return {
    id,
    // Preserved verbatim: the migration in ProfileManager.hydrate sets this, and
    // normalization must never drop it or old references stop resolving.
    legacyId: typeof raw.legacyId === 'string' && raw.legacyId.length > 0 ? raw.legacyId : null,
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
    // Profiles persisted before the social system existed hydrate with an empty
    // graph + default privacy, and are re-persisted once (see hydrate()).
    social: normalizeSocialGraph(raw.social, id),
    privacy: normalizePrivacy(raw.privacy),
  };
}

/** Derived lifetime win rate (0–1). Zero matches → 0 (never NaN). */
export function winRate(stats: ProfileStats): number {
  return stats.matchesPlayed > 0 ? stats.matchesWon / stats.matchesPlayed : 0;
}

/** Strip the private secret AND the private friend graph before a profile
 *  crosses the wire; attach the derived win rate + public friend count. The
 *  profile analog of publicPlayer(). */
export function publicProfile(p: Profile): PublicProfile {
  const { secret, social, legacyId, ...rest } = p;
  return { ...rest, winRate: winRate(p.stats), friendCount: social.friends.length };
}
