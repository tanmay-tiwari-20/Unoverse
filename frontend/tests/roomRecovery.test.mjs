import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function harness() {
  const modules = new Map();
  const sounds = { play() {}, setEnabled() {} };
  function load(filename, overrides = {}) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} };
    modules.set(filename, loaded);
    const nativeRequire = createRequire(filename);
    const require = (specifier) => {
      if (specifier in overrides) return overrides[specifier];
      if (specifier.endsWith('/soundManager')) return { soundManager: sounds };
      if (specifier.endsWith('/logger')) return { logger: { debug() {}, error() {} } };
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), specifier);
        const source = [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate));
        if (source) return load(source);
      }
      return nativeRequire(specifier);
    };
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    vm.compileFunction(compiled, ['require', 'module', 'exports', 'setTimeout'], { filename })(
      require, loaded, loaded.exports, (callback, delay) => setTimeout(callback, delay).unref(),
    );
    return loaded.exports;
  }

  const { useGameStore: store } = load(path.join(frontend, 'src/store/useGameStore.ts'));
  const useGameStore = Object.assign((selector) => selector(store.getState()), store);
  const listeners = new Map();
  const outgoing = [];
  const socket = {
    id: 'alice-socket', connected: true,
    on(event, callback) { listeners.set(event, [...(listeners.get(event) ?? []), callback]); },
    once(event, callback) { this.on(event, callback); },
    off(event, callback) { listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== callback)); },
    emit(event, payload) { outgoing.push({ event, payload }); },
    connect() {},
  };
  const { useSocket: createSocketCommands } = load(path.join(frontend, 'src/hooks/useSocket.ts'), {
    react: { useEffect: (effect) => effect() },
    'socket.io-client': { io: () => socket },
    '../store/useGameStore': { useGameStore },
    '../store/useProfileStore': { useProfileStore: { getState: () => ({ refreshProfile: () => Promise.resolve() }) } },
    '../lib/social/socialClient': { attachSocialListeners() {}, sayHello() {} },
    '../lib/config': { BACKEND_URL: 'http://localhost' },
    '../lib/platform': { getPlatform: () => ({ getSettings: () => ({}) }) },
  });
  return {
    store, socket, outgoing, commands: createSocketCommands(),
    receive(event, payload) { for (const listener of listeners.get(event) ?? []) listener(payload); },
  };
}

const alice = { id: 'alice-socket', uid: 'alice-seat', name: 'Alice', seatNumber: 1, isHost: true, secret: 'private' };
const room = { code: 'ABC123', hostId: alice.id, players: [alice], status: 'playing' };
const game = {
  handCounts: { 1: 1 }, ownSeat: 1, hand: [{ id: 'red-7', color: 'red', value: '7' }],
  discardTop: [{ id: 'red-8', color: 'red', value: '8' }], discardCount: 1, drawPileCount: 99,
  currentPlayerId: alice.id, currentPlayerSeat: 1, direction: 'clockwise',
  wildColor: null, gameStatus: 'playing', colorChooserId: null, winnerId: null, winnerName: null,
  unoCalled: {}, turnDeadline: Date.now() + 45_000,
};

function join(h) {
  h.commands.joinRoom(room.code, alice.name);
  h.receive('joined-successfully', { room, player: alice, isSpectator: false });
  h.receive('game-updated', game);
}

test('expired reconnect clears the stale table and keeps recovery visible across transport retries', () => {
  for (const missing of [
    { message: 'Room not found' },
    { code: 'ROOM_NOT_FOUND', roomCode: room.code, message: 'Room expired' },
  ]) {
    const h = harness();
    join(h);
    h.receive('disconnect', 'transport close');
    h.receive('connect');
    assert.equal(h.outgoing.at(-1).event, 'join-room');
    assert.equal(h.outgoing.at(-1).payload.secret, alice.secret);
    h.receive('error', missing);
    const recovered = h.store.getState();
    assert.equal(recovered.roomUnavailable, true);
    assert.match(recovered.error, /no longer exists/);
    assert.equal(recovered.room, null);
    assert.equal(recovered.player, null);
    assert.equal(recovered.spectator, null);
    assert.equal(recovered.isSpectator, false);
    assert.equal(recovered.gameStatus, 'lobby');
    assert.equal(recovered.turnDeadline, null);
    assert.equal(recovered.discardCount, 0);
    assert.ok(Object.values(recovered.playerCards).every((hand) => hand.length === 0));
    assert.equal(recovered.isProcessing, false);

    const sends = h.outgoing.length;
    h.receive('lobby-updated', room);
    h.receive('game-updated', game);
    h.receive('game-stopped', { room });
    h.receive('joined-successfully', { room, player: alice });
    h.receive('connect_error', new Error('network'));
    h.receive('connect');
    assert.equal(h.outgoing.length, sends, 'room expiration must stop automatic rejoin');
    assert.equal(h.store.getState().room, null);
    assert.equal(h.store.getState().roomUnavailable, true);
    assert.match(h.store.getState().error, /no longer exists/);

    h.commands.leaveRoom();
    assert.equal(h.store.getState().roomUnavailable, false);
    assert.equal(h.store.getState().error, null);
    join(h);
    assert.equal(h.store.getState().room.code, room.code, 'an explicit new join can recover normally');
  }
});

test('illegal gameplay remains a toast, while stale room errors cannot invalidate another room or home', () => {
  const h = harness();
  join(h);
  h.receive('error', { message: 'Not your turn' });
  assert.equal(h.store.getState().room, room);
  assert.equal(h.store.getState().roomUnavailable, false);
  assert.equal(h.store.getState().toasts.at(-1).message, 'Not your turn');
  h.receive('error', { code: 'ROOM_NOT_FOUND', roomCode: 'OLD123', message: 'Room not found' });
  assert.equal(h.store.getState().room, room);
  h.commands.leaveRoom();
  h.receive('error', { message: 'Room not found' });
  assert.equal(h.store.getState().error, null);
  assert.equal(h.store.getState().roomUnavailable, false);
});

test('first-time missing room joins show recovery and a fresh request clears it', () => {
  const h = harness();
  h.commands.joinRoom(room.code, alice.name);
  h.receive('error', { message: 'This room no longer exists' });
  assert.equal(h.store.getState().roomUnavailable, true);
  h.commands.createRoom(alice.name);
  assert.equal(h.store.getState().roomUnavailable, false);
  assert.equal(h.store.getState().error, null);
  assert.equal(h.outgoing.at(-1).event, 'create-room');
});

test('waiting spectators become players from the next-round roster and keep reconnect credentials', () => {
  for (const event of ['lobby-updated', 'game-started']) {
    const h = harness();
    const spectator = { id: alice.id, uid: alice.uid, name: alice.name, secret: alice.secret, waitingForNextRound: true };
    h.commands.joinRoom(room.code, alice.name);
    h.receive('joined-successfully', { room: { ...room, players: [], spectators: [spectator] }, player: null, isSpectator: true, spectator });
    assert.match(h.store.getState().toasts.at(-1).message, /until the next round/);
    const publicPlayer = { ...alice };
    delete publicPlayer.secret;
    h.receive(event, { ...room, players: [publicPlayer], spectators: [] });
    h.receive('game-updated', game);
    assert.equal(h.store.getState().isSpectator, false);
    assert.equal(h.store.getState().spectator, null);
    assert.equal(h.store.getState().player.secret, alice.secret);
    assert.equal(h.store.getState().player.seatNumber, 1);
    assert.equal(h.store.getState().playerCards[1][0].id, 'red-7');
  }
});
