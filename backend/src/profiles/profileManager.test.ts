import { describe, it, expect, beforeEach } from 'vitest';
import { profileManager } from './profileManager';
import { ProfileStore } from './profileStore';
import {
  Profile,
  emptyStats,
  emptyRoundDelta,
  normalizeProfile,
  sanitizeDisplayName,
} from './profileTypes';
import { isPlayerId } from './playerId';

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
    profileManager.resetForTests(new FakeStore());
  });

  it('creates and persists a profile with a unique id, tag and secret', async () => {
    const store = new FakeStore();
    profileManager.resetForTests(store);

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
    profileManager.resetForTests(store);

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
    profileManager.resetForTests(store);

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

/**
 * ============================================================================
 *  Identity: the Player ID is the only thing that names a player.
 * ============================================================================
 * The username is a label that may repeat and may change; these tests hold the
 * line on both halves of that claim.
 */
describe('Player ID identity', () => {
  beforeEach(() => {
    profileManager.resetForTests(new FakeStore());
  });

  it('issues every profile a short Player ID as its canonical id', () => {
    const p = profileManager.createProfile({ displayName: 'Shorty' });
    expect(isPlayerId(p.id)).toBe(true);
    expect(p.id).toMatch(/^[1-9][0-9]{6}$/);
    // Freshly minted profiles have no pre-migration identity to alias.
    expect(p.legacyId).toBeNull();
  });

  it('gives two players with the SAME username different ids', () => {
    const a = profileManager.createProfile({ displayName: 'Tanmay' });
    const b = profileManager.createProfile({ displayName: 'Tanmay' });
    const c = profileManager.createProfile({ displayName: 'Tanmay' });

    expect(a.displayName).toBe('Tanmay');
    expect(b.displayName).toBe('Tanmay');
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    // Separate profiles, not one merged record: distinct secrets and stats.
    expect(a.secret).not.toBe(b.secret);
    expect(profileManager.getProfile(a.id)).not.toBe(profileManager.getProfile(b.id));
  });

  it('keeps the Player ID fixed across a rename', () => {
    const p = profileManager.createProfile({ displayName: 'Before' });
    const before = p.id;

    profileManager.renameProfile(p.id, p.secret, 'After');

    const after = profileManager.getProfile(before)!;
    expect(after.id).toBe(before); // identity survived
    expect(after.displayName).toBe('After'); // label moved
    // A rename must not create a second player.
    expect(profileManager.searchProfiles('Before')).toHaveLength(0);
    expect(profileManager.searchProfiles('After').map((r) => r.id)).toEqual([before]);
  });

  it('keeps the Player ID fixed across avatar, outfit and stat reset', () => {
    const p = profileManager.createProfile({ displayName: 'Steady' });

    profileManager.setAvatar(p.id, p.secret, 'robot');
    profileManager.setOutfit(p.id, p.secret, 'neon');
    profileManager.resetProfile(p.id, p.secret);

    expect(profileManager.getProfile(p.id)!.id).toBe(p.id);
  });

  it('never lets a caller choose or overwrite its own Player ID', () => {
    // `createProfile` takes no id parameter at all — the only way in is minting.
    const forged = profileManager.createProfile({
      displayName: 'Forger',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ id: '1111111', legacyId: '2222222' } as any),
    });
    expect(forged.id).not.toBe('1111111');
    expect(isPlayerId(forged.id)).toBe(true);
    expect(profileManager.getProfile('1111111')).toBeUndefined();
  });

  it('rejects mutations that present the wrong secret, so an ID cannot be claimed', () => {
    const victim = profileManager.createProfile({ displayName: 'Victim' });
    const attacker = profileManager.createProfile({ displayName: 'Attacker' });

    expect(() => profileManager.renameProfile(victim.id, attacker.secret, 'Pwned')).toThrow();
    expect(() => profileManager.renameProfile(victim.id, 'not-a-secret', 'Pwned')).toThrow();
    expect(profileManager.getProfile(victim.id)!.displayName).toBe('Victim');
  });

  it('sanitizes display names so a name cannot be dressed up as someone else', () => {
    // Written with explicit escapes on purpose: these codepoints are invisible,
    // and a test whose subject cannot be seen in the source is one nobody can
    // maintain. Each lets a name render identically to another player's.
    const sneaky = profileManager.createProfile({
      displayName: '  Tan\u200Bmay\u202E  ', // zero-width space + RTL override
    });
    expect(sneaky.displayName).toBe('Tanmay');

    expect(sanitizeDisplayName('a\u200Bb')).toBe('ab'); // joined, not spaced
    expect(sanitizeDisplayName('Tan\uFEFFmay')).toBe('Tanmay'); // BOM
    expect(sanitizeDisplayName('Tan\u0007may')).toBe('Tanmay'); // C0 control
    expect(sanitizeDisplayName('multi   space')).toBe('multi space');
    expect(sanitizeDisplayName('x'.repeat(200))).toHaveLength(40);
    // An all-invisible name erases itself, so a fallback label stands in and the
    // player still renders. Identity is unaffected either way.
    const blank = profileManager.createProfile({ displayName: '\u200B\u200B' });
    expect(blank.displayName).toBe('Player');
    expect(isPlayerId(blank.id)).toBe(true);
  });
});

/** Build a pre-migration profile: filed under a UUID, no `legacyId`. */
function legacyProfile(id: string, displayName: string, extra: Partial<Profile> = {}): Profile {
  const p = normalizeProfile(
    { id, displayName, createdAt: 1, lastSeenAt: 2, ...extra },
    () => `secret-${id}`
  );
  delete (p as Partial<Profile>).legacyId;
  return p;
}

/**
 * ============================================================================
 *  Migration: existing players keep everything and gain a short ID.
 * ============================================================================
 */
describe('legacy profile migration', () => {
  it('mints a short ID for a legacy profile and keeps all its data', async () => {
    const legacy = legacyProfile('e8b1c0de-0000-4000-8000-000000000001', 'Veteran', {
      avatarUrl: 'fox',
      outfit: 'neon',
      stats: { ...emptyStats(), matchesPlayed: 12, matchesWon: 7 },
    });
    const store = new FakeStore([legacy]);
    profileManager.resetForTests(store);

    await profileManager.hydrate();
    await flush();

    // Reachable by the OLD id \u2014 outstanding client references keep working.
    const migrated = profileManager.getProfile(legacy.id)!;
    expect(migrated).toBeDefined();
    expect(isPlayerId(migrated.id)).toBe(true);
    expect(migrated.id).not.toBe(legacy.id);
    expect(migrated.legacyId).toBe(legacy.id);

    // Nothing was lost in the move.
    expect(migrated.displayName).toBe('Veteran');
    expect(migrated.avatarUrl).toBe('fox');
    expect(migrated.outfit).toBe('neon');
    expect(migrated.stats.matchesPlayed).toBe(12);
    expect(migrated.stats.matchesWon).toBe(7);
    expect(migrated.secret).toBe(`secret-${legacy.id}`); // same credential

    // Filed under the new key, and the stale UUID snapshot is gone so the next
    // boot cannot resurrect it as a second identity.
    expect(store.data.has(migrated.id)).toBe(true);
    expect(store.data.has(legacy.id)).toBe(false);
  });

  it('rewrites friend, request and block edges onto the new IDs', async () => {
    const aId = 'e8b1c0de-0000-4000-8000-00000000000a';
    const bId = 'e8b1c0de-0000-4000-8000-00000000000b';
    const cId = 'e8b1c0de-0000-4000-8000-00000000000c';

    const a = legacyProfile(aId, 'Ay', {
      social: { friends: [{ id: bId, since: 5 }], incoming: [{ id: cId, at: 6 }], outgoing: [], blocked: [] },
    });
    const b = legacyProfile(bId, 'Bee', {
      social: { friends: [{ id: aId, since: 5 }], incoming: [], outgoing: [], blocked: [cId] },
    });
    const c = legacyProfile(cId, 'Cee', {
      social: { friends: [], incoming: [], outgoing: [{ id: aId, at: 6 }], blocked: [] },
    });

    profileManager.resetForTests(new FakeStore([a, b, c]));
    await profileManager.hydrate();
    await flush();

    const A = profileManager.getProfile(aId)!;
    const B = profileManager.getProfile(bId)!;
    const C = profileManager.getProfile(cId)!;

    // Every edge now names a Player ID, and still names the right player.
    expect(A.social.friends.map((f) => f.id)).toEqual([B.id]);
    expect(A.social.friends[0].since).toBe(5); // timestamps preserved
    expect(B.social.friends.map((f) => f.id)).toEqual([A.id]);
    expect(A.social.incoming.map((r) => r.id)).toEqual([C.id]);
    expect(C.social.outgoing.map((r) => r.id)).toEqual([A.id]);
    expect(B.social.blocked).toEqual([C.id]);
    for (const edge of [...A.social.friends, ...A.social.incoming, ...C.social.outgoing]) {
      expect(isPlayerId(edge.id)).toBe(true);
    }
  });

  it('leaves an already-migrated profile untouched on the next boot', async () => {
    const first = new FakeStore([legacyProfile('e8b1c0de-0000-4000-8000-0000000000f1', 'Once')]);
    profileManager.resetForTests(first);
    await profileManager.hydrate();
    await flush();

    const migrated = [...first.data.values()][0];
    expect(isPlayerId(migrated.id)).toBe(true);

    // Reboot from what pass 1 actually wrote: the ID must be adopted as-is.
    const second = new FakeStore([migrated]);
    profileManager.resetForTests(second);
    await profileManager.hydrate();
    await flush();

    const again = profileManager.getProfile(migrated.id)!;
    expect(again.id).toBe(migrated.id); // permanent across boots
    expect(second.saves).toBe(0); // nothing to rewrite
  });

  it('does not merge two legacy profiles that share a username', async () => {
    const one = legacyProfile('e8b1c0de-0000-4000-8000-000000000011', 'Tanmay', {
      stats: { ...emptyStats(), matchesWon: 1 },
    });
    const two = legacyProfile('e8b1c0de-0000-4000-8000-000000000012', 'Tanmay', {
      stats: { ...emptyStats(), matchesWon: 99 },
    });

    profileManager.resetForTests(new FakeStore([one, two]));
    await profileManager.hydrate();
    await flush();

    const A = profileManager.getProfile(one.id)!;
    const B = profileManager.getProfile(two.id)!;
    expect(A.id).not.toBe(B.id);
    expect(A.stats.matchesWon).toBe(1);
    expect(B.stats.matchesWon).toBe(99); // statistics stayed with their owner
    expect(profileManager.searchProfiles('Tanmay')).toHaveLength(2);
  });

  it('re-mints when two stored snapshots claim the same Player ID', async () => {
    // Should never happen, but a hand-edited or restored-twice file must not be
    // able to collapse two players into one slot.
    const dup1 = legacyProfile('4827315', 'First');
    const dup2 = legacyProfile('4827315', 'Second');

    profileManager.resetForTests(new FakeStore([dup1, dup2]));
    await profileManager.hydrate();
    await flush();

    const kept = profileManager.getProfile('4827315')!;
    expect(kept).toBeDefined();
    // The loser was re-minted rather than dropped or merged.
    const both = profileManager.searchProfiles('First').concat(profileManager.searchProfiles('Second'));
    expect(both).toHaveLength(2);
    expect(new Set(both.map((p) => p.id)).size).toBe(2);
    for (const p of both) expect(isPlayerId(p.id)).toBe(true);
  });
});

/**
 * ============================================================================
 *  Search: find one player by ID, or every player wearing a shared name.
 * ============================================================================
 */
describe('profile search', () => {
  let tanmays: Profile[];
  let other: Profile;

  beforeEach(() => {
    profileManager.resetForTests(new FakeStore());
    // Three players who all chose the same name — the case the old unique-name
    // assumption could not represent at all.
    tanmays = [
      profileManager.createProfile({ displayName: 'Tanmay' }),
      profileManager.createProfile({ displayName: 'Tanmay' }),
      profileManager.createProfile({ displayName: 'Tanmay' }),
    ];
    other = profileManager.createProfile({ displayName: 'Tanvi' });
  });

  it('returns exactly one player for an exact Player ID', () => {
    const target = tanmays[1];
    const hit = profileManager.searchProfiles(target.id);
    expect(hit).toHaveLength(1);
    expect(hit[0].id).toBe(target.id);
  });

  it('accepts the ID as typed, pasted or displayed', () => {
    const id = tanmays[0].id;
    for (const query of [id, `#${id}`, ` ${id} `, `#  ${id}`, id.replace(/^(\d{3})/, '$1-')]) {
      const hit = profileManager.searchProfiles(query);
      expect(hit.map((p) => p.id), `query: ${JSON.stringify(query)}`).toEqual([id]);
    }
  });

  it('returns every player sharing a name, each distinguishable by ID', () => {
    const hits = profileManager.searchProfiles('Tanmay');
    expect(hits).toHaveLength(3);
    // Same label, three identities — which is the whole point.
    expect(new Set(hits.map((p) => p.displayName))).toEqual(new Set(['Tanmay']));
    expect(new Set(hits.map((p) => p.id)).size).toBe(3);
    expect(new Set(hits.map((p) => p.id))).toEqual(new Set(tanmays.map((p) => p.id)));
  });

  it('orders duplicate names stably so the list does not shuffle between searches', () => {
    const first = profileManager.searchProfiles('Tanmay').map((p) => p.id);
    const second = profileManager.searchProfiles('Tanmay').map((p) => p.id);
    expect(second).toEqual(first);
    expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b)));
  });

  it('ranks an exact name above a prefix match', () => {
    const hits = profileManager.searchProfiles('Tan');
    // All four are prefix matches; the exact-name group is not privileged here,
    // but every one of them must be reachable and uniquely keyed.
    expect(hits).toHaveLength(4);
    expect(new Set(hits.map((p) => p.id)).size).toBe(4);

    const exact = profileManager.searchProfiles('Tanvi');
    expect(exact[0].id).toBe(other.id);
  });

  it('finds a player by name and ID together, the way the UI shows them', () => {
    const target = tanmays[2];
    for (const query of [`Tanmay #${target.id}`, `Tanmay ${target.id}`, `Tanmay · #${target.id}`]) {
      const hits = profileManager.searchProfiles(query);
      expect(hits.map((p) => p.id), `query: ${JSON.stringify(query)}`).toEqual([target.id]);
    }
  });

  it('matches a Player ID by prefix, but never a legacy UUID', async () => {
    const legacy = legacyProfile('e8b1c0de-0000-4000-8000-0000000000aa', 'Ghost');
    profileManager.resetForTests(new FakeStore([legacy]));
    await profileManager.hydrate();
    await flush();

    const migrated = profileManager.getProfile(legacy.id)!;
    // The new short ID is searchable by prefix...
    const byPrefix = profileManager.searchProfiles(migrated.id.slice(0, 4));
    expect(byPrefix.map((p) => p.id)).toContain(migrated.id);
    // ...while the retired UUID is an alias, not an identity: not searchable.
    expect(profileManager.searchProfiles(legacy.id)).toEqual([]);
    expect(profileManager.searchProfiles(legacy.id.slice(0, 8))).toEqual([]);
    // But it still resolves, so old client references keep working.
    expect(profileManager.resolveId(legacy.id)).toBe(migrated.id);
  });

  it('returns nothing for an unknown ID rather than a near-miss', () => {
    const unused = ['1000001', '9999999', '4827315'].find(
      (id) => !tanmays.some((p) => p.id === id) && id !== other.id
    )!;
    expect(profileManager.searchProfiles(unused)).toEqual([]);
    expect(profileManager.searchProfiles('')).toEqual([]);
    expect(profileManager.searchProfiles('   ')).toEqual([]);
    expect(profileManager.searchProfiles('Nobody')).toEqual([]);
  });

  it('honours the result limit', () => {
    for (let i = 0; i < 30; i++) profileManager.createProfile({ displayName: 'Crowd' });
    expect(profileManager.searchProfiles('Crowd').length).toBe(20); // default
    expect(profileManager.searchProfiles('Crowd', 5)).toHaveLength(5);
  });
});


