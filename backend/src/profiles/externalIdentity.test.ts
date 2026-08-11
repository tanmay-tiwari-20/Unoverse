import { describe, it, expect, beforeEach } from 'vitest';
import { profileManager } from './profileManager';
import { ProfileStore } from './profileStore';
import { Profile, normalizeProfile, publicProfile } from './profileTypes';

class FakeStore implements ProfileStore {
  public data = new Map<string, Profile>();
  private seed: Profile[];
  constructor(seed: Profile[] = []) {
    this.seed = seed;
  }
  async loadAll(): Promise<Profile[]> {
    return this.seed.map((p) => JSON.parse(JSON.stringify(p)));
  }
  async save(profile: Profile): Promise<void> {
    this.data.set(profile.id, JSON.parse(JSON.stringify(profile)));
  }
  async remove(id: string): Promise<void> {
    this.data.delete(id);
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * External identities are what make a returning platform player the SAME player.
 * The invariant under test throughout: one verified external id maps to exactly
 * one Player ID, for the life of the profile, across restarts.
 */
describe('external identity linking', () => {
  beforeEach(() => {
    profileManager.resetForTests(new FakeStore());
  });

  it('creates a linked, non-guest profile the first time an identity is seen', async () => {
    const { profile, created } = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-1',
      displayName: 'Ada',
    });
    await flush();

    expect(created).toBe(true);
    expect(profile.displayName).toBe('Ada');
    expect(profile.externalIds).toEqual({ crazygames: 'cg-user-1' });
    expect(profile.providers).toEqual(['crazygames']);
    expect(profile.isGuest).toBe(false);
    expect(profile.secret).toBeTruthy();
  });

  it('returns the SAME profile on every subsequent sign-in', () => {
    const first = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-1',
      displayName: 'Ada',
    });
    const second = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-1',
      displayName: 'Ada Renamed On Platform',
    });

    expect(second.created).toBe(false);
    expect(second.profile.id).toBe(first.profile.id);
    expect(second.profile.secret).toBe(first.profile.secret);
    // A platform rename must not clobber the name the player chose in Unoverse.
    expect(second.profile.displayName).toBe('Ada');
  });

  it('keeps distinct identities on distinct profiles', () => {
    const a = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-1',
      displayName: 'Ada',
    });
    const b = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-2',
      displayName: 'Grace',
    });
    expect(a.profile.id).not.toBe(b.profile.id);
  });

  it('re-links the same identity to the same profile after a restart', async () => {
    const store = new FakeStore();
    profileManager.resetForTests(store);

    const before = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-1',
      displayName: 'Ada',
    }).profile;
    await flush();
    expect(store.data.has(before.id)).toBe(true);

    // Restart: a fresh manager hydrating from what was actually persisted. The
    // reverse index is rebuilt from the profiles, so it cannot drift from disk.
    profileManager.resetForTests(new FakeStore([...store.data.values()]));
    await profileManager.hydrate();

    const after = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-user-1',
      displayName: 'Ada',
    });
    expect(after.created).toBe(false);
    expect(after.profile.id).toBe(before.id);
    expect(after.profile.secret).toBe(before.secret);
  });

  it('never exposes external ids on the public projection', () => {
    const { profile } = profileManager.resolveExternalIdentity({
      provider: 'crazygames',
      externalId: 'cg-secret-id',
      displayName: 'Ada',
    });
    const pub = publicProfile(profile) as Record<string, unknown>;
    expect(pub.externalIds).toBeUndefined();
    expect(pub.secret).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain('cg-secret-id');
  });

  it('backfills externalIds on profiles persisted before the field existed', () => {
    const legacy = normalizeProfile({ id: '1234567', displayName: 'Old' }, () => 'sec');
    expect(legacy.externalIds).toEqual({});
  });

  it('drops malformed persisted externalIds rather than trusting them', () => {
    const p = normalizeProfile(
      { id: '1234567', displayName: 'Old', externalIds: { crazygames: 42, '': 'x' } as never },
      () => 'sec',
    );
    expect(p.externalIds).toEqual({});
  });
});
