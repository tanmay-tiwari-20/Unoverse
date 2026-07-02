import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './roomManager';
import { MemoryRoomStore } from './roomStore';
import { card } from '../test/helpers';
import { CardItem } from '../game/deck';

/**
 * Match/scoring progression driven through the RoomManager. We create a real room,
 * start it (which initializes the match), then simulate a round ending by forcing
 * the game into an 'ended' state with a known winner + opponent hands, and call
 * finalizeRound() — asserting scores accumulate and the match completes at target.
 */

// Force the room's active game into an ended state with given opponent hands.
function endRoundWith(code: string, winnerId: string, opponentHands: Record<string, CardItem[]>) {
  const room = roomManager.getRoom(code)!;
  const game = room.game!;
  game.status = 'ended';
  game.winnerId = winnerId;
  game.hands = { [winnerId]: [], ...opponentHands };
}

describe('Match scoring across rounds', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
  });

  function setupRoom() {
    const room = roomManager.createRoom();
    roomManager.joinRoom(room.code, 'Alice', 'a1');
    roomManager.joinRoom(room.code, 'Bob', 'b1');
    return room.code;
  }

  it('initializes a match with zeroed scores on first start', () => {
    const code = setupRoom();
    const room = roomManager.startGame(code, 'a1'); // Alice is host
    expect(room.match).toBeDefined();
    expect(room.match!.round).toBe(1);
    expect(room.match!.targetScore).toBe(500);
    expect(room.match!.scores).toEqual({ alice: 0, bob: 0 });
  });

  it('banks the winner the sum of opponents’ cards and advances rounds', () => {
    const code = setupRoom();
    roomManager.startGame(code, 'a1');

    // Round 1: Alice wins; Bob holds a 9 + a skip => 29 points.
    endRoundWith(code, 'a1', { b1: [card('red', '9'), card('blue', 'skip')] });
    const r1 = roomManager.finalizeRound(code)!;
    expect(r1.result.pointsAwarded).toBe(29);
    expect(r1.result.winnerName).toBe('Alice');
    expect(r1.matchWon).toBe(false);
    expect(roomManager.getRoom(code)!.match!.scores.alice).toBe(29);

    // Next round: scores carry over, round increments.
    const room = roomManager.startGame(code, 'a1');
    expect(room.match!.round).toBe(2);
    expect(room.match!.scores.alice).toBe(29);
    expect(room.match!.lastRound).toBeNull();
  });

  it('is idempotent: finalizing the same round twice does not double-count', () => {
    const code = setupRoom();
    roomManager.startGame(code, 'a1');
    endRoundWith(code, 'a1', { b1: [card('red', '5')] });
    roomManager.finalizeRound(code);
    roomManager.finalizeRound(code); // second call — should be a no-op
    expect(roomManager.getRoom(code)!.match!.scores.alice).toBe(5);
  });

  it('declares a match winner once someone reaches the target score', () => {
    const code = setupRoom();
    roomManager.startGame(code, 'a1');
    // Rig the target low by mutating match, then win a big round.
    const room = roomManager.getRoom(code)!;
    room.match!.targetScore = 50;

    endRoundWith(code, 'a1', { b1: [card('wild', 'wild'), card('wild', 'wild_draw_four')] }); // 100 pts
    const r = roomManager.finalizeRound(code)!;
    expect(r.matchWon).toBe(true);
    expect(room.match!.matchWinnerName).toBe('Alice');

    // Starting again after a won match resets scores to a fresh match.
    const fresh = roomManager.startGame(code, 'a1');
    expect(fresh.match!.matchWinnerName).toBeNull();
    expect(fresh.match!.round).toBe(1);
    expect(fresh.match!.scores).toEqual({ alice: 0, bob: 0 });
  });
});
