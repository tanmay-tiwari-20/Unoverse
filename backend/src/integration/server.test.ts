import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { createHmac } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { card, makeState, players2 } from '../test/helpers';
import type { Room } from '../rooms/roomManager';
import type { VoiceRoster } from '../voice/voiceManager';

const require = createRequire(import.meta.url);
const backendDir = fileURLToPath(new URL('../../', import.meta.url));
let server: ChildProcess | undefined;
let baseUrl: string;
let testDataDir: string;
const sockets: Socket[] = [];
const turnSecret = 'integration-only-turn-secret';

async function joinVoice(socket: Socket): Promise<{ roomCode: string; token: string }> {
  const joined = nextEvent<{ roomCode: string; token: string }>(socket, 'voice-joined');
  socket.emit('voice-join');
  return joined;
}

async function voiceLobby() {
  const host = await connect();
  const created = nextEvent(host, 'joined-successfully');
  host.emit('create-room', { name: 'Voice host' });
  const { room } = await created;
  const rulesUpdated = nextEvent(host, 'house-rules-updated');
  host.emit('update-house-rules', { rules: { maxPlayers: 3, spectatorMode: true, maxSpectators: 2 } });
  await rulesUpdated;
  const peer = await connect();
  const joined = nextEvent(peer, 'joined-successfully');
  peer.emit('join-room', { code: room.code, name: 'Voice peer' });
  await joined;
  return { host, peer, roomCode: room.code as string };
}

function nextEvent<T = any>(socket: Socket, event: string, matches: (payload: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 5_000);
    function receive(payload: T) {
      if (!matches(payload)) return;
      clearTimeout(timeout);
      socket.off(event, receive);
      resolve(payload);
    }
    socket.on(event, receive);
  });
}

async function connect(): Promise<Socket> {
  const socket = io(baseUrl, { autoConnect: false, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const connected = nextEvent(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

async function twoPlayerRoom() {
  const host = await connect();
  const joined = nextEvent(host, 'joined-successfully');
  host.emit('create-room', { name: 'Host' });
  const { room } = await joined;
  const peer = await connect();
  const peerJoined = nextEvent(peer, 'joined-successfully');
  peer.emit('join-room', { code: room.code, name: 'Peer' });
  await peerJoined;
  const rulesUpdated = nextEvent(host, 'house-rules-updated');
  host.emit('update-house-rules', { rules: {
    turnTimer: false, mustSayUno: false, drawUntilPlayable: true,
    drawThenPlay: true, forcePlayDrawnCard: false, mustPlayIfPlayable: false,
  } });
  await rulesUpdated;
  const started = nextEvent(host, 'game-updated');
  host.emit('start-game', {});
  return { host, peer, roomCode: room.code, initial: await started };
}

async function joinSavedSeat(code: string, seat: 1 | 2) {
  const socket = await connect();
  const joined = nextEvent(socket, 'joined-successfully');
  const snapshot = nextEvent(socket, 'game-updated');
  socket.emit('join-room', { code, name: seat === 1 ? 'Alice' : 'Bob', secret: `s${seat}` });
  await joined;
  return { socket, snapshot: await snapshot };
}

async function lateUnoRoom(code: string) {
  const host = await joinSavedSeat(code, 1);
  const peer = await joinSavedSeat(code, 2);
  const cardId = host.snapshot.hand.find((card: { value: string }) => card.value === '7').id;
  const played = nextEvent(host.socket, 'game-updated', (snapshot) => snapshot.lastAction?.card?.id === cardId);
  host.socket.emit('play-card', { cardId });
  const grace = await played;
  expect(grace.pendingUnoPlayerId).toBe(host.socket.id);
  expect(grace.hand).toHaveLength(1);
  return { host: host.socket, peer: peer.socket, peerHand: peer.snapshot.hand, grace };
}

async function stopServer(): Promise<void> {
  const child = server;
  if (!child) return;
  const running = () => child.exitCode === null && child.signalCode === null;
  const exited = running() ? new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))) : Promise.resolve(true);
  const waitForExit = async (milliseconds: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([exited, new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    if (running()) child.kill('SIGTERM');
    if (!await waitForExit(3000)) {
      child.kill('SIGKILL');
      if (!await waitForExit(2000)) throw new Error('Integration server did not exit after forced termination');
    }
  } finally {
    child.stderr?.destroy();
    child.stdout?.destroy();
    child.unref();
    server = undefined;
  }
}

async function cleanupFixture(): Promise<void> {
  for (const socket of sockets.splice(0)) socket.disconnect();
  try {
    await stopServer();
  } finally {
    if (testDataDir) {
      const resolved = path.resolve(testDataDir);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('unoverse-socket-')) {
        throw new Error('Refusing to remove an unexpected integration data directory');
      }
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}

beforeAll(async () => {
  try {
  testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unoverse-socket-'));
  const roomDir = path.join(testDataDir, 'rooms');
  await fs.mkdir(roomDir);
  for (const code of ['UNO001', 'UNO002', 'UNO003']) {
    const players = players2();
    const game = makeState({
      hands: { p1: [card('red', '7'), card('blue', '8')], p2: [card('red', '8'), card('yellow', '2')] },
      rules: { allowLateUno: true, unoPenaltyCards: 2, turnTimer: false },
    });
    const room: Room = { code, hostId: 'p1', players, game, houseRules: game.rules, status: 'playing' };
    await fs.writeFile(path.join(roomDir, `${code}.json`), JSON.stringify(room));
  }
  for (const [code, value] of [['TIM001', 'skip'], ['TIM002', 'reverse']] as const) {
    const players = players2();
    const game = makeState({
      hands: { p1: [card('red', value), card('blue', '8')], p2: [card('green', '2')] },
      rules: { mustSayUno: false, turnTimer: true, turnTimerSeconds: 45 },
    });
    const room: Room = { code, hostId: 'p1', players, game, houseRules: game.rules, status: 'playing' };
    await fs.writeFile(path.join(roomDir, `${code}.json`), JSON.stringify(room));
  }
  {
    const game = makeState({
      hands: { p1: [card('blue', '8')], p2: [card('green', '2')] },
      deck: [card('red', '2')], rules: { mustSayUno: false, turnTimer: false },
    });
    const room: Room = { code: 'DRW001', hostId: 'p1', players: players2(), game, houseRules: game.rules, status: 'playing' };
    await fs.writeFile(path.join(roomDir, `${room.code}.json`), JSON.stringify(room));
  }
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const selected = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(selected));
    });
  });
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [
    '-r', require.resolve('ts-node/register/transpile-only'), path.join(backendDir, 'src/index.ts'),
  ], {
    // loadEnv reads process.cwd(); an isolated cwd must never load backend/.env.
    // The absolute preload, entrypoint and TS_NODE_PROJECT retain module resolution.
    cwd: testDataDir,
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'development', STORE: 'file',
      DATA_DIR: roomDir, PROFILE_DIR: path.join(testDataDir, 'profiles'),
      REPORT_DIR: path.join(testDataDir, 'reports'),
      REDIS_URL: '', CORS_ORIGIN: '*', TRUST_PROXY_HOPS: '0', LOG_LEVEL: 'silent',
      CRAZYGAMES_AUTH_ENABLED: 'false', TS_NODE_PROJECT: path.join(backendDir, 'tsconfig.json'),
      VOICE_MAX_PARTICIPANTS: '2', TURN_URLS: 'turn:relay.example:3478',
      TURN_SHARED_SECRET: turnSecret, TURN_CREDENTIAL_TTL_SECONDS: '120',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let startupErrors = '';
  server.stderr?.on('data', (chunk) => { startupErrors = (startupErrors + String(chunk)).slice(-4_000); });
  let spawnError: Error | undefined;
  server.once('error', (error) => { spawnError = error; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Integration server exited: ${server.exitCode}\n${startupErrors}`);
    try {
      if ((await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch { /* Wait for the server to bind. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Integration server did not become ready\n${startupErrors}`);
  } catch (error) {
    await cleanupFixture();
    throw error;
  }
}, 30_000);

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(cleanupFixture, 10_000);

describe('HTTP and Socket.IO boundaries', () => {
  // Restored seats have a 60-second reconnect deadline; exercise them first.
  it.each([['TIM001', 'skip'], ['TIM002', 'reverse']] as const)('renews the deadline after %s %s and preserves it through resync', async (code, value) => {
    const host = await joinSavedSeat(code, 1);
    await joinSavedSeat(code, 2);
    const previousDeadline = host.snapshot.turnDeadline;
    expect(previousDeadline).toBeGreaterThan(Date.now());
    await new Promise((resolve) => setTimeout(resolve, 25));
    const playedAt = Date.now();
    const updated = nextEvent(host.socket, 'game-updated', (snapshot) => snapshot.lastAction?.card?.value === value);
    host.socket.emit('play-card', { cardId: host.snapshot.hand.find((card: { value: string }) => card.value === value).id });
    const extraTurn = await updated;
    expect(extraTurn.currentPlayerId).toBe(host.socket.id);
    expect(extraTurn.turnDeadline).toBeGreaterThan(previousDeadline);
    expect(extraTurn.turnDeadline).toBeGreaterThanOrEqual(playedAt + 45_000);

    const rebroadcast = nextEvent(host.socket, 'game-updated');
    host.socket.emit('call-uno');
    expect((await rebroadcast).turnDeadline).toBe(extraTurn.turnDeadline);
    host.socket.disconnect();
    const rejoined = await joinSavedSeat(code, 1);
    expect(rejoined.snapshot.turnDeadline).toBe(extraTurn.turnDeadline);
  });

  it('keeps late UNO open after an invalid request and accepts the real call before the next play', async () => {
    const { host, peer, peerHand } = await lateUnoRoom('UNO001');
    const invalid = nextEvent(peer, 'error');
    peer.emit('play-card', { cardId: peerHand.find((card: { color: string }) => card.color === 'yellow').id });
    expect((await invalid).message).toMatch(/invalid move/i);
    const called = nextEvent(host, 'game-updated');
    host.emit('call-uno');
    const declared = await called;
    expect(declared.pendingUnoPlayerId).toBeNull();
    expect(declared.unoCalled[host.id!]).toBe(true);
    const advanced = nextEvent(host, 'game-updated');
    peer.emit('play-card', { cardId: peerHand.find((card: { color: string }) => card.color === 'red').id });
    expect((await advanced).hand).toHaveLength(1);
  });

  it('announces the actual deferred penalty once and does not replay it on a later UNO call', async () => {
    const { host, peer, peerHand } = await lateUnoRoom('UNO002');
    const notices: any[] = [];
    host.on('uno-penalty', (notice) => notices.push(notice));
    const advanced = nextEvent(host, 'game-updated');
    peer.emit('play-card', { cardId: peerHand.find((card: { color: string }) => card.color === 'red').id });
    const expired = await advanced;
    expect(expired.hand).toHaveLength(3);
    expect(expired.pendingUnoPlayerId).toBe(peer.id);
    expect(notices).toEqual([{ playerId: host.id, playerName: 'Alice', drawCount: 2 }]);
    const called = nextEvent(host, 'game-updated');
    peer.emit('call-uno');
    expect((await called).pendingUnoPlayerId).toBeNull();
    expect(notices).toHaveLength(1);
  });

  it('preserves late UNO eligibility through socket reconnection', async () => {
    const { host, peer, peerHand } = await lateUnoRoom('UNO003');
    host.disconnect();
    const rejoined = await joinSavedSeat('UNO003', 1);
    expect(rejoined.snapshot.pendingUnoPlayerId).toBe(rejoined.socket.id);
    const called = nextEvent(rejoined.socket, 'game-updated');
    rejoined.socket.emit('call-uno');
    const declared = await called;
    expect(declared.unoCalled[rejoined.socket.id!]).toBe(true);
    expect(declared.pendingUnoPlayerId).toBeNull();
    const advanced = nextEvent(rejoined.socket, 'game-updated');
    peer.emit('play-card', { cardId: peerHand.find((card: { color: string }) => card.color === 'red').id });
    expect((await advanced).hand).toHaveLength(1);
  });

  it('rejects malformed HTTP payloads with JSON errors and keeps the server usable', async () => {
    for (const body of [null, [], { code: 123, name: 'Player' }, { code: 'UNO001', name: {} }]) {
      const response = await fetch(`${baseUrl}/api/rooms/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBeTypeOf('string');
    }
    const invalidJson = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
    });
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toMatch(/JSON/);
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
  });

  it('acknowledges bug reports only after saving a durable operator-readable record', async () => {
    const invalid = await fetch(`${baseUrl}/api/report-bug`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'short' }),
    });
    expect(invalid.status).toBe(400);
    const response = await fetch(`${baseUrl}/api/report-bug`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'The draw button was unresponsive.', secret: 'must-not-be-stored' }),
    });
    expect(response.status).toBe(201);
    const { id } = await response.json();
    const saved = JSON.parse(await fs.readFile(path.join(testDataDir, 'reports', `${id}.json`), 'utf8'));
    expect(saved.message).toBe('The draw button was unresponsive.');
    expect(saved).not.toHaveProperty('secret');
    expect((await fetch(`${baseUrl}/api/report-bug/${id}`)).status).toBe(404);
  });

  it('rejects a second socket create-room without abandoning the current table', async () => {
    const { host, peer, initial } = await twoPlayerRoom();
    const rejected = nextEvent(host, 'error');
    host.emit('create-room', { name: 'Host' });
    expect((await rejected).message).toMatch(/leave.*current room/i);
    const latest = nextEvent(host, 'game-updated');
    const owner = initial.currentPlayerId === host.id ? host : peer;
    owner.emit('draw-card');
    expect((await latest).match.round).toBe(initial.match.round);
  });

  it('issues private expiring voice credentials only to joined members and revokes them on leave or disconnect', async () => {
    const { host, peer, roomCode } = await voiceLobby();
    const url = `${baseUrl}/api/voice/ice`;
    for (const authorization of [undefined, `Bearer ${'0'.repeat(64)}`, 'Bearer malformed']) {
      const denied = await fetch(url, { headers: authorization ? { Authorization: authorization } : {} });
      expect(denied.status).toBe(401);
      expect(denied.headers.get('cache-control')).toBe('no-store');
      expect(await denied.json()).not.toHaveProperty('iceServers');
    }

    const rosterUpdate = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => roster.participants.some((p) => p.playerId === host.id));
    const hostVoice = await joinVoice(host);
    const roster = await rosterUpdate;
    expect(hostVoice.roomCode).toBe(roomCode);
    expect(hostVoice.token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(roster)).not.toContain(hostVoice.token);
    expect(roster.participants).toEqual([expect.objectContaining({ playerId: host.id, isMuted: true })]);

    const issued = await fetch(url, { headers: { Authorization: `Bearer ${hostVoice.token}` } });
    expect(issued.status).toBe(200);
    expect(issued.headers.get('cache-control')).toBe('no-store');
    const config = await issued.json();
    const relay = config.iceServers.find((server: { username?: string }) => server.username);
    expect(config.relayConfigured).toBe(true);
    expect(config.expiresAt).toBeGreaterThan(Date.now());
    expect(config.expiresAt).toBeLessThanOrEqual(Date.now() + 120_000);
    expect(relay.username).toBe(`${Math.floor(config.expiresAt / 1000)}:${host.id}`);
    expect(relay.credential).toBe(createHmac('sha1', turnSecret).update(relay.username).digest('base64'));
    expect(JSON.stringify(config)).not.toContain(turnSecret);

    const left = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => !roster.participants.some((p) => p.playerId === host.id));
    host.emit('voice-leave');
    await left;
    expect((await fetch(url, { headers: { Authorization: `Bearer ${hostVoice.token}` } })).status).toBe(401);

    const renewed = await joinVoice(host);
    expect(renewed.token).not.toBe(hostVoice.token);
    const disconnected = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => !roster.participants.some((p) => p.playerId === host.id));
    host.disconnect();
    await disconnected;
    expect((await fetch(url, { headers: { Authorization: `Bearer ${renewed.token}` } })).status).toBe(401);

    const peerVoice = await joinVoice(peer);
    const roomLeft = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => roster.participants.length === 0);
    peer.emit('leave-room');
    await roomLeft;
    expect((await fetch(url, { headers: { Authorization: `Bearer ${peerVoice.token}` } })).status).toBe(401);
  }, 10_000);

  it('relays signals only between joined same-room humans, excludes spectators, and enforces the voice cap', async () => {
    const { host, peer, roomCode } = await voiceLobby();
    const third = await connect();
    const thirdJoined = nextEvent(third, 'joined-successfully');
    third.emit('join-room', { code: roomCode, name: 'Third seated human' });
    expect((await thirdJoined).isSpectator).toBe(false);
    const spectator = await connect();
    const spectatorJoined = nextEvent(spectator, 'joined-successfully');
    spectator.emit('join-room', { code: roomCode, name: 'Voice spectator' });
    expect((await spectatorJoined).isSpectator).toBe(true);

    const relayed: Array<{ sourceId: string; signalData: { type: string } }> = [];
    peer.on('webrtc-signal', (signal) => relayed.push(signal));
    const request = { targetId: peer.id, signalData: { type: 'request-offer' } };

    // The following roster is an ordered barrier: the denied signal was sent
    // first on this socket and must have been processed before its voice join.
    const firstRoster = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => roster.participants.length === 1);
    host.emit('webrtc-signal', request);
    await joinVoice(host);
    await firstRoster;
    expect(relayed).toEqual([]);

    const unmuted = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => roster.participants.some((p) => p.playerId === host.id && !p.isMuted));
    host.emit('webrtc-signal', request); // Target has not joined voice yet.
    host.emit('voice-status', { isMuted: false });
    await unmuted;
    expect(relayed).toEqual([]);

    const fullRoster = nextEvent<VoiceRoster>(host, 'voice-roster', (roster) => roster.participants.length === 2);
    await joinVoice(peer);
    const full = await fullRoster;
    expect(full.maxParticipants).toBe(2);
    expect(full.participants.map((p) => p.playerId).sort()).toEqual([host.id, peer.id].sort());

    const spectatorDenied = nextEvent(spectator, 'voice-error');
    spectator.emit('voice-join');
    expect((await spectatorDenied).message).toMatch(/seated human/);
    const capacityDenied = nextEvent(third, 'voice-error');
    third.emit('voice-join');
    expect((await capacityDenied).message).toMatch(/full.*2/i);

    const outsider = await connect();
    const outsiderDenied = nextEvent(outsider, 'voice-error');
    outsider.emit('voice-join');
    expect((await outsiderDenied).message).toMatch(/table/);
    const outsiderCreated = nextEvent(outsider, 'joined-successfully');
    outsider.emit('create-room', { name: 'Other voice table' });
    await outsiderCreated;
    await joinVoice(outsider);

    spectator.emit('webrtc-signal', request);
    third.emit('webrtc-signal', request);
    outsider.emit('webrtc-signal', request); // Joined voice, in another room.
    const permitted = nextEvent(peer, 'webrtc-signal', (signal) => signal.sourceId === host.id);
    host.emit('webrtc-signal', request);
    expect(await permitted).toEqual({ sourceId: host.id, signalData: { type: 'request-offer' } });
    // Allow the other transports to deliver any wrongly forwarded signals.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(relayed).toEqual([{ sourceId: host.id, signalData: { type: 'request-offer' } }]);

    const departed = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => !roster.participants.some((p) => p.playerId === host.id));
    host.emit('voice-leave');
    await departed;
    const rejoined = nextEvent<VoiceRoster>(peer, 'voice-roster', (roster) => roster.participants.length === 2);
    host.emit('webrtc-signal', request); // Former participant is denied as well.
    await joinVoice(host);
    await rejoined;
    expect(relayed).toHaveLength(1);
  }, 10_000);

  it('hides a private outfit/activity over REST while preserving authenticated owner reads', async () => {
    const created = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Private player', outfit: 'private-outfit' }),
    });
    expect(created.status).toBe(201);
    const { profile, secret } = await created.json();
    const socket = await connect();
    const hello = nextEvent(socket, 'social:snapshot');
    socket.emit('social:hello', { profileId: profile.id, profileSecret: secret });
    await hello;
    const changed = nextEvent(socket, 'social:snapshot');
    socket.emit('social:privacy', {
      profileSecret: secret,
      privacy: { showOutfit: false, showMatchHistory: false, showOnlineStatus: false },
    });
    await changed;

    const url = `${baseUrl}/api/profiles/${profile.id}`;
    const publicResponse = await fetch(url);
    const publicView = (await publicResponse.json()).profile;
    expect(publicResponse.headers.get('cache-control')).toBe('no-store');
    expect(publicView.outfit).toBeNull();
    expect(publicView.lastSeenAt).toBe(0);
    expect(publicView.updatedAt).toBe(0);
    expect(publicView.recentMatches).toEqual([]);
    const forged = await fetch(url, { headers: { Authorization: 'Bearer forged' } });
    expect((await forged.json()).profile.outfit).toBeNull();
    const owner = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    const ownerView = (await owner.json()).profile;
    expect(ownerView.outfit).toBe('private-outfit');
    expect(ownerView.lastSeenAt).toBeGreaterThan(0);
    expect(ownerView).not.toHaveProperty('secret');
  });

  it('rejects an active-round restart through the actual socket handler', async () => {
    const { host, peer, initial } = await twoPlayerRoom();
    const rejected = nextEvent(host, 'error');
    host.emit('start-game', { fillWithBots: true });
    expect((await rejected).message).toMatch(/already|active|progress/i);
    const latest = nextEvent(host, 'game-updated');
    const owner = initial.currentPlayerId === host.id ? host : peer;
    owner.emit('draw-card');
    const snapshot = await latest;
    expect(snapshot.match.round).toBe(initial.match.round);
    expect(Object.keys(snapshot.handCounts)).toHaveLength(2);
  });

  it('predicts and assigns a spectator slot for a new arrival during an active round', async () => {
    const { host, roomCode } = await twoPlayerRoom();
    const response = await fetch(`${baseUrl}/api/rooms/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, name: 'Late arrival' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ isSpectator: true, waitingForNextRound: true, isFull: false });
    const visitor = await connect();
    const lobby = nextEvent(host, 'lobby-updated');
    const joined = nextEvent(visitor, 'joined-successfully');
    const snapshot = nextEvent(visitor, 'game-updated');
    visitor.emit('join-room', { code: roomCode, name: 'Late arrival' });
    expect(await joined).toMatchObject({ isSpectator: true, player: null });
    expect((await lobby).players).toHaveLength(2);
    expect(await snapshot).toMatchObject({ ownSeat: null, hand: [] });
  });

  it('does not broadcast a pending draw identity to the other player', async () => {
    // A fixed draw avoids randomly opening on +2, where drawing pays a penalty
    // and intentionally cannot create the play-or-pass decision tested here.
    const { socket: owner } = await joinSavedSeat('DRW001', 1);
    const { socket: opponent } = await joinSavedSeat('DRW001', 2);
    const isDraw = (snapshot: any) => snapshot.lastAction?.type === 'draw' && snapshot.lastAction.playerId === owner.id;
    const ownerUpdate = nextEvent(owner, 'game-updated', isDraw);
    const opponentUpdate = nextEvent(opponent, 'game-updated', isDraw);
    owner.emit('draw-card');
    const [ownView, otherView] = await Promise.all([ownerUpdate, opponentUpdate]);
    expect(ownView.drawnCardId).not.toBeNull();
    expect(otherView.drawnCardId).toBeNull();
    expect(JSON.stringify(otherView)).not.toContain(ownView.drawnCardId);
    expect(ownView.hand.some((card: { id: string }) => card.id === ownView.drawnCardId)).toBe(true);
  });

  it('cannot evade room creation limits by changing forwarded IP headers on direct requests', async () => {
    for (let request = 0; request < 21; request++) {
      const response = await fetch(`${baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${request + 1}` },
        body: '{}',
      });
      expect(response.status).toBe(request < 20 ? 201 : 429);
      await response.arrayBuffer();
    }
  });
});
