/**
 * ============================================================================
 *  Server configuration — one place for every env-tunable operational knob.
 * ============================================================================
 *
 * Security / reliability features (socket rate limiting, WebRTC signal bounds,
 * chat moderation, room garbage collection, CORS) all read their thresholds
 * from here so behavior is configurable without touching call sites. Every knob
 * has a safe default, so a bare `.env` keeps the server working out of the box.
 */

/** Parse a numeric env var, falling back when unset / blank / non-numeric. */
const num = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// Socket rate limiting (token bucket, per-socket, per-event).
//   capacity     = burst size (tokens available before throttling kicks in)
//   refillPerSec = sustained rate the bucket refills at
//   notify       = emit a throttled `error` to the client when dropped
// ---------------------------------------------------------------------------

export interface RateLimitRule {
  capacity: number;
  refillPerSec: number;
  /** When true, a throttled `error` event is sent on rejection; otherwise the
   *  request is silently dropped (right for high-frequency signaling noise). */
  notify?: boolean;
}

/** Fallback bucket for any client event without an explicit rule (gameplay
 *  actions). Generous enough never to affect real play, tight enough to cap a
 *  flood. */
export const DEFAULT_RATE_LIMIT: RateLimitRule = {
  capacity: num(process.env.RL_DEFAULT_CAPACITY, 30),
  refillPerSec: num(process.env.RL_DEFAULT_REFILL_PER_SEC, 15),
};

/** Independent per-event limits. Keyed by the Socket.IO event name. */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  'send-chat': {
    capacity: num(process.env.RL_CHAT_CAPACITY, 6),
    refillPerSec: num(process.env.RL_CHAT_REFILL_PER_SEC, 1.5),
    notify: true,
  },
  'send-reaction': {
    capacity: num(process.env.RL_REACTION_CAPACITY, 10),
    refillPerSec: num(process.env.RL_REACTION_REFILL_PER_SEC, 3),
    notify: true,
  },
  'webrtc-signal': {
    // Signaling is legitimately bursty (ICE trickle across a mesh of peers), so
    // this ceiling is high — it exists only to stop an outright flood.
    capacity: num(process.env.RL_SIGNAL_CAPACITY, 120),
    refillPerSec: num(process.env.RL_SIGNAL_REFILL_PER_SEC, 60),
  },
  'voice-status': { capacity: 15, refillPerSec: 5 },
  'update-house-rules': { capacity: 15, refillPerSec: 8 },
  'create-room': { capacity: 5, refillPerSec: 1 },
  'join-room': { capacity: 10, refillPerSec: 2 },
  'start-game': { capacity: 10, refillPerSec: 3 },
  'leave-room': { capacity: 10, refillPerSec: 3 },

  // --- Friends & Social System -------------------------------------------
  // Search is the cheapest to abuse and the most expensive to serve, so it gets
  // the tightest bucket. Graph mutations are inherently low-frequency (a human
  // clicks them); the limits below are far above real use and exist only to cap
  // a script. Every social event notifies on throttle so the UI can explain
  // itself rather than appearing to silently fail.
  'social:hello': { capacity: 6, refillPerSec: 0.5 },
  'social:search': { capacity: 8, refillPerSec: 1.5, notify: true },
  'social:inspect': { capacity: 15, refillPerSec: 3, notify: true },
  'social:friend-request': { capacity: 10, refillPerSec: 0.5, notify: true },
  'social:friend-accept': { capacity: 15, refillPerSec: 1, notify: true },
  'social:friend-decline': { capacity: 15, refillPerSec: 1, notify: true },
  'social:friend-cancel': { capacity: 15, refillPerSec: 1, notify: true },
  'social:friend-remove': { capacity: 10, refillPerSec: 0.5, notify: true },
  'social:block': { capacity: 10, refillPerSec: 0.5, notify: true },
  'social:unblock': { capacity: 10, refillPerSec: 0.5, notify: true },
  'social:invite': { capacity: 8, refillPerSec: 0.5, notify: true },
  'social:invite-accept': { capacity: 10, refillPerSec: 1, notify: true },
  'social:invite-decline': { capacity: 10, refillPerSec: 1, notify: true },
  'social:join-friend': { capacity: 8, refillPerSec: 1, notify: true },
  'social:privacy': { capacity: 10, refillPerSec: 1, notify: true },
};

/** Min gap between throttle-notice `error` emissions per event, so the notice
 *  itself can never become a second amplification channel. */
export const RATE_LIMIT_NOTIFY_GAP_MS = num(process.env.RL_NOTIFY_GAP_MS, 2000);

// ---------------------------------------------------------------------------
// WebRTC signaling payload bounds.
// ---------------------------------------------------------------------------

/** Hard cap on the serialized size of a single `webrtc-signal` payload's
 *  signalData. Audio-only SDP + trickle ICE stays comfortably under this;
 *  anything larger is a malformed or abusive blob and is rejected before relay. */
export const WEBRTC_MAX_SIGNAL_BYTES = num(process.env.WEBRTC_MAX_SIGNAL_BYTES, 16_384);

// ---------------------------------------------------------------------------
// Chat moderation.
// ---------------------------------------------------------------------------

const DEFAULT_BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'piss',
  'slut', 'whore', 'nigger', 'faggot', 'retard',
];

/** Extra blocked words from CHAT_BLOCKED_WORDS (comma-separated) are merged with
 *  the built-in list. Set CHAT_BLOCKED_WORDS_REPLACE=1 to replace instead. */
function resolveBlockedWords(): string[] {
  const extra = (process.env.CHAT_BLOCKED_WORDS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  const replace = process.env.CHAT_BLOCKED_WORDS_REPLACE === '1';
  const merged = replace ? extra : [...DEFAULT_BLOCKED_WORDS, ...extra];
  return Array.from(new Set(merged));
}

export interface ChatConfig {
  /** Max characters kept (message is truncated to this length, not rejected). */
  maxLength: number;
  /** How many recent messages per sender are remembered for spam detection. */
  dedupeWindow: number;
  /** Reject if the same text appears at least this many times in the window. */
  repeatLimit: number;
  blockedWords: string[];
}

export const CHAT_CONFIG: ChatConfig = {
  maxLength: num(process.env.CHAT_MAX_LENGTH, 300),
  dedupeWindow: num(process.env.CHAT_DEDUPE_WINDOW, 5),
  repeatLimit: num(process.env.CHAT_REPEAT_LIMIT, 3),
  blockedWords: resolveBlockedWords(),
};

// ---------------------------------------------------------------------------
// Idle room garbage collection.
// ---------------------------------------------------------------------------

export interface RoomSweepConfig {
  /** How often the background sweeper runs. */
  intervalMs: number;
  /** Age after which a room with NO members (never joined / abandoned / expired
   *  invite / abandoned public) is deleted. */
  emptyRoomTtlMs: number;
  /** Age after which a member-less room whose match has FINISHED is deleted
   *  (typically shorter than emptyRoomTtlMs). */
  finishedRoomTtlMs: number;
}

export const ROOM_SWEEP_CONFIG: RoomSweepConfig = {
  intervalMs: num(process.env.ROOM_SWEEP_INTERVAL_MS, 60_000),
  emptyRoomTtlMs: num(process.env.ROOM_EMPTY_TTL_MS, 10 * 60_000),
  finishedRoomTtlMs: num(process.env.ROOM_FINISHED_TTL_MS, 5 * 60_000),
};

// ---------------------------------------------------------------------------
// Turn timer recovery.
// ---------------------------------------------------------------------------

/** If a turn's auto-resolution can't complete (engine threw, or produced no
 *  result), the timer retries after this delay instead of giving up — so a room
 *  can never be left permanently without a functioning turn timer. */
export const TURN_TIMER_RETRY_MS = num(process.env.TURN_TIMER_RETRY_MS, 5_000);

// ---------------------------------------------------------------------------
// Game-state broadcast payload.
// ---------------------------------------------------------------------------

/**
 * How many cards from the top of the discard pile are sent to clients.
 *
 * The discard pile grows for the whole round, but the table only ever *renders*
 * a short stack of the most recent cards (everything below is occluded) and all
 * game logic reads only the top card. Shipping the full pile on every action was
 * O(round length) — this window makes each broadcast O(1) while leaving the
 * rendered stack pixel-identical.
 *
 * Must stay >= the number of cards the client stacks (frontend renders the last
 * 10). Total pile size travels separately as `discardCount`.
 */
export const DISCARD_VISIBLE_COUNT = 10;

// ---------------------------------------------------------------------------
// Player profiles & statistics.
// ---------------------------------------------------------------------------

export interface ProfileConfig {
  /** Max recent completed matches kept per profile for the match-history UI. */
  recentMatchesMax: number;
  /**
   * Minimum number of HUMAN participants for a round/match to count toward
   * lifetime stats. Solo-vs-bots practice (1 human) is ignored so stats reflect
   * real competition; set to 1 to also count solo games. Bots never count.
   */
  minHumansForStats: number;
}

export const PROFILE_CONFIG: ProfileConfig = {
  recentMatchesMax: num(process.env.RECENT_MATCHES_MAX, 20),
  minHumansForStats: num(process.env.PROFILE_MIN_HUMANS, 1),
};

// ---------------------------------------------------------------------------
// Friends & Social System.
// ---------------------------------------------------------------------------

export interface SocialConfig {
  /** Max established friends per profile. Bounds the fan-out of a presence
   *  broadcast and the size of a snapshot payload. */
  maxFriends: number;
  /** Max simultaneous outgoing friend requests, so a script can't paper the
   *  whole player base with invitations. */
  maxOutgoingRequests: number;
  /** Max pending incoming requests kept; the oldest is dropped past this. */
  maxIncomingRequests: number;
  /** Max search results returned for one query. */
  searchLimit: number;
  /** How long a game invitation stays valid before it self-expires. */
  inviteTtlMs: number;
  /** Max live outgoing invitations per sender. */
  maxOutgoingInvites: number;
  /** Idle time after which a connected player is shown as Away. */
  awayAfterMs: number;
  /** How often the away sweep runs. Server-side only — no client polling. */
  awaySweepMs: number;
}

export const SOCIAL_CONFIG: SocialConfig = {
  maxFriends: num(process.env.SOCIAL_MAX_FRIENDS, 200),
  maxOutgoingRequests: num(process.env.SOCIAL_MAX_OUTGOING_REQUESTS, 50),
  maxIncomingRequests: num(process.env.SOCIAL_MAX_INCOMING_REQUESTS, 100),
  searchLimit: num(process.env.SOCIAL_SEARCH_LIMIT, 20),
  inviteTtlMs: num(process.env.SOCIAL_INVITE_TTL_MS, 90_000),
  maxOutgoingInvites: num(process.env.SOCIAL_MAX_OUTGOING_INVITES, 10),
  awayAfterMs: num(process.env.SOCIAL_AWAY_AFTER_MS, 5 * 60_000),
  awaySweepMs: num(process.env.SOCIAL_AWAY_SWEEP_MS, 60_000),
};

// ---------------------------------------------------------------------------
// CORS.
// ---------------------------------------------------------------------------

/** cors-package-compatible origin callback (also accepted by Socket.IO). */
export type CorsOriginResolver = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => void;

const stripSlash = (o: string) => o.replace(/\/$/, '');

const parseOrigins = (raw: string): string[] =>
  raw.split(',').map((o) => stripSlash(o.trim())).filter(Boolean);

const isLocalhostOrigin = (origin: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);

/**
 * Resolve the CORS origin policy for BOTH Express and Socket.IO (they share the
 * same `cors` implementation, so one resolver drives both — no drift).
 *
 *   Production  (NODE_ENV=production):
 *     - CORS_ORIGIN must be a real, explicit allow-list. Missing/empty/"*" throws
 *       so the process fails to start with a clear message — never an open policy.
 *   Development:
 *     - localhost / 127.0.0.1 (any port) is always allowed, plus any configured
 *       origins. Unset or "*" reflects every origin for convenience.
 *
 * Throws in production on misconfiguration (caller should log + exit).
 */
export function resolveCorsOrigin(): CorsOriginResolver {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = (process.env.CORS_ORIGIN || '').trim();
  const configured = parseOrigins(raw);

  if (isProd) {
    if (!raw || raw === '*' || configured.length === 0) {
      throw new Error(
        'CORS_ORIGIN must be set to your frontend origin(s) in production ' +
          '(comma-separated, e.g. "https://app.example.com"). Refusing to start ' +
          'with a missing or wildcard ("*") CORS policy.'
      );
    }
    return (origin, cb) => {
      // No Origin header => same-origin / server-to-server (health checks): allow.
      if (!origin || configured.includes(stripSlash(origin))) return cb(null, true);
      cb(new Error(`Origin ${origin} is not allowed by CORS`), false);
    };
  }

  // Development.
  if (!raw || raw === '*') {
    return (_origin, cb) => cb(null, true); // reflect any origin in dev
  }
  return (origin, cb) => {
    if (!origin || isLocalhostOrigin(origin) || configured.includes(stripSlash(origin))) {
      return cb(null, true);
    }
    cb(new Error(`Origin ${origin} is not allowed by CORS`), false);
  };
}
