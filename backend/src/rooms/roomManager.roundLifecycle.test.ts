import { beforeEach, describe, expect, it } from 'vitest';
import { RoomManager, type Room } from './roomManager';
import { MemoryRoomStore } from './roomStore';
import { profileManager } from '../profiles/profileManager';
import { MemoryProfileStore } from '../profiles/profileStore';
import { playCardAction } from '../game/actions';
import { createGameSnapshot } from '../game/clientSnapshot';
import { card } from '../test/helpers';

function startedRoom(count = 3) {
  const manager = new RoomManager();
  const room = manager.createRoom();
  const profiles = Array.from({ length: count }, (_, i) => profileManager.createProfile({ displayName: `Player ${i}` }));
  const players = profiles.map((profile, i) => manager.joinRoom(room.code, profile.displayName, `socket-${i}`, undefined, { profileId: profile.id }).player!);
  manager.startGame(room.code, players[0].id);
  const game = room.game!;
  game.status = 'playing';
  game.currentPlayerId = players[0].id;
  game.direction = 'clockwise';
  game.discardPile = [card('red', '3')];
  game.wildColor = null;
  game.drawStack = 0;
  game.pendingDrawType = null;
  game.rules.mustSayUno = false;
  game.rules.sevenSwap = false;
  game.rules.zeroRotate = false;
  const handValues = ['1', '2', '3'] as const;
  players.forEach((p, i) => { game.hands[p.id] = [card('red', handValues[i])]; });
  return { manager, room, players, profiles, game };
}

beforeEach(() => profileManager.resetForTests(new MemoryProfileStore()));

describe('joining an active round', () => {
  it.each(['playing', 'awaiting_color_selection', 'awaiting_swap_target'] as const)('keeps arrivals out of the dealt roster during %s', (status) => {
    const { manager, room, players, game } = startedRoom();
    game.status = status;
    const originalHands = structuredClone(game.hands);
    const joined = manager.joinRoom(room.code, 'Arrival', 'arrival');
    expect(joined).toMatchObject({ player: null, isSpectator: true, spectator: { waitingForNextRound: true } });
    expect(room.players).toHaveLength(3);
    expect(game.hands).toEqual(originalHands);
    expect(createGameSnapshot(room, null).hand).toEqual([]);
    expect(manager.getJoinDisposition(room)).toMatchObject({ isSpectator: true, waitingForNextRound: true });
    expect(manager.getJoinDisposition(room, players[0].secret).isSpectator).toBe(false);
  });

  it('reclaims an existing hand, while a waiting arrival reconnects as spectator then receives the next deal', () => {
    const { manager, room, players, game } = startedRoom();
    const before = [...game.hands[players[1].id]];
    const back = manager.joinRoom(room.code, 'Returned', 'returned', players[1].secret);
    expect(back.isSpectator).toBe(false);
    expect(game.hands.returned).toEqual(before);
    const joined = manager.joinRoom(room.code, 'Arrival', 'arrival');
    const spectator = manager.joinRoom(room.code, 'Arrival', 'arrival-new', joined.spectator!.secret).spectator!;
    expect(room.spectators).toHaveLength(1);
    game.status = 'ended';
    game.winnerId = players[0].id;
    manager.finalizeRound(room.code);
    manager.startGame(room.code, players[0].id);
    const promoted = room.players.find((p) => p.id === 'arrival-new')!;
    expect(promoted).toMatchObject({ uid: spectator.uid, secret: spectator.secret, name: 'Arrival' });
    expect(room.spectators).toHaveLength(0);
    expect(room.game!.hands[promoted.id]).toHaveLength(7);
    expect(room.match!.scores[promoted.uid].points).toBe(0);
  });

  it('honors disabled spectating and spectator capacity without handing out empty seats', () => {
    const { manager, room } = startedRoom();
    room.houseRules.spectatorMode = false;
    expect(() => manager.joinRoom(room.code, 'Arrival', 'arrival')).toThrow(/round is in progress.*spectating is disabled/i);
    room.houseRules.spectatorMode = true;
    room.houseRules.maxSpectators = 0;
    expect(() => manager.joinRoom(room.code, 'Arrival', 'arrival')).toThrow(/completely full/i);
    expect(room.players).toHaveLength(3);
  });

  it('keeps waiting spectators within the player limit across rounds', () => {
    const { manager, room, players, game } = startedRoom();
    room.houseRules.maxPlayers = 4;
    const waiting = manager.joinRoom(room.code, 'Waiting', 'waiting').spectator!;
    game.status = 'ended';
    game.winnerId = players[0].id;
    manager.finalizeRound(room.code);
    // The waiting arrival takes the only open seat at the next deal.
    manager.startGame(room.code, players[0].id);
    expect(room.players).toHaveLength(4);
    expect(room.players.some((p) => p.uid === waiting.uid)).toBe(true);
    const overflow = manager.joinRoom(room.code, 'Overflow', 'overflow').spectator!;
    room.game!.status = 'ended';
    room.game!.winnerId = players[0].id;
    manager.finalizeRound(room.code);
    manager.startGame(room.code, players[0].id);
    expect(room.players).toHaveLength(4);
    expect(room.spectators?.some((s) => s.uid === overflow.uid)).toBe(true);
  });

  it('admits new players between rounds', () => {
    const { manager, room, players, game } = startedRoom();
    game.status = 'ended';
    game.winnerId = players[0].id;
    manager.finalizeRound(room.code);
    const arrival = manager.joinRoom(room.code, 'Arrival', 'arrival');
    expect(arrival.isSpectator).toBe(false);
    manager.startGame(room.code, players[0].id);
    expect(room.game!.hands.arrival).toHaveLength(7);
  });

  it('gives a returning waiting spectator the host seat when all players left', () => {
    const { manager, room, players } = startedRoom(2);
    const spectator = manager.joinRoom(room.code, 'Arrival', 'arrival').spectator!;
    spectator.disconnectedAt = Date.now();
    players.forEach((p) => manager.leaveRoom(p.id));
    expect(room.players).toHaveLength(0);
    expect(manager.getJoinDisposition(room, spectator.secret).isSpectator).toBe(false);
    const returning = manager.joinRoom(room.code, 'Arrival', 'returned', spectator.secret);
    expect(returning).toMatchObject({ isSpectator: false, player: { uid: spectator.uid, isHost: true } });
    expect(room.hostId).toBe('returned');
    expect(() => manager.startGame(room.code, 'returned', true)).not.toThrow();
    expect(room.game!.hands.returned).toHaveLength(7);
  });
});

describe('departed round participants', () => {
  it('preserves the first finisher in scores and profile history after they leave', () => {
    const { manager, room, players, profiles, game } = startedRoom();
    const winner = players[0];
    playCardAction(game, room.players, winner.id, game.hands[winner.id][0].id);
    expect(game.status).toBe('playing');
    manager.leaveRoom(winner.id);
    expect(game.hands[winner.id]).toBeUndefined();
    expect(manager.publicRoom(room)).not.toHaveProperty('roundParticipants');
    playCardAction(game, room.players, players[1].id, game.hands[players[1].id][0].id);
    const result = manager.finalizeRound(room.code)!;
    expect(result.result).toMatchObject({ winnerUid: winner.uid, winnerName: winner.name, pointsAwarded: 3 });
    expect(createGameSnapshot(room, players[1].id).winnerName).toBe(winner.name);
    expect(createGameSnapshot(room, null).winnerName).toBe(winner.name);
    expect(room.match!.scores[winner.uid]).toMatchObject({ name: winner.name, points: 3, playerId: profiles[0].id });
    manager.finalizeRound(room.code);
    const profile = profileManager.getProfile(profiles[0].id)!;
    expect(profile.stats).toMatchObject({ roundsPlayed: 1, roundsWon: 1, matchesWon: 1, cardsPlayed: 1, pointsScored: 3 });
    expect(profile.recentMatches[0]).toMatchObject({ winnerId: profiles[0].id, winnerName: winner.name, placement: 1 });
    expect(profileManager.getProfile(profiles[1].id)!.recentMatches[0].players).toHaveLength(3);
  });

  it('banks the winner and departing hand points when a departure completes the round', () => {
    const { manager, room, players, game } = startedRoom();
    playCardAction(game, room.players, players[0].id, game.hands[players[0].id][0].id);
    manager.leaveRoom(players[1].id);
    expect(game.status).toBe('ended');
    expect(room.match!.lastRound).toMatchObject({ winnerUid: players[0].uid, pointsAwarded: 5 });
    expect(manager.finalizeRound(room.code)!.result.pointsAwarded).toBe(5);
    expect(room.match!.scores[players[0].uid].points).toBe(5);
  });

  it('retains departed identity and points through persistence, then starts a clean ledger', async () => {
    const { manager, room, players, game } = startedRoom();
    const winner = manager.joinRoom(room.code, 'Renamed winner', 'new-winner', players[0].secret).player!;
    game.currentPlayerId = winner.id;
    playCardAction(game, room.players, winner.id, game.hands[winner.id][0].id);
    manager.leaveRoom(winner.id);
    const seed = JSON.parse(JSON.stringify(room)) as Room;
    const restored = new RoomManager();
    const store = new MemoryRoomStore();
    store.loadAll = async () => [seed];
    restored.setStore(store);
    await restored.hydrate();
    seed.game!.hands[players[1].id] = [];
    seed.game!.status = 'ended';
    expect(restored.finalizeRound(seed.code)!.result).toMatchObject({ winnerUid: winner.uid, winnerName: 'Renamed winner', pointsAwarded: 3 });
    restored.startGame(seed.code, seed.hostId);
    expect(seed.roundParticipants).toHaveLength(2);
    expect(seed.roundParticipants!.every((p) => !p.departed)).toBe(true);
    expect(seed.match!.scores[winner.uid].points).toBe(3);
  });
});
