import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FileProfileStore, MemoryProfileStore, ProfileStore } from './profileStore';
import { Profile, emptyStats } from './profileTypes';

function sampleProfile(id: string): Profile {
  const now = 1_700_000_000_000;
  return {
    id,
    secret: `secret-${id}`,
    displayName: 'Ace',
    tag: 'AB12',
    avatarUrl: 'fox',
    isGuest: true,
    providers: ['guest'],
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    totalPlayTimeMs: 42_000,
    tokenVersion: 1,
    stats: { ...emptyStats(), matchesPlayed: 3, matchesWon: 2, cardsPlayed: 40 },
    rankedStats: emptyStats(),
    recentMatches: [],
  };
}

describe('FileProfileStore', () => {
  let dir: string;
  let store: ProfileStore;

  beforeEach(() => {
    dir = path.join(os.tmpdir(), `uno-profile-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new FileProfileStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('saves and reloads a profile verbatim (including the private secret)', async () => {
    const profile = sampleProfile('11111111-1111-1111-1111-111111111111');
    await store.save(profile);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(profile);
  });

  it('overwrites an existing snapshot on re-save', async () => {
    const profile = sampleProfile('22222222-2222-2222-2222-222222222222');
    await store.save(profile);
    profile.displayName = 'Renamed';
    profile.stats.matchesWon = 9;
    await store.save(profile);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].displayName).toBe('Renamed');
    expect(loaded[0].stats.matchesWon).toBe(9);
  });

  it('removes a snapshot', async () => {
    await store.save(sampleProfile('aaaaaaaa-0000-0000-0000-000000000001'));
    await store.save(sampleProfile('bbbbbbbb-0000-0000-0000-000000000002'));
    await store.remove('aaaaaaaa-0000-0000-0000-000000000001');
    const loaded = await store.loadAll();
    expect(loaded.map((p) => p.id)).toEqual(['bbbbbbbb-0000-0000-0000-000000000002']);
  });

  it('loadAll returns empty for a fresh directory', async () => {
    expect(await store.loadAll()).toEqual([]);
  });

  it('ignores path-traversal characters in the profile id', async () => {
    await store.save(sampleProfile('../evil'));
    const files = await fs.readdir(dir);
    expect(files.every((f) => !f.includes('..'))).toBe(true);
  });
});

describe('MemoryProfileStore', () => {
  it('persists nothing', async () => {
    const store = new MemoryProfileStore();
    await store.save(sampleProfile('33333333-3333-3333-3333-333333333333'));
    expect(await store.loadAll()).toEqual([]);
  });
});
