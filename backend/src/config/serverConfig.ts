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
