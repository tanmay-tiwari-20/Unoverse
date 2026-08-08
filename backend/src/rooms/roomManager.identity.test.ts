import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager, Room } from './roomManager';
import { MemoryRoomStore, RoomStore } from './roomStore';
import { profileManager } from '../profiles/profileManager';
import { MemoryProfileStore } from '../profiles/profileStore';
import { card } from '../test/helpers';

/**
 * ============================================================================
 *  Room membership is keyed by identity, never by name.
 *
 *  This is the requirement with the most surface area: seating, reconnection,
 *  scoring, disconnect grace periods and the scoreboard all used to key off the
 *  display name, which silently made "name" mean "person". Every test here puts
 *  two players called Tanmay at one table and checks the two are kept apart.
 * ============================================================================
 */

/**
 * Socket ids are minted per test because `roomManager` is a process-wide
 * singleton whose rooms map outlives `setStore`, and `leaveRoom` finds its target
 * by scanning every room for the socket. Reusing "s-a" across tests would let an
 * earlier test's room answer a later test's leave.
 */
let seq = 0;

/** Two profiles that share a display name, a room, and this test's socket ids. */
function twoNamesakes() {
  const n = ++seq;
  return {
    one: profileManager.createProfile({ displayName: 'Tanmay' }),
    two: profileManager.createProfile({ displayName: 'Tanmay' }),
    room: roomManager.createRoom(),
    sa: `t${n}-a`,
    sb: `t${n}-b`,
    sa2: `t${n}-a2`,
    sb2: `t${n}-b2`,
    sx: `t${n}-x`,
  };
}

describe('duplicate usernames in one room', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
    profileManager.resetForTests(new MemoryProfileStore());
  });

  it('seats both players called Tanmay, in separate seats', () => {
    const { one, two, room, sa, sb } = twoNamesakes();

    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });

    // The second join is a JOIN, not a rejection and not a seat takeover.
    expect(a.player).not.toBeNull();
    expect(b.player).not.toBeNull();
    expect(b.isSpectator).toBe(false);

    const seated = roomManager.getRoom(room.code)!.players;
    expect(seated).toHaveLength(2);
    expect(seated.map((p) => p.name)).toEqual(['Tanmay', 'Tanmay']);
    // Same label, four distinct handles: seat, socket, profile, seat number.
    expect(a.player!.uid).not.toBe(b.player!.uid);
    expect(a.player!.id).not.toBe(b.player!.id);
    expect(a.player!.profileId).toBe(one.id);
    expect(b.player!.profileId).toBe(two.id);
    expect(a.player!.seatNumber).not.toBe(b.player!.seatNumber);
  });

  it('seats profile-less guests who share a name', () => {
    const { room, sa, sb } = twoNamesakes();

    const a = roomManager.joinRoom(room.code, 'Tanmay', sa);
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb);

    // No profile on either side, so only the per-seat secret separates them.
    expect(roomManager.getRoom(room.code)!.players).toHaveLength(2);
    expect(a.player!.uid).not.toBe(b.player!.uid);
    expect(a.player!.secret).not.toBe(b.player!.secret);
    expect(a.player!.profileId).toBeUndefined();
  });

  it('keeps a separate running score for each namesake', () => {
    const { one, two, room, sa, sb } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });
    roomManager.startGame(room.code, sa);

    // Round to A: B is left holding 9 points, which bank to the winner.
    const game = roomManager.getRoom(room.code)!.game!;
    game.status = 'ended';
    game.winnerId = sa;
    game.hands = { [sa]: [], [sb]: [card('red', '9')] };
    roomManager.finalizeRound(room.code);

    const scores = roomManager.getRoom(room.code)!.match!.scores;
    // Two entries, keyed by seat uid — a name-keyed board would hold one.
    expect(Object.keys(scores)).toHaveLength(2);
    expect(scores[a.player!.uid].points).toBe(9);
    expect(scores[b.player!.uid].points).toBe(0);
    // The board carries each seat's own Player ID for the client to render.
    expect(scores[a.player!.uid].playerId).toBe(one.id);
    expect(scores[b.player!.uid].playerId).toBe(two.id);
  });

  it('records the round winner by seat, not by the shared name', () => {
    const { one, two, room, sa, sb } = twoNamesakes();
    roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });
    roomManager.startGame(room.code, sa);

    const game = roomManager.getRoom(room.code)!.game!;
    game.status = 'ended';
    game.winnerId = sb;
    game.hands = { [sb]: [], [sa]: [card('blue', '7')] };
    const res = roomManager.finalizeRound(room.code)!;

    // The name alone cannot say which Tanmay won; the uid can.
    expect(res.result.winnerName).toBe('Tanmay');
    expect(res.result.winnerUid).toBe(b.player!.uid);
  });
  it('arms an independent disconnect grace period per namesake', () => {
    const { one, two, room, sa, sb, sa2 } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });

    const armedA = roomManager.startDisconnectGracePeriod(sa, room.code, () => {});
    const armedB = roomManager.startDisconnectGracePeriod(sb, room.code, () => {});

    expect(armedA!.uid).toBe(a.player!.uid);
    expect(armedB!.uid).toBe(b.player!.uid);
    expect(armedA!.uid).not.toBe(armedB!.uid);

    // A reconnects; B's timer must still be armed, so B is still seated.
    roomManager.joinRoom(room.code, 'Tanmay', sa2, undefined, { profileId: one.id });
    expect(roomManager.getRoom(room.code)!.players).toHaveLength(2);

    roomManager.leaveRoom(sa2);
    roomManager.leaveRoom(sb);
  });

  it('removes only the leaver when two namesakes are seated', () => {
    const { one, two, room, sa, sb } = twoNamesakes();
    roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });

    const left = roomManager.leaveRoom(sa);

    expect(left!.leftPlayer!.profileId).toBe(one.id);
    const remaining = roomManager.getRoom(room.code)!.players;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].uid).toBe(b.player!.uid);
    expect(remaining[0].profileId).toBe(two.id);
  });
});

describe('reconnection by identity', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
    profileManager.resetForTests(new MemoryProfileStore());
  });

  it('reclaims the same seat by Player ID after the socket changes', () => {
    const { one, two, room, sa, sb, sa2 } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });
    const seat = a.player!.uid;

    const back = roomManager.joinRoom(room.code, 'Tanmay', sa2, undefined, { profileId: one.id });

    // Same seat, new socket — and crucially NOT the namesake's seat.
    expect(back.player!.uid).toBe(seat);
    expect(back.player!.id).toBe(sa2);
    expect(back.player!.profileId).toBe(one.id);
    expect(roomManager.getRoom(room.code)!.players).toHaveLength(2);
  });

  it('reclaims a seat by per-seat secret when there is no profile', () => {
    const { room, sa, sb, sa2 } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa);
    roomManager.joinRoom(room.code, 'Tanmay', sb); // namesake guest
    const seat = a.player!.uid;

    const back = roomManager.joinRoom(room.code, 'Tanmay', sa2, a.player!.secret);

    expect(back.player!.uid).toBe(seat);
    expect(roomManager.getRoom(room.code)!.players).toHaveLength(2);
  });

  it('treats a matching name with no proof of identity as a new player', () => {
    const { one, room, sa, sx } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });

    // Same name, no secret and no profile: a stranger, not a reconnect.
    const stranger = roomManager.joinRoom(room.code, 'Tanmay', sx);

    expect(stranger.player!.uid).not.toBe(a.player!.uid);
    expect(roomManager.getRoom(room.code)!.players).toHaveLength(2);
  });

  it('carries the seat, score and hand across a rename', () => {
    const { one, room, sa, sb, sa2 } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    roomManager.joinRoom(room.code, 'Other', sb);
    roomManager.startGame(room.code, sa);

    const game = roomManager.getRoom(room.code)!.game!;
    game.status = 'ended';
    game.winnerId = sa;
    game.hands = { [sa]: [], [sb]: [card('green', '5')] };
    roomManager.finalizeRound(room.code);
    const banked = roomManager.getRoom(room.code)!.match!.scores[a.player!.uid].points;
    expect(banked).toBe(5);

    // Renamed between sessions, then reconnects under the NEW name.
    profileManager.renameProfile(one.id, one.secret, 'Renamed');
    const back = roomManager.joinRoom(room.code, 'Renamed', sa2, undefined, { profileId: one.id });

    expect(back.player!.uid).toBe(a.player!.uid);
    expect(back.player!.name).toBe('Renamed');
    const scores = roomManager.getRoom(room.code)!.match!.scores;
    expect(Object.keys(scores)).toHaveLength(2); // no orphaned old-name entry
    expect(scores[a.player!.uid].points).toBe(banked);
    expect(scores[a.player!.uid].name).toBe('Renamed'); // display copy follows
  });

  it('moves an in-progress hand onto the new socket on reconnect', () => {
    const { one, room, sa, sb, sa2 } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });
    roomManager.joinRoom(room.code, 'Tanmay', sb); // namesake guest
    roomManager.startGame(room.code, sa);

    const before = roomManager.getRoom(room.code)!.game!.hands[sa];
    expect(before.length).toBeGreaterThan(0);

    roomManager.joinRoom(room.code, 'Tanmay', sa2, undefined, { profileId: one.id });

    const game = roomManager.getRoom(room.code)!.game!;
    expect(game.hands[sa2]).toEqual(before);
    expect(game.hands[sa]).toBeUndefined();
    // The namesake's hand is untouched by the other's reconnect.
    expect(game.hands[sb]).toBeDefined();
    expect(a.player!.uid).toBe(roomManager.getRoom(room.code)!.players[0].uid);
  });

  it('does not hand a seat to a different Player ID with the same name', () => {
    const { one, two, room, sa, sb, sb2 } = twoNamesakes();
    const a = roomManager.joinRoom(room.code, 'Tanmay', sa, undefined, { profileId: one.id });

    // Player two arrives with the same name and their own id — new seat.
    const b = roomManager.joinRoom(room.code, 'Tanmay', sb, undefined, { profileId: two.id });
    expect(b.player!.uid).not.toBe(a.player!.uid);

    // And two's per-seat secret cannot reclaim one's seat either.
    const back = roomManager.joinRoom(room.code, 'Tanmay', sb2, b.player!.secret);
    expect(back.player!.uid).toBe(b.player!.uid);
    expect(roomManager.getRoom(room.code)!.players).toHaveLength(2);
  });
});

/**
 * Rooms persisted before seat uids existed keyed their scoreboard by lowercased
 * name and stored bare numbers. `hydrate` has to upgrade them in place: an
 * in-progress match must survive the deploy with every running total intact.
 */
describe('legacy room snapshots', () => {
  /** Store that replays one pre-migration snapshot at hydrate time. */
  class SeededRoomStore implements RoomStore {
    constructor(private readonly seed: unknown[]) {}
    async loadAll(): Promise<Room[]> {
      return JSON.parse(JSON.stringify(this.seed)) as Room[];
    }
    async save(): Promise<void> {}
    async remove(): Promise<void> {}
  }

  beforeEach(() => {
    profileManager.resetForTests(new MemoryProfileStore());
  });

  it('re-keys a name-keyed scoreboard onto seat uids on hydrate', async () => {
    roomManager.setStore(
      new SeededRoomStore([
        {
          code: 'OLDROO',
          hostId: 'sock-1',
          status: 'playing',
          visibility: 'private',
          players: [
            { id: 'sock-1', name: 'Tanmay', seatNumber: 1, isHost: true, secret: 'sec-1' },
            { id: 'sock-2', name: 'Ravi', seatNumber: 2, isHost: false, secret: 'sec-2' },
          ],
          spectators: [],
          match: { scores: { tanmay: 120, ravi: 40 }, targetScore: 500, round: 3, lastRound: null },
          createdAt: 1,
        },
      ])
    );

    await roomManager.hydrate();

    const room = roomManager.getRoom('OLDROO')!;
    const [tanmay, ravi] = room.players;
    // Every seat gains a stable uid...
    expect(tanmay.uid).toBeTruthy();
    expect(ravi.uid).toBeTruthy();
    expect(tanmay.uid).not.toBe(ravi.uid);
    // ...and the running totals move onto them without loss.
    expect(room.match!.scores[tanmay.uid]).toMatchObject({ name: 'Tanmay', points: 120 });
    expect(room.match!.scores[ravi.uid]).toMatchObject({ name: 'Ravi', points: 40 });
    expect(Object.keys(room.match!.scores)).toHaveLength(2);
  });

  it('keeps a departed player’s total on the board after migration', async () => {
    roomManager.setStore(
      new SeededRoomStore([
        {
          code: 'OLDRO2',
          hostId: 'sock-1',
          status: 'playing',
          visibility: 'private',
          players: [{ id: 'sock-1', name: 'Tanmay', seatNumber: 1, isHost: true, secret: 'sec-1' }],
          spectators: [],
          // "gone" left before the snapshot; the old format kept their total.
          match: { scores: { tanmay: 90, gone: 30 }, targetScore: 500, round: 2, lastRound: null },
          createdAt: 1,
        },
      ])
    );

    await roomManager.hydrate();

    const scores = roomManager.getRoom('OLDRO2')!.match!.scores;
    expect(Object.keys(scores)).toHaveLength(2);
    expect(scores[roomManager.getRoom('OLDRO2')!.players[0].uid].points).toBe(90);
    // Kept under a synthetic uid, still labelled — exactly as before the upgrade.
    expect(Object.values(scores).find((s) => s.name === 'gone')?.points).toBe(30);
  });

  it('gives two seats sharing a name two separate uids on hydrate', async () => {
    roomManager.setStore(
      new SeededRoomStore([
        {
          code: 'OLDRO3',
          hostId: 'sock-1',
          status: 'playing',
          visibility: 'private',
          players: [
            { id: 'sock-1', name: 'Tanmay', seatNumber: 1, isHost: true, secret: 'sec-1' },
            { id: 'sock-2', name: 'Tanmay', seatNumber: 2, isHost: false, secret: 'sec-2' },
          ],
          spectators: [],
          match: { scores: { tanmay: 60 }, targetScore: 500, round: 2, lastRound: null },
          createdAt: 1,
        },
      ])
    );

    await roomManager.hydrate();

    const [first, second] = roomManager.getRoom('OLDRO3')!.players;
    expect(first.uid).not.toBe(second.uid);
    // The old format stored ONE total for the shared name, so only one seat can
    // inherit it; the other starts from zero rather than sharing the entry.
    const scores = roomManager.getRoom('OLDRO3')!.match!.scores;
    expect(scores[first.uid].points).toBe(60);
    expect(scores[second.uid]).toBeUndefined();
  });

  it('leaves an already-migrated scoreboard alone', async () => {
    roomManager.setStore(
      new SeededRoomStore([
        {
          code: 'NEWROO',
          hostId: 'sock-1',
          status: 'playing',
          visibility: 'private',
          players: [{ id: 'sock-1', uid: 'seat-1', name: 'Tanmay', seatNumber: 1, isHost: true, secret: 's' }],
          spectators: [],
          match: {
            scores: { 'seat-1': { name: 'Tanmay', points: 70, playerId: '4827315' } },
            targetScore: 500,
            round: 2,
            lastRound: null,
          },
          createdAt: 1,
        },
      ])
    );

    await roomManager.hydrate();

    const room = roomManager.getRoom('NEWROO')!;
    expect(room.players[0].uid).toBe('seat-1'); // not re-minted
    expect(room.match!.scores['seat-1']).toEqual({ name: 'Tanmay', points: 70, playerId: '4827315' });
  });
});
