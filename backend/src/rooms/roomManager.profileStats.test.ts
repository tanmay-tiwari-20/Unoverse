import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './roomManager';
import { MemoryRoomStore } from './roomStore';
import { profileManager } from '../profiles/profileManager';
import { MemoryProfileStore } from '../profiles/profileStore';
import { emptyRoundDelta } from '../profiles/profileTypes';
import { card } from '../test/helpers';
import { CardItem } from '../game/deck';

/**
 * Server-authoritative stat capture: finalizeRound is the single banking point,
 * so committing lifetime stats there means both game-end paths (handler + inline)
 * flow through it. These tests drive a real room to a round/match end and assert
 * the seated humans' profiles receive exactly one commit, and that insignificant
 * games (single human vs bots) are ignored.
 */

function endRoundWith(code: string, winnerId: string, opponentHands: Record<string, CardItem[]>) {
  const game = roomManager.getRoom(code)!.game!;
  game.status = 'ended';
  game.winnerId = winnerId;
  game.hands = { [winnerId]: [], ...opponentHands };
}

describe('finalizeRound → profile stat commit', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
    profileManager.setStore(new MemoryProfileStore());
  });

  it('commits round + match stats to each seated human profile', () => {
    const alice = profileManager.createProfile({ displayName: 'Alice' });
    const bob = profileManager.createProfile({ displayName: 'Bob' });

    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Alice', 'a1', undefined, { profileId: alice.id, tag: alice.tag });
    roomManager.joinRoom(room.code, 'Bob', 'b1', undefined, { profileId: bob.id, tag: bob.tag });
    roomManager.startGame(room.code, 'a1');

    // Seed the per-round accumulators (populated live during real play).
    const game = roomManager.getRoom(room.code)!.game!;
    game.roundStats = {
      a1: { ...emptyRoundDelta(), cardsPlayed: 5, wildsPlayed: 1, unoCalls: 1 },
      b1: { ...emptyRoundDelta(), cardsPlayed: 3 },
    };
    // Rig the target low so this single round also decides the match.
    roomManager.getRoom(room.code)!.match!.targetScore = 5;

    endRoundWith(room.code, 'a1', { b1: [card('red', '9')] }); // Bob holds 9 pts
    const res = roomManager.finalizeRound(room.code)!;
    expect(res.matchWon).toBe(true);

    // Winner (Alice)
    const a = profileManager.getProfile(alice.id)!;
    expect(a.stats.roundsPlayed).toBe(1);
    expect(a.stats.roundsWon).toBe(1);
    expect(a.stats.cardsPlayed).toBe(5);
    expect(a.stats.wildsPlayed).toBe(1);
    expect(a.stats.unoCalls).toBe(1);
    expect(a.stats.pointsScored).toBe(9);
    expect(a.stats.placementSum).toBe(1); // finished 1st
    expect(a.stats.matchesPlayed).toBe(1);
    expect(a.stats.matchesWon).toBe(1);
    expect(a.stats.currentStreak).toBe(1);
    expect(a.recentMatches).toHaveLength(1);
    expect(a.recentMatches[0].winnerName).toBe('Alice');
    expect(a.recentMatches[0].placement).toBe(1);
    expect(a.recentMatches[0].rounds).toBe(1);

    // Loser (Bob)
    const b = profileManager.getProfile(bob.id)!;
    expect(b.stats.roundsPlayed).toBe(1);
    expect(b.stats.roundsWon).toBe(0);
    expect(b.stats.cardsPlayed).toBe(3);
    expect(b.stats.pointsScored).toBe(0);
    expect(b.stats.placementSum).toBe(2); // finished 2nd
    expect(b.stats.matchesPlayed).toBe(1);
    expect(b.stats.matchesWon).toBe(0);
    expect(b.stats.currentStreak).toBe(0);
    expect(b.recentMatches[0].placement).toBe(2);
  });

  it('does not double-count when finalizeRound is called twice for the same round', () => {
    const alice = profileManager.createProfile({ displayName: 'Alice' });
    const bob = profileManager.createProfile({ displayName: 'Bob' });

    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Alice', 'a1', undefined, { profileId: alice.id });
    roomManager.joinRoom(room.code, 'Bob', 'b1', undefined, { profileId: bob.id });
    roomManager.startGame(room.code, 'a1');

    endRoundWith(room.code, 'a1', { b1: [card('red', '5')] });
    roomManager.finalizeRound(room.code);
    roomManager.finalizeRound(room.code); // second call — idempotent no-op

    expect(profileManager.getProfile(alice.id)!.stats.roundsPlayed).toBe(1);
    expect(profileManager.getProfile(alice.id)!.stats.pointsScored).toBe(5);
  });

  it('skips stat commits for an insignificant single-human (vs bots) game', () => {
    const solo = profileManager.createProfile({ displayName: 'Solo' });

    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Solo', 'a1', undefined, { profileId: solo.id });
    roomManager.startGame(room.code, 'a1', true); // fill remaining seats with bots

    endRoundWith(room.code, 'a1', {});
    roomManager.finalizeRound(room.code);

    // Only one human at the table -> below minHumansForStats, nothing committed.
    expect(profileManager.getProfile(solo.id)!.stats.roundsPlayed).toBe(0);
    expect(profileManager.getProfile(solo.id)!.stats.matchesPlayed).toBe(0);
  });

  it('skips humans without a profile but still commits for those with one', () => {
    const alice = profileManager.createProfile({ displayName: 'Alice' });

    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Alice', 'a1', undefined, { profileId: alice.id });
    roomManager.joinRoom(room.code, 'Guest', 'g1'); // no profile presented
    roomManager.startGame(room.code, 'a1');

    endRoundWith(room.code, 'a1', { g1: [card('red', '7')] });
    roomManager.finalizeRound(room.code);

    // Two humans meets the significance gate; only Alice carries a profile.
    expect(profileManager.getProfile(alice.id)!.stats.roundsPlayed).toBe(1);
    expect(profileManager.getProfile(alice.id)!.stats.roundsWon).toBe(1);
  });
});
