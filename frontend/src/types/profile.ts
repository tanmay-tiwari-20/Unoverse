/**
 * ============================================================================
 *  Persistent player profiles — CLIENT view types.
 * ============================================================================
 *
 * A strict mirror of the server's `PublicProfile` / `ProfileStats` /
 * `MatchRecord` shapes (see `backend/src/profiles/profileTypes.ts`). The client
 * NEVER computes or trusts stat values as truth — these types describe data the
 * server serves for DISPLAY only. The private `secret` never crosses the wire in
 * these shapes; it lives solely in the profile store (localStorage) as the
 * caller's proof of ownership for edit/reset writes.
 */

/** Lifetime statistics for one competitive context (casual, or reserved ranked). */
export interface ProfileStats {
  // General (match-level). A completed ROUND is the unit of record, so
  // matchesPlayed/matchesWon count finished rounds — a match does not have to
  // run all the way to its target score for stats to be banked.
  matchesPlayed: number;
  matchesWon: number;
  roundsPlayed: number;
  roundsWon: number;
  pointsScored: number;

  // Placement aggregate — average finish = placementSum / placementCount.
  placementSum: number;
  placementCount: number;

  // Streaks (consecutive round wins).
  currentStreak: number;
  bestStreak: number;
  closestLoss: number | null;

  // Gameplay counters.
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
  placement: number; // 1 = winner
}

/** A completed round, stored on each participant's profile for the history UI. */
export interface MatchRecord {
  date: number;                 // epoch ms the round finished
  players: MatchPlayerRecord[]; // final standings
  winnerName: string;
  placement: number;            // THIS profile owner's placement
  durationMs: number;           // wall-clock length of the round
  rounds: number;               // rounds covered by this record (currently always 1)
  // Themed arena the round was played in. Optional for backward compatibility
  // with records written before arenas were recorded; display data only (it
  // powers "favorite arena" on the profile).
  arena?: string | null;
  settings: {
    targetScore: number;
    houseRulesSummary: string;
  };
}

/** Who may send this profile a friend request. */
export type FriendRequestPolicy = 'everyone' | 'friends-of-friends' | 'nobody';

/**
 * Per-profile privacy settings. Mirrors the server shape. These are ENFORCED
 * server-side in every projection — the client renders the toggles and sends the
 * intent, but never relies on them to hide anything it has already received.
 */
export interface PrivacySettings {
  friendRequests: FriendRequestPolicy;
  showOnlineStatus: boolean;
  showMatchHistory: boolean;
  showOutfit: boolean;
  allowFriendJoin: boolean;
}

/**
 * Public profile served by the API — the secret is stripped, and the derived
 * `winRate` (0–1) is attached for convenience. Field names mirror the on-disk
 * schema: `avatarUrl` holds a preset-avatar KEY (or null for the procedural
 * fallback).
 */
export interface PublicProfile {
  id: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  outfit: string | null; // cosmetic outfit (skin) key, or null for default — purely visual
  isGuest: boolean;
  providers: string[];
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
  totalPlayTimeMs: number;
  tokenVersion: number;
  stats: ProfileStats;
  rankedStats: ProfileStats;
  recentMatches: MatchRecord[];
  winRate: number;
  /** Derived count of established friendships. The friend GRAPH itself is
   *  private and never rides this shape — it arrives through the social layer. */
  friendCount: number;
  /** Owner-configurable privacy. Present on the owner's own view. */
  privacy: PrivacySettings;
}
