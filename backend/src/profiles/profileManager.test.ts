import { describe, it, expect, beforeEach } from 'vitest';
import { profileManager } from './profileManager';
import { ProfileStore } from './profileStore';
import { Profile, emptyStats, emptyRoundDelta, normalizeProfile } from './profileTypes';

/**
 * Fake store mirroring roomManager.persist.test.ts: keeps snapshots in a Map and
 * counts save/remove calls so we can assert write-through + rehydration.
 */
class FakeStore implements ProfileStore {
  public data = new Map<string, Profile>();
  public saves = 0;
  public removes = 0;
  private seed: Profile[];

  constructor(seed: Profile[] = []) {
    this.seed = seed;
  }
  async loadAll(): Promise<Profile[]> {
    return this.seed.map((p) => JSON.parse(JSON.stringify(p)));
  }
  async save(profile: Profile): Promise<void> {
    this.saves++;
    this.data.set(profile.id, JSON.parse(JSON.stringify(profile)));
  }
  async remove(id: string): Promise<void> {
    this.removes++;
    this.data.delete(id);
  }
}

// Persistence flushes on a microtask; wait for it to settle.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('ProfileManager', () => {
  beforeEach(() => {
    profileManager.setStore(new FakeStore());
  });

  it('creates and persists a profile with a unique id, tag and secret', async () => {
    const store = new FakeStore();
    profileManager.setStore(store);

    const a = profileManager.createProfile({ displayName: 'Alice', avatar: 'fox' });
    const b = profileManager.createProfile({ displayName: 'Bob' });
    await flush();

    expect(a.id).not.toBe(b.id);
    expect(a.secret).toBeTruthy();
    expect(a.tag).not.toBe(b.tag);
    expect(store.data.has(a.id)).toBe(true);
    expect(store.data.has(b.id)).toBe(true);

    // Public view never leaks the secret and carries a derived win rate.
    const pub = profileManager.getPublicProfile(a.id)!;
    expect((pub as any).secret).toBeUndefined();
    expect(pub.winRate).toBe(0);
    expect(pub.avatarUrl).toBe('fox');
  });

  it('coalesces a burst of mutations into a single write per profile', async () => {
    const store = new FakeStore();
    profileManager.setStore(store);

    const p = profileManager.createProfile({ displayName: 'Burst' });
    profileManager.renameProfile(p.id, p.secret, 'Burst2');
    profileManager.setAvatar(p.id, p.secret, 'robot');
    await flush();

    expect(store.saves).toBe(1);
    expect(store.data.get(p.id)!.displayName).toBe('Burst2');
    expect(store.data.get(p.id)!.avatarUrl).toBe('robot');
  });

  it('verifies ownership by secret (constant-time compare)', () => {
    const p = profileManager.createProfile({ displayName: 'Owner' });
    expect(profileManager.verify(p.id, p.secret)).toBe(true);
    expect(profileManager.verify(p.id, 'wrong')).toBe(false);
    expect(profileManager.verify('nope', p.secret)).toBe(false);
    expect(profileManager.verify(p.id, undefined)).toBe(false);
  });

  it('rejects edits with the wrong secret', () => {
    const p = profileManager.createProfile({ displayName: 'Guard' });
    expect(() => profileManager.renameProfile(p.id, 'bad', 'Hacker')).toThrow();
    expect(() => profileManager.setAvatar(p.id, 'bad', 'x')).toThrow();
    expect(() => profileManager.resetProfile(p.id, 'bad')).toThrow();
  });

  it('applyRoundResult folds the delta, banks points and records placement', () => {
    const p = profileManager.createProfile({ displayName: 'Rounder' });
    const delta = { ...emptyRoundDelta(), cardsPlayed: 7, wildsPlayed: 1, unoCalls: 1, cardsDrawn: 3 };

    profileManager.applyRoundResult(p.id, { delta, won: true, placement: 1, points: 25 });

    const s = profileManager.getProfile(p.id)!.stats;
    expect(s.roundsPlayed).toBe(1);
    expect(s.roundsWon).toBe(1);
    expect(s.pointsScored).toBe(25);
    expect(s.cardsPlayed).toBe(7);
    expect(s.wildsPlayed).toBe(1);
    expect(s.unoCalls).toBe(1);
    expect(s.cardsDrawn).toBe(3);
    expect(s.placementSum).toBe(1);
    expect(s.placementCount).toBe(1);
  });

  it('applyMatchResult updates match totals, win streak and match history', () => {
    const p = profileManager.createProfile({ displayName: 'Streaker' });
    const record = {
      date: 1,
      players: [{ name: 'Streaker', placement: 1 }],
      winnerName: 'Streaker',
      placement: 1,
      durationMs: 60_000,
      rounds: 3,
      settings: { targetScore: 500, houseRulesSummary: 'Classic' },
    };

    profileManager.applyMatchResult(p.id, { won: true, placement: 1, record, playTimeMs: 60_000 });
    profileManager.applyMatchResult(p.id, { won: true, placement: 1, record, playTimeMs: 30_000 });

    let s = profileManager.getProfile(p.id)!.stats;
    expect(s.matchesPlayed).toBe(2);
    expect(s.matchesWon).toBe(2);
    expect(s.currentStreak).toBe(2);
    expect(s.bestStreak).toBe(2);
    expect(profileManager.getProfile(p.id)!.totalPlayTimeMs).toBe(90_000);
    expect(profileManager.getProfile(p.id)!.recentMatches).toHaveLength(2);

    // A loss breaks the streak (best is retained) and records the losing margin.
    profileManager.applyMatchResult(p.id, {
      won: false, placement: 2, record, playTimeMs: 10_000, lossMargin: 40,
    });
    s = profileManager.getProfile(p.id)!.stats;
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.closestLoss).toBe(40);
  });

  it('resetProfile zeroes stats/history but keeps id, tag and secret', () => {
    const p = profileManager.createProfile({ displayName: 'Resettable' });
    profileManager.applyRoundResult(p.id, { delta: emptyRoundDelta(), won: true, placement: 1, points: 10 });

    const pub = profileManager.resetProfile(p.id, p.secret);
    expect(pub.id).toBe(p.id);
    expect(pub.tag).toBe(p.tag);
    expect(pub.stats).toEqual(emptyStats());
    expect(pub.recentMatches).toEqual([]);
    // Same secret still works after reset.
    expect(profileManager.verify(p.id, p.secret)).toBe(true);
  });

  it('hydrate() restores profiles and backfills a legacy snapshot missing a secret', async () => {
    // A seed-style snapshot lacking `secret` / `totalPlayTimeMs` (predates them).
    const legacy = normalizeProfile(
      {
        id: 'legacy-0001',
        displayName: 'Legacy',
        tag: 'OLD1',
        stats: { ...emptyStats(), matchesPlayed: 5 } as any,
      } as any,
      () => 'placeholder',
    );
    // Strip the fields a real legacy file wouldn't have, to force a backfill.
    delete (legacy as any).secret;

    const store = new FakeStore([legacy as Profile]);
    profileManager.setStore(store);

    await profileManager.hydrate();
    await flush();

    const restored = profileManager.getProfile('legacy-0001')!;
    expect(restored).toBeDefined();
    expect(restored.displayName).toBe('Legacy');
    expect(restored.stats.matchesPlayed).toBe(5);
    // A fresh secret was generated and the backfilled profile re-persisted.
    expect(restored.secret).toBeTruthy();
    expect(store.saves).toBeGreaterThan(0);
  });
});
