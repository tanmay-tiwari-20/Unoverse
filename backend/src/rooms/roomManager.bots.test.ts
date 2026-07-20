import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './roomManager';

/**
 * Bots & Quick Play matchmaking. Uses the singleton manager like the other room
 * tests; each test creates its own room so codes never collide.
 */

const seatHost = (visibility: 'public' | 'private' = 'private') => {
  const room = roomManager.createRoom(visibility);
  roomManager.joinRoom(room.code, 'Host', `h-${room.code}`);
  return room;
};

describe('bots', () => {
  it('adds uniquely-named bots that all contain "Bot"', () => {
    const room = seatHost();
    roomManager.addBots(room.code, `h-${room.code}`, 3);
    const bots = room.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(3);
    const names = bots.map((b) => b.name);
    expect(new Set(names).size).toBe(3);
    names.forEach((n) => expect(n).toMatch(/bot/i));
    bots.forEach((b) => {
      expect(b.isHost).toBe(false);
      expect(b.id.startsWith('bot:')).toBe(true);
    });
  });

  it('clamps bot count to free seats and never exceeds maxPlayers', () => {
    const room = seatHost();
    roomManager.addBots(room.code, `h-${room.code}`, 99);
    expect(room.players.length).toBe(room.houseRules.maxPlayers);
    expect(() => roomManager.addBots(room.code, `h-${room.code}`, 1)).toThrow(/no free seats/i);
  });

  it('only the host may add or remove bots, and only in the lobby', () => {
    const room = seatHost();
    roomManager.joinRoom(room.code, 'Guest', `g-${room.code}`);
    expect(() => roomManager.addBots(room.code, `g-${room.code}`, 1)).toThrow(/host/i);

    roomManager.addBots(room.code, `h-${room.code}`, 1);
    const bot = room.players.find((p) => p.isBot)!;
    expect(() => roomManager.removeBot(room.code, `g-${room.code}`, bot.id)).toThrow(/host/i);

    roomManager.startGame(room.code, `h-${room.code}`);
    expect(() => roomManager.addBots(room.code, `h-${room.code}`, 1)).toThrow(/before the game/i);
  });

  it('allows a solo host to start a game against bots', () => {
    const room = seatHost();
    roomManager.addBots(room.code, `h-${room.code}`, 2);
    const started = roomManager.startGame(room.code, `h-${room.code}`);
    expect(started.status).toBe('playing');
    expect(started.game).toBeDefined();
    // Every player (bots included) got a 7-card opening hand.
    started.players.forEach((p) => {
      expect(started.game!.hands[p.id]).toHaveLength(7);
    });
  });

  it('fillWithBots tops the table up to maxPlayers on start', () => {
    const room = seatHost();
    roomManager.updateHouseRules(room.code, `h-${room.code}`, { maxPlayers: 4 });
    const started = roomManager.startGame(room.code, `h-${room.code}`, true);
    expect(started.players).toHaveLength(4);
    expect(started.players.filter((p) => p.isBot)).toHaveLength(3);
  });

  it('rejects a solo start without bots', () => {
    const room = seatHost();
    expect(() => roomManager.startGame(room.code, `h-${room.code}`)).toThrow(/2 players/i);
  });

  it('a joining human displaces a bot when the lobby is full of bots', () => {
    const room = seatHost();
    roomManager.updateHouseRules(room.code, `h-${room.code}`, { maxPlayers: 3 });
    roomManager.addBots(room.code, `h-${room.code}`, 2);
    expect(room.players).toHaveLength(3);

    const { isSpectator, player } = roomManager.joinRoom(room.code, 'Newcomer', `n-${room.code}`);
    expect(isSpectator).toBe(false);
    expect(player).not.toBeNull();
    expect(room.players).toHaveLength(3); // limit preserved
    expect(room.players.filter((p) => p.isBot)).toHaveLength(1); // one bot replaced
  });

  it('removes all bots and deletes the room when the last human leaves', () => {
    const room = seatHost();
    const code = room.code;
    roomManager.addBots(code, `h-${code}`, 2);
    const result = roomManager.leaveRoom(`h-${code}`);
    expect(result?.room).toBeNull(); // room deleted, bots gone with it
    expect(roomManager.getRoom(code)).toBeUndefined();
  });

  it('never elects a bot as host', () => {
    const room = seatHost();
    roomManager.joinRoom(room.code, 'Guest', `g-${room.code}`);
    roomManager.addBots(room.code, `h-${room.code}`, 1);
    roomManager.leaveRoom(`h-${room.code}`);
    const host = room.players.find((p) => p.isHost);
    expect(host?.name).toBe('Guest');
    expect(host?.isBot).toBeFalsy();
  });
});

describe('quick play matchmaking', () => {
  it('matches into a public lobby with a free seat, preferring fuller rooms', () => {
    const sparse = seatHost('public');
    const fuller = seatHost('public');
    roomManager.joinRoom(fuller.code, 'Second', `s-${fuller.code}`);

    const matched = roomManager.findQuickPlayRoom('Newbie');
    expect(matched?.code).toBe(fuller.code);
    // Consume the sparse room too so later tests aren't affected.
    roomManager.leaveRoom(`h-${sparse.code}`);
    roomManager.leaveRoom(`h-${fuller.code}`);
    roomManager.leaveRoom(`s-${fuller.code}`);
  });

  it('never matches private rooms, started games, or humanless rooms', () => {
    const privateRoom = seatHost('private');

    const playing = seatHost('public');
    roomManager.addBots(playing.code, `h-${playing.code}`, 1);
    roomManager.startGame(playing.code, `h-${playing.code}`);

    const empty = roomManager.createRoom('public'); // no human ever joined

    const matched = roomManager.findQuickPlayRoom('Newbie');
    expect(matched).toBeNull();

    roomManager.leaveRoom(`h-${privateRoom.code}`);
    roomManager.leaveRoom(`h-${playing.code}`);
    roomManager['rooms'].delete(empty.code);
  });

  it('matches a bot-filled public lobby (the bot yields its seat)', () => {
    const room = seatHost('public');
    roomManager.updateHouseRules(room.code, `h-${room.code}`, { maxPlayers: 2 });
    roomManager.addBots(room.code, `h-${room.code}`, 1);

    const matched = roomManager.findQuickPlayRoom('Newbie');
    expect(matched?.code).toBe(room.code);

    const { isSpectator } = roomManager.joinRoom(room.code, 'Newbie', `n-${room.code}`);
    expect(isSpectator).toBe(false);
    expect(room.players.filter((p) => p.isBot)).toHaveLength(0);

    roomManager.leaveRoom(`h-${room.code}`);
    roomManager.leaveRoom(`n-${room.code}`);
  });

  it('skips rooms where the requested name is already taken', () => {
    const room = seatHost('public');
    expect(roomManager.findQuickPlayRoom('Host')).toBeNull();
    expect(roomManager.findQuickPlayRoom('SomeoneElse')?.code).toBe(room.code);
    roomManager.leaveRoom(`h-${room.code}`);
  });

  it('sweeps abandoned humanless rooms past the age threshold', () => {
    const stale = roomManager.createRoom('public');
    stale.createdAt = Date.now() - 11 * 60_000;
    const fresh = roomManager.createRoom('public');

    const removed = roomManager.sweepAbandonedRooms();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(roomManager.getRoom(stale.code)).toBeUndefined();
    expect(roomManager.getRoom(fresh.code)).toBeDefined();
    roomManager['rooms'].delete(fresh.code);
  });
});
