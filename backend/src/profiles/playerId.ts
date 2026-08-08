/**
 * ============================================================================
 *  Short Player IDs — generation, validation, collision-free allocation.
 * ============================================================================
 *
 * The Player ID is the PERMANENT, canonical identity of a player: a short
 * numeric string a human can read out loud, type into a search box, or send to a
 * friend. It is server-generated, never derived from the username, and never
 * changes for the lifetime of the profile (renames, avatar changes, reconnects
 * and stat resets all leave it untouched).
 *
 * Format: 7 digits with no leading zero (1000000–9999999). Six-digit IDs are
 * ACCEPTED as valid — profiles migrated from other sources, or a future decision
 * to widen/narrow the range, must not invalidate an already-issued identity — but
 * new IDs are always minted in the 7-digit band so the space stays uniform.
 *
 * Why 7 digits: 9,000,000 addresses is far more than this game will ever seat,
 * which keeps the random-probe allocator below one expected retry at any
 * realistic population, while staying short enough to share verbally.
 *
 * Uniqueness is enforced by `PlayerIdAllocator`, which owns the set of live IDs.
 * Allocation is a random probe (unpredictable IDs — a sequential counter would
 * leak signup order and let anyone enumerate the player table) with a
 * deterministic sweep fallback so a saturated space still yields a free ID
 * instead of failing probabilistically.
 */

import { randomInt } from 'crypto';

/** Smallest ID the allocator mints (inclusive) — the first 7-digit number. */
export const PLAYER_ID_MIN = 1_000_000;
/** Largest ID the allocator mints (inclusive) — the last 7-digit number. */
export const PLAYER_ID_MAX = 9_999_999;
/** Size of the mintable address space. */
export const PLAYER_ID_SPACE = PLAYER_ID_MAX - PLAYER_ID_MIN + 1;

/** Random probes before falling back to a deterministic sweep. */
const MAX_RANDOM_ATTEMPTS = 12;

/**
 * A well-formed Player ID: 6 or 7 digits, no leading zero. Deliberately a
 * STRING check — IDs are identifiers, not quantities, and are compared, stored
 * and transmitted as strings everywhere so no layer can normalize `0482731` and
 * `482731` into the same value or lose precision.
 */
export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{5,6}$/.test(value);
}

/**
 * Extract a Player ID from raw user input, tolerating the decorations people
 * actually type: a leading `#`, surrounding whitespace, and internal spaces from
 * copy/paste. Returns null when the input is not a Player ID (i.e. it is a
 * username query).
 */
export function parsePlayerId(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^#/, '').replace(/[\s-]/g, '');
  return isPlayerId(cleaned) ? cleaned : null;
}

/** True when `raw` could be the start of a Player ID (used for prefix search). */
export function isPlayerIdFragment(raw: string): boolean {
  const cleaned = raw.trim().replace(/^#/, '').replace(/[\s-]/g, '');
  return cleaned.length > 0 && cleaned.length <= 7 && /^[0-9]+$/.test(cleaned);
}

/** Thrown when the ID space is genuinely exhausted (9M live profiles). */
export class PlayerIdSpaceExhaustedError extends Error {
  constructor() {
    super('No Player IDs remain — the identifier space is exhausted.');
    this.name = 'PlayerIdSpaceExhaustedError';
  }
}

/**
 * Owns the set of Player IDs currently in use and hands out fresh ones that
 * cannot collide with any of them.
 *
 * Single-threaded by construction: Node runs every allocation on one thread, and
 * `allocate()` reserves before returning, so two concurrent callers can never
 * observe the same free slot. The caller is responsible for `release()`-ing an
 * ID only when the profile that owns it is genuinely gone.
 */
export class PlayerIdAllocator {
  private used = new Set<string>();
  private readonly min: number;
  private readonly span: number;

  /**
   * The mint band defaults to the full 7-digit space. It is narrowable only so
   * the dense-space paths below (sweep fallback, exhaustion) can be exercised
   * without materialising nine million ids; production always takes the default.
   * Both bounds must themselves be valid Player IDs.
   */
  constructor(min: number = PLAYER_ID_MIN, max: number = PLAYER_ID_MAX) {
    if (!isPlayerId(String(min)) || !isPlayerId(String(max)) || max < min) {
      throw new RangeError(`Invalid Player ID band: ${min}–${max}`);
    }
    this.min = min;
    this.span = max - min + 1;
  }

  /** Claim a specific ID (rehydration of an existing profile). Returns false if
   *  it was already claimed — the caller must then mint a fresh one. */
  public reserve(id: string): boolean {
    if (!isPlayerId(id) || this.used.has(id)) return false;
    this.used.add(id);
    return true;
  }

  public has(id: string): boolean {
    return this.used.has(id);
  }

  public release(id: string): void {
    this.used.delete(id);
  }

  public get size(): number {
    return this.used.size;
  }

  /** Drop every reservation (test isolation only). */
  public clear(): void {
    this.used.clear();
  }

  /**
   * Mint a fresh, unused Player ID and reserve it.
   *
   * Random probing keeps IDs unguessable and is effectively O(1) while the table
   * is sparse. Once the space is dense enough that a dozen probes can all miss,
   * a single linear sweep from a random offset guarantees a free slot is found
   * if one exists — so allocation is deterministic at the limit rather than
   * looping forever or handing back a duplicate.
   */
  public allocate(): string {
    for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
      const candidate = String(this.min + randomInt(0, this.span));
      if (!this.used.has(candidate)) {
        this.used.add(candidate);
        return candidate;
      }
    }

    // Dense space: sweep from a random start so the fallback still does not
    // issue predictable, clustered IDs.
    const start = randomInt(0, this.span);
    for (let offset = 0; offset < this.span; offset++) {
      const candidate = String(this.min + ((start + offset) % this.span));
      if (!this.used.has(candidate)) {
        this.used.add(candidate);
        return candidate;
      }
    }

    throw new PlayerIdSpaceExhaustedError();
  }
}
