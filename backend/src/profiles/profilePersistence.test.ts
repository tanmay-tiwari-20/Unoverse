import { afterEach, describe, expect, it } from 'vitest';
import { profileManager } from './profileManager';
import { MemoryProfileStore, ProfileStore } from './profileStore';
import { normalizeProfile, type Profile } from './profileTypes';

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Profile persistence reliability', () => {
  afterEach(() => profileManager.resetForTests(new MemoryProfileStore()));

  it('serializes immutable snapshots and waits for an active write before closing', async () => {
    const snapshots: Profile[] = [];
    const releases: (() => void)[] = [];
    let active = 0;
    let maxActive = 0;
    let closed = false;
    const store: ProfileStore = {
      async loadAll() { return []; },
      async save(snapshot) {
        snapshots.push(snapshot);
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
      },
      async remove() {},
      async close() { expect(active).toBe(0); closed = true; },
    };
    profileManager.resetForTests(store);
    const profile = profileManager.createProfile({ displayName: 'Before' });
    await settle();

    profileManager.renameProfile(profile.id, profile.secret, 'After');
    profileManager.setAvatar(profile.id, profile.secret, 'fox');
    await settle();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].displayName).toBe('Before');
    expect(snapshots[0].avatarUrl).toBeNull();

    const shutdown = profileManager.shutdown();
    await settle();
    expect(closed).toBe(false);
    releases.shift()!();
    await settle();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].displayName).toBe('After');
    expect(snapshots[1].avatarUrl).toBe('fox');
    releases.shift()!();
    await shutdown;
    expect(maxActive).toBe(1);
    expect(closed).toBe(true);
  });

  it('retries a failed snapshot without needing another mutation', async () => {
    let attempts = 0;
    let saved: Profile | undefined;
    const store: ProfileStore = {
      async loadAll() { return []; },
      async save(snapshot) {
        attempts++;
        if (attempts === 1) throw new Error('temporary outage');
        saved = snapshot;
      },
      async remove() {},
    };
    profileManager.resetForTests(store);
    const profile = profileManager.createProfile({ displayName: 'Retry' });
    await settle();
    expect(attempts).toBe(1);
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    expect(attempts).toBe(2);
    expect(saved?.id).toBe(profile.id);
    await profileManager.shutdown();
  });

  it('reports undrained writes after bounded shutdown retries', async () => {
    let closed = false;
    let attempts = 0;
    profileManager.resetForTests({
      async loadAll() { return []; },
      async save() { attempts++; throw new Error('offline'); },
      async remove() {},
      async close() { closed = true; },
    });
    profileManager.createProfile({ displayName: 'Unsaved' });
    await expect(profileManager.shutdown()).rejects.toThrow('pending writes');
    expect(attempts).toBe(4);
    expect(closed).toBe(true);
  });

  it('retains a failed deletion of a migrated profile key until it is retried', async () => {
    let removals = 0;
    const deleted: string[] = [];
    const persisted: string[] = [];
    profileManager.resetForTests({
      async loadAll() { return [normalizeProfile({ id: 'legacy-profile', displayName: 'Legacy' }, () => 'secret')]; },
      async save(snapshot) { persisted.push(snapshot.id); },
      async remove(id) {
        removals++;
        if (removals === 1) throw new Error('temporary delete failure');
        deleted.push(id);
      },
    });
    await profileManager.hydrate();
    await settle();
    expect(removals).toBe(1);
    await profileManager.shutdown();
    expect(deleted).toEqual(['legacy-profile']);
    expect(persisted).toEqual([profileManager.getProfile('legacy-profile')!.id]);
  });
});
