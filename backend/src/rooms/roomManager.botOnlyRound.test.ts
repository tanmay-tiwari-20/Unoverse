import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './roomManager';
import { MemoryRoomStore } from './roomStore';
import { playCardAction } from '../game/actions';
import { card } from '../test/helpers';

/**
 * Room-level view of bot-only round completion: a real room, a real started
 * game, and the human's final card played through the real engine — then the
 * unchanged finalizeRound banking path. Proves the end-to-end result (winner,
 * points, match state) is exactly what it would be if the bots had played their
 * remaining turns out, only reached immediately.
 */

const seatHost = () => {
  const room = roomManager.createRoom();
  roomManager.joinRoom(room.code, 'Host', `h-${room.code}`);
  return room;
};

/** Banked points for a seat. The scoreboard is keyed by seat uid, not by name. */
const pointsOf = (code: string, socketId: string): number | undefined => {
  const room = roomManager.getRoom(code)!;
  const player = room.players.find((p) => p.id === socketId)!;
  return room.match?.scores[player.uid]?.points;
};

describe('bot-only round completion (room level)', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
  });

  it('ends immediately and banks the bots\' remaining cards as points', () => {
    const room = seatHost();
    const code = room.code;
    const hostId = `h-${code}`;
    roomManager.addBots(code, hostId, 3);
    const started = roomManager.startGame(code, hostId);
    const game = started.game!;
    const bots = started.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(3);

    // Rig a deterministic board: the human is one card from winning and every bot
    // still holds a full, known hand.
    const last = card('red', '5');
    game.hands[hostId] = [last];
    game.hands[bots[0].id] = [card('blue', '7'), card('green', '2')]; // 9
    game.hands[bots[1].id] = [card('yellow', 'skip')];                // 20
    game.hands[bots[2].id] = [card('wild', 'wild')];                  // 50
    game.discardPile = [card('red', '3')];
    game.currentPlayerId = hostId;
    game.status = 'playing';

    room.game = playCardAction(game, started.players, hostId, last.id);

    // Round is over the instant the human finished — bots never got a turn.
    expect(room.game.status).toBe('ended');
    expect(room.game.winnerId).toBe(hostId);
    expect(room.game.hands[bots[0].id]).toHaveLength(2);

    // The unchanged banking path scores it: 9 + 20 + 50.
    const finalized = roomManager.finalizeRound(code)!;
    expect(finalized.result.winnerName).toBe('Host');
    expect(finalized.result.pointsAwarded).toBe(79);
    expect(finalized.matchWon).toBe(false);
    expect(pointsOf(code, hostId)).toBe(79);

    roomManager.leaveRoom(hostId);
  });

  it('carries the early-ended round into the next round of the same match', () => {
    const room = seatHost();
    const code = room.code;
    const hostId = `h-${code}`;
    roomManager.addBots(code, hostId, 2);
    const started = roomManager.startGame(code, hostId);
    const bots = started.players.filter((p) => p.isBot);

    const last = card('red', '5');
    const game = started.game!;
    game.hands[hostId] = [last];
    game.hands[bots[0].id] = [card('red', '9')];  // 9
    game.hands[bots[1].id] = [card('blue', '4')]; // 4
    game.discardPile = [card('red', '3')];
    game.currentPlayerId = hostId;
    game.status = 'playing';

    room.game = playCardAction(game, started.players, hostId, last.id);
    expect(room.game.status).toBe('ended');
    roomManager.finalizeRound(code);
    expect(pointsOf(code, hostId)).toBe(13);

    // Multiple rounds: the next round starts clean with the score carried over.
    const next = roomManager.startGame(code, hostId);
    expect(next.match!.round).toBe(2);
    expect(pointsOf(code, hostId)).toBe(13);
    expect(next.game!.status).toBe('playing');
    started.players.forEach((p) => expect(next.game!.hands[p.id]).toHaveLength(7));

    roomManager.leaveRoom(hostId);
  });

  it('does NOT end early while a second human is still holding cards', () => {
    const room = seatHost();
    const code = room.code;
    const hostId = `h-${code}`;
    const guestId = `g-${code}`;
    roomManager.joinRoom(code, 'Guest', guestId);
    roomManager.addBots(code, hostId, 2);
    const started = roomManager.startGame(code, hostId);
    const bots = started.players.filter((p) => p.isBot);

    const last = card('red', '5');
    const game = started.game!;
    game.hands[hostId] = [last];
    game.hands[guestId] = [card('blue', '4')];
    game.hands[bots[0].id] = [card('yellow', '9')];
    game.hands[bots[1].id] = [card('green', '1')];
    game.discardPile = [card('red', '3')];
    game.currentPlayerId = hostId;
    game.status = 'playing';

    room.game = playCardAction(game, started.players, hostId, last.id);

    // Guest is still in the round — normal multiplayer flow continues.
    expect(room.game.status).toBe('playing');
    expect(roomManager.finalizeRound(code)).toBeNull();

    roomManager.leaveRoom(hostId);
    roomManager.leaveRoom(guestId);
  });
});
