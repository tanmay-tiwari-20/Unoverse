import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';

const require = createRequire(import.meta.url);
const backendDir = fileURLToPath(new URL('../../', import.meta.url));
let server: ChildProcess | undefined;
let baseUrl: string;
const sockets: Socket[] = [];

function nextEvent<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 5_000);
    function receive(payload: T) {
      clearTimeout(timeout);
      resolve(payload);
    }
    socket.once(event, receive);
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
  return { host, peer, initial: await started };
}

beforeAll(async () => {
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
    cwd: backendDir,
    env: {
      ...process.env, PORT: String(port), NODE_ENV: 'development', STORE: 'memory',
      REDIS_URL: '', CORS_ORIGIN: '*', TRUST_PROXY_HOPS: '0', LOG_LEVEL: 'silent',
      CRAZYGAMES_AUTH_ENABLED: 'false', TS_NODE_PROJECT: path.join(backendDir, 'tsconfig.json'),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let startupErrors = '';
  server.stderr?.on('data', (chunk) => { startupErrors = (startupErrors + String(chunk)).slice(-4_000); });
  let spawnError: Error | undefined;
  server.once('error', (error) => { spawnError = error; });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Integration server exited: ${server.exitCode}\n${startupErrors}`);
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch { /* Wait for the server to bind. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Integration server did not become ready\n${startupErrors}`);
}, 30_000);

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise<void>((resolve) => server!.once('exit', () => resolve()));
  server.kill();
  await stopped;
}, 10_000);

describe('HTTP and Socket.IO boundaries', () => {
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

  it('does not broadcast a pending draw identity to the other player', async () => {
    const { host, peer, initial } = await twoPlayerRoom();
    const owner = initial.currentPlayerId === host.id ? host : peer;
    const opponent = owner === host ? peer : host;
    const ownerUpdate = nextEvent(owner, 'game-updated');
    const opponentUpdate = nextEvent(opponent, 'game-updated');
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
