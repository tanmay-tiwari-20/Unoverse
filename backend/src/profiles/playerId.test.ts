import { describe, it, expect } from 'vitest';
import {
  PLAYER_ID_MIN,
  PLAYER_ID_MAX,
  PlayerIdAllocator,
  PlayerIdSpaceExhaustedError,
  isPlayerId,
  isPlayerIdFragment,
  parsePlayerId,
} from './playerId';

/**
 * The Player ID is the one value the whole identity system rests on, so these
 * tests pin down the three properties everything else assumes: the FORMAT is
 * exactly what search and validation expect, allocation NEVER returns a live ID,
 * and a saturated space fails loudly instead of quietly issuing a duplicate.
 */

describe('Player ID format', () => {
  it('accepts 6- and 7-digit ids with no leading zero', () => {
    expect(isPlayerId('482731')).toBe(true); // 6 digits — legacy/imported
    expect(isPlayerId('4827315')).toBe(true); // 7 digits — the minted band
    expect(isPlayerId('1058274')).toBe(true);
    expect(isPlayerId('9999999')).toBe(true);
  });

  it('rejects anything that is not a bare 6-7 digit id', () => {
    expect(isPlayerId('0482731')).toBe(false); // leading zero
    expect(isPlayerId('48273')).toBe(false); // too short
    expect(isPlayerId('48273155')).toBe(false); // too long
    expect(isPlayerId('48273a')).toBe(false);
    expect(isPlayerId('#4827315')).toBe(false); // decoration belongs to parse
    expect(isPlayerId('')).toBe(false);
    expect(isPlayerId('  4827315  ')).toBe(false);
  });

  it('is a STRING check — numbers are never valid ids', () => {
    // Identity is not a quantity. If a number were accepted anywhere, some layer
    // would eventually coerce `0482731` and `482731` into the same value.
    expect(isPlayerId(4827315 as unknown)).toBe(false);
    expect(isPlayerId(null)).toBe(false);
    expect(isPlayerId(undefined)).toBe(false);
    expect(isPlayerId({ id: '4827315' })).toBe(false);
  });
});

describe('parsePlayerId', () => {
  it('tolerates the decorations people actually type', () => {
    expect(parsePlayerId('4827315')).toBe('4827315');
    expect(parsePlayerId('#4827315')).toBe('4827315');
    expect(parsePlayerId('  #4827315 ')).toBe('4827315');
    expect(parsePlayerId('482 7315')).toBe('4827315'); // copy/paste artifact
    expect(parsePlayerId('482-7315')).toBe('4827315');
  });

  it('returns null for username queries, so search can branch on it', () => {
    expect(parsePlayerId('Tanmay')).toBeNull();
    expect(parsePlayerId('Tanmay #4827315')).toBeNull();
    expect(parsePlayerId('48273')).toBeNull(); // too short to be an id
    expect(parsePlayerId('')).toBeNull();
  });

  it('treats a numeric prefix as a searchable fragment, not a full id', () => {
    expect(isPlayerIdFragment('482')).toBe(true);
    expect(parsePlayerId('482')).toBeNull();
    expect(isPlayerIdFragment('#4827')).toBe(true);
    expect(isPlayerIdFragment('Tanmay')).toBe(false);
    expect(isPlayerIdFragment('')).toBe(false);
    expect(isPlayerIdFragment('48273155')).toBe(false); // longer than any id
  });
});

describe('PlayerIdAllocator', () => {
  it('mints well-formed ids inside the 7-digit band', () => {
    const alloc = new PlayerIdAllocator();
    for (let i = 0; i < 200; i++) {
      const id = alloc.allocate();
      expect(isPlayerId(id)).toBe(true);
      expect(id).toHaveLength(7);
      expect(Number(id)).toBeGreaterThanOrEqual(PLAYER_ID_MIN);
      expect(Number(id)).toBeLessThanOrEqual(PLAYER_ID_MAX);
    }
  });

  it('never issues the same id twice', () => {
    const alloc = new PlayerIdAllocator();
    const seen = new Set<string>();
    for (let i = 0; i < 5_000; i++) seen.add(alloc.allocate());
    expect(seen.size).toBe(5_000);
    expect(alloc.size).toBe(5_000);
  });

  it('does not mint an id that was reserved by an existing profile', () => {
    const alloc = new PlayerIdAllocator();
    // Reserve a large slice, then mint into what's left and prove no overlap.
    const reserved = new Set<string>();
    for (let n = 1_000_000; n < 1_000_500; n++) {
      const id = String(n);
      expect(alloc.reserve(id)).toBe(true);
      reserved.add(id);
    }
    for (let i = 0; i < 2_000; i++) {
      expect(reserved.has(alloc.allocate())).toBe(false);
    }
  });

  it('refuses to reserve an id twice, so a duplicate in storage is detectable', () => {
    const alloc = new PlayerIdAllocator();
    expect(alloc.reserve('4827315')).toBe(true);
    expect(alloc.reserve('4827315')).toBe(false); // already live — caller must re-mint
    expect(alloc.has('4827315')).toBe(true);
  });

  it('refuses to reserve a malformed id', () => {
    const alloc = new PlayerIdAllocator();
    expect(alloc.reserve('0482731')).toBe(false);
    expect(alloc.reserve('abc')).toBe(false);
    expect(alloc.reserve('')).toBe(false);
    expect(alloc.size).toBe(0);
  });

  it('falls back to a sweep when random probing keeps colliding', () => {
    // A narrow band with every id but one taken: all 12 random probes are
    // near-certain to miss, so the deterministic sweep must find the single hole
    // rather than failing probabilistically. (The band is narrowed only to make
    // "dense" cheap to construct — production uses the full 7-digit space.)
    const alloc = new PlayerIdAllocator(1_000_000, 1_000_009);
    const free = '1000007';
    for (let n = 1_000_000; n <= 1_000_009; n++) {
      if (String(n) !== free) alloc.reserve(String(n));
    }
    expect(alloc.allocate()).toBe(free);
  });

  it('throws rather than duplicating once the space is genuinely full', () => {
    const alloc = new PlayerIdAllocator(1_000_000, 1_000_009);
    for (let n = 1_000_000; n <= 1_000_009; n++) alloc.reserve(String(n));
    expect(() => alloc.allocate()).toThrow(PlayerIdSpaceExhaustedError);
  });

  it('rejects a nonsensical mint band outright', () => {
    expect(() => new PlayerIdAllocator(1_000_009, 1_000_000)).toThrow(RangeError);
    expect(() => new PlayerIdAllocator(1, 9)).toThrow(RangeError); // not Player IDs
  });

  it('recycles an id only after it is explicitly released', () => {
    const alloc = new PlayerIdAllocator();
    const id = alloc.allocate();
    expect(alloc.has(id)).toBe(true);
    alloc.release(id);
    expect(alloc.has(id)).toBe(false);
    expect(alloc.reserve(id)).toBe(true); // free again
  });
});
