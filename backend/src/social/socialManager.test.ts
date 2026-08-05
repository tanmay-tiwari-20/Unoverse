import { describe, it, expect, beforeEach } from 'vitest';
import { profileManager } from '../profiles/profileManager';
import { ProfileStore } from '../profiles/profileStore';
import { Profile } from '../profiles/profileTypes';
import { socialManager, SocialError } from './socialManager';
import { presenceManager } from './presenceManager';
import { roomManager } from '../rooms/roomManager';

/** Minimal in-memory store, mirroring profileManager.test.ts. */
class FakeStore implements ProfileStore {
  public data = new Map<string, Profile>();
  async loadAll(): Promise<Profile[]> {
    return [];
  }
  async save(profile: Profile): Promise<void> {
    this.data.set(profile.id, JSON.parse(JSON.stringify(profile)));
  }
  async remove(id: string): Promise<void> {
    this.data.delete(id);
  }
}

let seq = 0;
const mkProfile = (name = `P${++seq}`) => profileManager.createProfile({ displayName: name });

describe('SocialManager — friend graph', () => {
  beforeEach(() => {
    profileManager.setStore(new FakeStore());
  });

  it('sends a request that appears as outgoing on the sender and incoming on the receiver', () => {
    const a = mkProfile();
    const b = mkProfile();

    const result = socialManager.sendRequest(a.id, b.id);

    expect(result.autoAccepted).toBe(false);
    expect(result.affected).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(socialManager.snapshotFor(a.id).outgoing.map((r) => r.profileId)).toEqual([b.id]);
    expect(socialManager.snapshotFor(b.id).incoming.map((r) => r.profileId)).toEqual([a.id]);
    expect(socialManager.relationship(a.id, b.id)).toBe('request-sent');
    expect(socialManager.relationship(b.id, a.id)).toBe('request-received');
  });

  it('refuses a self-request and a duplicate request', () => {
    const a = mkProfile();
    const b = mkProfile();

    expect(() => socialManager.sendRequest(a.id, a.id)).toThrow(SocialError);

    socialManager.sendRequest(a.id, b.id);
    expect(() => socialManager.sendRequest(a.id, b.id)).toThrow(SocialError);
    // Still exactly one edge on each side.
    expect(socialManager.snapshotFor(a.id).outgoing).toHaveLength(1);
    expect(socialManager.snapshotFor(b.id).incoming).toHaveLength(1);
  });

  it('auto-accepts crossed requests instead of deadlocking', () => {
    const a = mkProfile();
    const b = mkProfile();

    socialManager.sendRequest(a.id, b.id);
    const crossed = socialManager.sendRequest(b.id, a.id);

    expect(crossed.autoAccepted).toBe(true);
    expect(socialManager.areFriends(a.id, b.id)).toBe(true);
    expect(socialManager.areFriends(b.id, a.id)).toBe(true);
    expect(socialManager.snapshotFor(a.id).incoming).toHaveLength(0);
    expect(socialManager.snapshotFor(a.id).outgoing).toHaveLength(0);
    expect(socialManager.snapshotFor(b.id).incoming).toHaveLength(0);
    expect(socialManager.snapshotFor(b.id).outgoing).toHaveLength(0);
  });

  it('accepting clears the pending edges on both sides and makes the friendship mutual', () => {
    const a = mkProfile();
    const b = mkProfile();

    socialManager.sendRequest(a.id, b.id);
    socialManager.acceptRequest(b.id, a.id);

    expect(socialManager.areFriends(a.id, b.id)).toBe(true);
    expect(socialManager.friendIdsOf(a.id)).toEqual([b.id]);
    expect(socialManager.friendIdsOf(b.id)).toEqual([a.id]);
    expect(socialManager.snapshotFor(a.id).outgoing).toHaveLength(0);
    expect(socialManager.snapshotFor(b.id).incoming).toHaveLength(0);
    // Duplicate friendship is impossible — a fresh request is refused.
    expect(() => socialManager.sendRequest(a.id, b.id)).toThrow(SocialError);
  });

  it('declining and cancelling remove the edge from both endpoints', () => {
    const a = mkProfile();
    const b = mkProfile();

    socialManager.sendRequest(a.id, b.id);
    socialManager.declineRequest(b.id, a.id);
    expect(socialManager.snapshotFor(a.id).outgoing).toHaveLength(0);
    expect(socialManager.snapshotFor(b.id).incoming).toHaveLength(0);

    socialManager.sendRequest(a.id, b.id);
    socialManager.cancelRequest(a.id, b.id);
    expect(socialManager.snapshotFor(a.id).outgoing).toHaveLength(0);
    expect(socialManager.snapshotFor(b.id).incoming).toHaveLength(0);
  });

  it('removing a friend severs both directions', () => {
    const a = mkProfile();
    const b = mkProfile();
    socialManager.sendRequest(a.id, b.id);
    socialManager.acceptRequest(b.id, a.id);

    socialManager.removeFriend(a.id, b.id);

    expect(socialManager.areFriends(a.id, b.id)).toBe(false);
    expect(socialManager.areFriends(b.id, a.id)).toBe(false);
  });

  it('blocking severs the friendship, clears pending edges and refuses new requests both ways', () => {
    const a = mkProfile();
    const b = mkProfile();
    socialManager.sendRequest(a.id, b.id);
    socialManager.acceptRequest(b.id, a.id);

    socialManager.block(a.id, b.id);

    expect(socialManager.areFriends(a.id, b.id)).toBe(false);
    expect(socialManager.relationship(a.id, b.id)).toBe('blocked');
    expect(socialManager.relationship(b.id, a.id)).toBe('blocked-by');
    expect(socialManager.canSendRequest(b.id, a.id)).toBe(false);
    expect(() => socialManager.sendRequest(b.id, a.id)).toThrow(SocialError);
    expect(() => socialManager.sendRequest(a.id, b.id)).toThrow(SocialError);

    socialManager.unblock(a.id, b.id);
    expect(socialManager.relationship(a.id, b.id)).toBe('none');
    expect(socialManager.canSendRequest(a.id, b.id)).toBe(true);
  });
});

describe('SocialManager — privacy gates', () => {
  beforeEach(() => {
    profileManager.setStore(new FakeStore());
  });

  it('honors a "nobody" friend-request policy', () => {
    const a = mkProfile();
    const b = mkProfile();
    profileManager.setPrivacy(b.id, b.secret, { friendRequests: 'nobody' });

    expect(socialManager.canSendRequest(a.id, b.id)).toBe(false);
    expect(() => socialManager.sendRequest(a.id, b.id)).toThrow(SocialError);
    expect(socialManager.inspect(a.id, b.id).canSendRequest).toBe(false);
  });

  it('honors "friends-of-friends" by requiring a mutual friend', () => {
    const a = mkProfile();
    const b = mkProfile();
    const mutual = mkProfile();

    // b befriends `mutual` while still open, then locks down.
    socialManager.sendRequest(mutual.id, b.id);
    socialManager.acceptRequest(b.id, mutual.id);
    profileManager.setPrivacy(b.id, b.secret, { friendRequests: 'friends-of-friends' });

    // `a` shares nobody with b yet.
    expect(socialManager.canSendRequest(a.id, b.id)).toBe(false);
    expect(() => socialManager.sendRequest(a.id, b.id)).toThrow(/friends of friends/i);

    // Once a and b share `mutual`, the gate opens.
    socialManager.sendRequest(a.id, mutual.id);
    socialManager.acceptRequest(mutual.id, a.id);

    expect(socialManager.canSendRequest(a.id, b.id)).toBe(true);
    expect(() => socialManager.sendRequest(a.id, b.id)).not.toThrow();
  });

  it('withholds match history and outfit from a viewer when hidden, and reports what was hidden', () => {
    const a = mkProfile();
    const b = mkProfile();
    profileManager.setOutfit(b.id, b.secret, 'neon');
    profileManager.applyRoundResult(b.id, {
      won: true,
      placement: 1,
      points: 30,
      durationMs: 1000,
      totalPlayers: 2,
      humanPlayers: 2,
      delta: {
        cardsPlayed: 1, cardsDrawn: 0, wildsPlayed: 0, wildDrawFourPlayed: 0,
        drawCardsPlayed: 0, reverseCardsPlayed: 0, skipCardsPlayed: 0, unoCalls: 0,
        lastCardCalls: 0, unoPenalties: 0, challengesWon: 0, challengesLost: 0, jumpIns: 0,
      },
    });

    // Owner sees everything.
    const own = socialManager.inspect(b.id, b.id);
    expect(own.hidden.matchHistory).toBe(false);
    expect(own.outfit).toBe('neon');

    profileManager.setPrivacy(b.id, b.secret, { showMatchHistory: false, showOutfit: false });

    const seen = socialManager.inspect(a.id, b.id);
    expect(seen.recentMatches).toEqual([]);
    expect(seen.hidden.matchHistory).toBe(true);
    expect(seen.outfit).toBeNull();
    expect(seen.hidden.outfit).toBe(true);
    // Stats themselves are not history and stay visible.
    expect(seen.stats.roundsWon).toBeGreaterThan(0);
  });

  it('hides live status from non-friends but not from friends', () => {
    const a = mkProfile();
    const b = mkProfile();
    profileManager.setPrivacy(b.id, b.secret, { showOnlineStatus: false });
    presenceManager.bind('socket-hidden', b.id);

    expect(presenceManager.viewFor(b.id, false).status).toBe('offline');
    expect(presenceManager.viewFor(b.id, true).status).toBe('online');

    presenceManager.unbind('socket-hidden');
  });
});

describe('SocialManager — search', () => {
  beforeEach(() => {
    profileManager.setStore(new FakeStore());
  });

  it('finds a player by name and by Name#TAG, and marks the viewer relationship', () => {
    const viewer = mkProfile('Searcher');
    const target = profileManager.createProfile({ displayName: 'Zephyrine' });

    const byName = socialManager.search(viewer.id, 'zephyr');
    expect(byName.map((r) => r.profileId)).toContain(target.id);
    expect(byName.find((r) => r.profileId === target.id)?.relationship).toBe('none');

    const byTag = socialManager.search(viewer.id, `Zephyrine#${target.tag}`);
    expect(byTag.map((r) => r.profileId)).toEqual([target.id]);

    socialManager.sendRequest(viewer.id, target.id);
    expect(socialManager.search(viewer.id, 'zephyr').find((r) => r.profileId === target.id)?.relationship)
      .toBe('request-sent');
  });

  it('omits blocked players in either direction', () => {
    const viewer = mkProfile('Blocker');
    const hidden = profileManager.createProfile({ displayName: 'Quixotical' });

    socialManager.block(viewer.id, hidden.id);
    expect(socialManager.search(viewer.id, 'quixotical')).toHaveLength(0);
    expect(socialManager.search(hidden.id, 'blocker')).toHaveLength(0);
  });
});

describe('SocialManager — invites and joining', () => {
  beforeEach(() => {
    profileManager.setStore(new FakeStore());
  });

  const befriend = (a: Profile, b: Profile) => {
    socialManager.sendRequest(a.id, b.id);
    socialManager.acceptRequest(b.id, a.id);
  };

  it('refuses an invite from someone who is not in a room, and one to a non-friend', () => {
    const host = mkProfile();
    const friend = mkProfile();
    presenceManager.bind('s-host', host.id);
    presenceManager.bind('s-friend', friend.id);

    expect(() => socialManager.createInvite(host.id, friend.id)).toThrow(/only invite friends/i);

    befriend(host, friend);
    expect(() => socialManager.createInvite(host.id, friend.id)).toThrow(/in a room/i);

    presenceManager.unbind('s-host');
    presenceManager.unbind('s-friend');
  });

  it('takes the invite room from presence, not the client, and expires by id', () => {
    const host = mkProfile();
    const friend = mkProfile();
    befriend(host, friend);

    const room = roomManager.createRoom('private');
    roomManager.joinRoom(room.code, 'Host', 's-host', undefined, { profileId: host.id });
    presenceManager.bind('s-host', host.id);
    presenceManager.setRoom(host.id, room.code);
    presenceManager.bind('s-friend', friend.id);

    const view = socialManager.createInvite(host.id, friend.id);
    expect(view.roomCode).toBe(room.code);
    expect(view.from.profileId).toBe(host.id);
    expect(socialManager.invitesFor(friend.id)).toHaveLength(1);

    // Only the addressee can act on it.
    expect(() => socialManager.acceptInvite(host.id, view.id)).toThrow(/expired/i);

    const target = socialManager.acceptInvite(friend.id, view.id);
    expect(target.roomCode).toBe(room.code);
    expect(target.asSpectator).toBe(false);
    // Consumed — a second accept is refused.
    expect(() => socialManager.acceptInvite(friend.id, view.id)).toThrow(/expired/i);

    presenceManager.unbind('s-host');
    presenceManager.unbind('s-friend');
    roomManager.leaveRoom('s-host');
  });

  it('routes a join into spectating once the match is running', () => {
    const host = mkProfile();
    const friend = mkProfile();
    befriend(host, friend);

    const room = roomManager.createRoom('private');
    roomManager.joinRoom(room.code, 'Host', 's-host', undefined, { profileId: host.id });
    roomManager.joinRoom(room.code, 'Second', 's-second');
    presenceManager.bind('s-host', host.id);
    presenceManager.setRoom(host.id, room.code);

    expect(socialManager.joinFriend(friend.id, host.id).asSpectator).toBe(false);

    roomManager.startGame(room.code, 's-host');
    const target = socialManager.joinFriend(friend.id, host.id);
    expect(target.roomCode).toBe(room.code);
    expect(target.asSpectator).toBe(true);

    presenceManager.unbind('s-host');
    roomManager.leaveRoom('s-host');
    roomManager.leaveRoom('s-second');
  });

  it('refuses a join when the friend disallows it, and when they are nowhere', () => {
    const host = mkProfile();
    const friend = mkProfile();
    befriend(host, friend);

    expect(() => socialManager.joinFriend(friend.id, host.id)).toThrow(/not in a game/i);

    profileManager.setPrivacy(host.id, host.secret, { allowFriendJoin: false });
    expect(() => socialManager.joinFriend(friend.id, host.id)).toThrow(/does not allow/i);
    expect(() => socialManager.joinFriend(friend.id, friend.id)).toThrow(/yourself/i);
  });
});

describe('PresenceManager — derivation', () => {
  beforeEach(() => {
    profileManager.setStore(new FakeStore());
  });

  it('reference-counts sockets so a second tab closing does not flap offline', () => {
    const p = mkProfile();

    expect(presenceManager.bind('tab-1', p.id)).toBe(true);
    expect(presenceManager.bind('tab-2', p.id)).toBe(false);
    expect(presenceManager.unbind('tab-1')).toBeNull();
    expect(presenceManager.isOnline(p.id)).toBe(true);
    expect(presenceManager.unbind('tab-2')).toBe(p.id);
    expect(presenceManager.isOnline(p.id)).toBe(false);
    expect(presenceManager.statusOf(p.id)).toBe('offline');
  });

  it('derives lobby / playing / watching from the live room rather than a client claim', () => {
    const seated = mkProfile();
    const watcher = mkProfile();

    const room = roomManager.createRoom('private');
    roomManager.joinRoom(room.code, 'Seated', 's-seated', undefined, { profileId: seated.id });
    roomManager.joinRoom(room.code, 'Other', 's-other');
    presenceManager.bind('s-seated', seated.id);
    presenceManager.setRoom(seated.id, room.code);
    presenceManager.bind('s-watch', watcher.id);
    presenceManager.setRoom(watcher.id, room.code);

    expect(presenceManager.statusOf(seated.id)).toBe('lobby');
    expect(presenceManager.profilesInRoom(room.code).sort()).toEqual([seated.id, watcher.id].sort());

    roomManager.startGame(room.code, 's-seated');
    expect(presenceManager.statusOf(seated.id)).toBe('playing');
    // Present in the room but holding no seat => spectating.
    expect(presenceManager.statusOf(watcher.id)).toBe('watching');

    presenceManager.setRoom(seated.id, null);
    expect(presenceManager.statusOf(seated.id)).toBe('online');
    expect(presenceManager.profilesInRoom(room.code)).toEqual([watcher.id]);

    presenceManager.unbind('s-seated');
    presenceManager.unbind('s-watch');
    roomManager.leaveRoom('s-seated');
    roomManager.leaveRoom('s-other');
  });

  it('never leaks a room code to a non-friend', () => {
    const p = mkProfile();
    const room = roomManager.createRoom('private');
    roomManager.joinRoom(room.code, 'Solo', 's-solo', undefined, { profileId: p.id });
    presenceManager.bind('s-solo', p.id);
    presenceManager.setRoom(p.id, room.code);

    expect(presenceManager.viewFor(p.id, false).roomCode).toBeNull();
    expect(presenceManager.viewFor(p.id, true).roomCode).toBe(room.code);

    presenceManager.unbind('s-solo');
    roomManager.leaveRoom('s-solo');
  });
});
