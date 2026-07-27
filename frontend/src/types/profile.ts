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
  // General (match-level)
  matchesPlayed: number;
  matchesWon: number;
  roundsPlayed: number;
  roundsWon: number;
  pointsScored: number;

  // Placement aggregate — average finish = placementSum / placementCount.
  placementSum: number;
  placementCount: number;

  // Streaks (consecutive MATCH wins).
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
  placement: number; // 1 = winner of the match
}

/** A completed match, stored on each participant's profile for the history UI. */
export interface MatchRecord {
  date: number;                 // epoch ms the match finished
  players: MatchPlayerRecord[]; // final standings
  winnerName: string;
  placement: number;            // THIS profile owner's placement in the match
  durationMs: number;           // wall-clock length of the match
  rounds: number;               // number of rounds played
  settings: {
    targetScore: number;
    houseRulesSummary: string;
  };
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
}
