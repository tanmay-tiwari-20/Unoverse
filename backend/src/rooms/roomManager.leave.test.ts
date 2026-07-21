import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './roomManager';
import { MemoryRoomStore } from './roomStore';
import { UnoGameState } from '../game/gameState';

/**
 * Turn handoff when a player leaves mid-game. Uses the singleton manager like
 * the other room tests; socket ids are scoped by room code so leaveRoom (which
 * scans every room) can never match a player from another test.
 *
 * startGame deals a random opening, so each test pins the fields the assertion
 * depends on (current player, direction, status) before the leave.
 */

/** Seat three humans (Host=seat1, Ana=seat2, Ben=seat3) and start the game. */
function seatAndStart(): { code: string; ids: [string, string, string]; game: UnoGameState } {
  const room = roomManager.createRoom();
  const code = room.code;
  const ids: [string, string, string] = [`h-${code}`, `a-${code}`, `b-${code}`];
  roomManager.joinRoom(code, 'Host', ids[0]);
  roomManager.joinRoom(code, 'Ana', ids[1]);
  roomManager.joinRoom(code, 'Ben', ids[2]);
  roomManager.startGame(code, ids[0]);

  // Neutralize any random opening-card effects so tests control the turn state.
  const game = room.game!;
  game.status = 'playing';
  game.drawStack = 0;
  game.pendingDrawType = null;
  game.drawnCardId = null;
  game.colorChooserId = null;
  game.swapChooserId = null;
  return { code, ids, game };
}

describe('leaveRoom turn handoff', () => {
  beforeEach(() => {
    roomManager.setStore(new MemoryRoomStore());
  });

  it('hands the turn to the next seat in a clockwise game (never players[0])', () => {
    const { ids, game } = seatAndStart();
    const [host, ana, ben] = ids;
    game.direction = 'clockwise';
    game.currentPlayerId = ana; // seat 2

    roomManager.leaveRoom(ana);

    // Seat order 1→2→3: after seat 2 leaves, seat 3 acts — not seat 1 (=players[0]).
    expect(game.currentPlayerId).toBe(ben);
    expect(game.currentPlayerId).not.toBe(host);
  });

  it('hands the turn to the previous seat when the direction is reversed', () => {
    const { ids, game } = seatAndStart();
    const [host, ana] = ids;
    game.direction = 'counter-clockwise';
    game.currentPlayerId = ana; // seat 2

    roomManager.leaveRoom(ana);

    expect(game.currentPlayerId).toBe(host); // seat 1 precedes seat 2
  });

  it('wraps around the table in turn order', () => {
    const { ids, game } = seatAndStart();
    const [host, , ben] = ids;
    game.direction = 'clockwise';
    game.currentPlayerId = ben; // seat 3, last seat

    roomManager.leaveRoom(ben);

    expect(game.currentPlayerId).toBe(host); // wraps to seat 1
  });

  it('skips a remaining player who no longer holds cards', () => {
    const { ids, game } = seatAndStart();
    const [host, ana, ben] = ids;
    game.direction = 'clockwise';
    game.currentPlayerId = host; // seat 1
    game.hands[ana] = []; // seat 2 already emptied their hand

    roomManager.leaveRoom(host);

    expect(game.currentPlayerId).toBe(ben); // seat 2 is skipped
  });

  it('does not move the turn when a non-active player leaves', () => {
    const { ids, game } = seatAndStart();
    const [host, ana] = ids;
    game.direction = 'clockwise';
    game.currentPlayerId = host;

    roomManager.leaveRoom(ana);

    expect(game.currentPlayerId).toBe(host);
  });

  it('resolves a pending color choice owed by the leaver and advances the turn', () => {
    const { ids, game } = seatAndStart();
    const [, ana, ben] = ids;
    game.direction = 'clockwise';
    game.status = 'awaiting_color_selection';
    game.colorChooserId = ana;
    game.currentPlayerId = ana;

    roomManager.leaveRoom(ana);

    expect(game.status).toBe('playing');
    expect(game.colorChooserId).toBeNull();
    expect(game.currentPlayerId).toBe(ben);
  });

  it('resolves a pending Seven-O swap choice owed by the leaver', () => {
    const { ids, game } = seatAndStart();
    const [, ana, ben] = ids;
    game.direction = 'clockwise';
    game.status = 'awaiting_swap_target';
    game.swapChooserId = ana;
    game.currentPlayerId = ana;

    roomManager.leaveRoom(ana);

    expect(game.status).toBe('playing');
    expect(game.swapChooserId).toBeNull();
    expect(game.currentPlayerId).toBe(ben);
  });

  it("clears the leaver's draw-then-play decision and hand state", () => {
    const { ids, game } = seatAndStart();
    const [, ana] = ids;
    game.currentPlayerId = ana;
    game.drawnCardId = 'some-card-id';

    roomManager.leaveRoom(ana);

    expect(game.drawnCardId).toBeNull();
    expect(game.hands[ana]).toBeUndefined();
    expect(game.unoCalled[ana]).toBeUndefined();
  });

  it('drops the +4 challenge context when the accused leaves, keeping the stack', () => {
    const { ids, game } = seatAndStart();
    const [, ana, ben] = ids;
    game.direction = 'clockwise';
    game.currentPlayerId = ben;
    game.drawStack = 4;
    game.pendingDrawType = 'wild_draw_four';
    game.wildFourPlayerId = ana;
    game.wildFourWasBluff = true;
    game.challengeableById = ben;

    roomManager.leaveRoom(ana);

    expect(game.wildFourPlayerId).toBeNull();
    expect(game.wildFourWasBluff).toBeNull();
    expect(game.challengeableById).toBeNull();
    expect(game.drawStack).toBe(4); // the penalty still resolves as usual
    expect(game.pendingDrawType).toBe('wild_draw_four');
  });

  it('passes the +4 challenge window to the player who now faces the stack', () => {
    const { ids, game } = seatAndStart();
    const [host, ana, ben] = ids;
    game.direction = 'clockwise';
    game.currentPlayerId = ana; // seat 2 was challenged
    game.drawStack = 4;
    game.pendingDrawType = 'wild_draw_four';
    game.wildFourPlayerId = host;
    game.wildFourWasBluff = false;
    game.challengeableById = ana;

    roomManager.leaveRoom(ana);

    expect(game.currentPlayerId).toBe(ben);
    expect(game.challengeableById).toBe(ben);
    expect(game.wildFourPlayerId).toBe(host);
  });
});
