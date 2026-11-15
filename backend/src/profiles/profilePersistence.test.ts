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

  it('keeps the old durable profile until a failed replacement save succeeds', async () => {
    const legacy = normalizeProfile({ id: 'legacy-profile', displayName: 'Veteran' }, () => 'secret');
    const data = new Map<string, Profile>([[legacy.id, legacy]]);
    let attempts = 0;
    const removed: string[] = [];
    profileManager.resetForTests({
      async loadAll() { return structuredClone([...data.values()]); },
      async save(snapshot) {
        attempts++;
        if (attempts === 1) throw new Error('replacement save failed');
        data.set(snapshot.id, structuredClone(snapshot));
      },
      async remove(id) {
        expect(data.has(profileManager.getProfile(id)!.id)).toBe(true);
        removed.push(id);
        data.delete(id);
      },
    });
    await profileManager.hydrate();
    await settle();
    expect(data.has(legacy.id)).toBe(true);
    expect(removed).toEqual([]);
    await profileManager.shutdown();
    expect(removed).toEqual([legacy.id]);
    expect(data.get(profileManager.getProfile(legacy.id)!.id)?.displayName).toBe('Veteran');
  });

  it('adopts an already saved migrated copy after a crash before old-key deletion', async () => {
    const legacy = normalizeProfile({ id: 'legacy-profile', displayName: 'Original' }, () => 'secret');
    const migrated = normalizeProfile({ ...legacy, id: '4827315', legacyId: legacy.id, displayName: 'Migrated' }, () => 'secret');
    const data = new Map<string, Profile>([[legacy.id, legacy], [migrated.id, migrated]]);
    profileManager.resetForTests({
      async loadAll() { return structuredClone([...data.values()]); },
      async save(snapshot) { data.set(snapshot.id, structuredClone(snapshot)); },
      async remove(id) { data.delete(id); },
    });
    await profileManager.hydrate();
    await profileManager.shutdown();
    expect(profileManager.getProfile(legacy.id)?.id).toBe(migrated.id);
    expect(profileManager.searchProfiles('Migrated')).toHaveLength(1);
    expect(profileManager.searchProfiles('Original')).toHaveLength(0);
    expect([...data.keys()]).toEqual([migrated.id]);
  });

  it('preserves friend references if a crash interrupts migration of related profiles', async () => {
    const alice = normalizeProfile({ id: 'legacy-alice', displayName: 'Alice',
      social: { friends: [{ id: 'legacy-bob', since: 5 }], incoming: [], outgoing: [], blocked: [] } }, () => 'alice-secret');
    const bob = normalizeProfile({ id: 'legacy-bob', displayName: 'Bob',
      social: { friends: [{ id: 'legacy-alice', since: 5 }], incoming: [], outgoing: [], blocked: [] } }, () => 'bob-secret');
    const data = new Map<string, Profile>([[alice.id, alice], [bob.id, bob]]);
    const store: ProfileStore = {
      async loadAll() { return structuredClone([...data.values()]); },
      async save(snapshot) {
        if (snapshot.displayName === 'Bob') throw new Error('Bob replacement unavailable');
        data.set(snapshot.id, structuredClone(snapshot));
      },
      async remove(id) { data.delete(id); },
    };
    profileManager.resetForTests(store);
    await profileManager.hydrate();
    await settle();
    const aliceId = profileManager.getProfile(alice.id)!.id;
    expect(data.get(aliceId)?.social.friends[0].id).toBe(bob.id);
    expect(data.has(bob.id)).toBe(true);

    // Simulated restart: the durable copy of Alice and legacy copy of Bob are
    // all the next owner can see. Bob may get a new ID, but their link survives.
    profileManager.resetForTests({ ...store,
      async save(snapshot) { data.set(snapshot.id, structuredClone(snapshot)); },
    });
    await profileManager.hydrate();
    await profileManager.shutdown();
    const restoredAlice = profileManager.getProfile(alice.id)!;
    const restoredBob = profileManager.getProfile(bob.id)!;
    expect(restoredAlice.id).toBe(aliceId);
    expect(restoredAlice.social.friends[0].id).toBe(restoredBob.id);
    expect(restoredBob.social.friends[0].id).toBe(restoredAlice.id);
    expect(data.get(aliceId)?.social.friends[0].id).toBe(restoredBob.id);
    expect(data.has(alice.id)).toBe(false);
    expect(data.has(bob.id)).toBe(false);
  });
});
