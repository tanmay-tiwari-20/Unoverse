import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => path.join(frontend, relative);
function loader(overrides = new Map()) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (overrides.has(filename)) return overrides.get(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const nativeRequire = createRequire(filename);
    const require = (specifier) => {
      if (overrides.has(specifier)) return overrides.get(specifier);
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), specifier);
        const file = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find((p) => fs.existsSync(p));
        if (file) return load(file);
      }
      return nativeRequire(specifier);
    };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename,
    }).outputText;
    vm.compileFunction(code, ['require', 'module', 'exports'], { filename })(require, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const participant = (id) => ({ playerId: id, seatUid: `seat-${id}`, isMuted: true });
const table = () => ({ code: 'ABC123', players: [{ id: 'a', uid: 'seat-a' }, { id: 'b', uid: 'seat-b' }, { id: 'bot', uid: 'seat-bot', isBot: true }], spectators: [{ id: 'spectator', uid: 'seat-spectator' }] });

test('voice peer selection requires explicit membership and excludes spectators, bots and stale seats', () => {
  const { voicePeerIds } = loader()(source('src/lib/voice/membership.ts'));
  const voice = { participation: 'off', voiceRoomCode: 'ABC123', participants: ['a', 'b', 'bot', 'spectator'].map(participant) };
  assert.equal(voicePeerIds(table(), voice, 'a').size, 0);
  assert.equal(voicePeerIds(table(), { ...voice, participation: 'joining' }, 'a').size, 0);
  assert.deepEqual([...voicePeerIds(table(), { ...voice, participation: 'joined' }, 'a')], ['b']);
  assert.equal(voicePeerIds(table(), { ...voice, participation: 'joined', voiceRoomCode: 'OTHER' }, 'a').size, 0);
  assert.equal(voicePeerIds(table(), { ...voice, participation: 'joined', participants: [participant('b')] }, 'a').size, 0);
  assert.equal(voicePeerIds(table(), { ...voice, participation: 'joined', participants: [participant('a'), { ...participant('b'), seatUid: 'old-seat' }] }, 'a').size, 0);
});

function harness(t) {
  const effects = [], pcs = [], emissions = [], listeners = new Map(), restoreGlobals = [];
  const socket = {
    id: 'a', connected: true,
    on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler); },
    off(event, handler) { listeners.get(event)?.delete(handler); },
    emit(event, payload) { emissions.push({ event, payload }); },
    deliver(event, payload) { for (const handler of listeners.get(event) || []) handler(payload); },
  };
  const state = { socket, room: table(), addToast() {} };
  const actualVoice = loader()(source('src/store/useVoiceStore.ts')).useVoiceStore;
  const selectStore = (store) => Object.assign((selector) => selector(store.getState()), { getState: store.getState });
  const settings = { micVolume: 100, voiceVolume: 100, masterVolume: 100 };
  const overrides = new Map([
    ['react', { useRef: (current) => ({ current }), useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn) }],
    [source('src/store/useGameStore.ts'), { useGameStore: Object.assign((selector) => selector(state), { getState: () => state }) }],
    [source('src/store/useVoiceStore.ts'), { useVoiceStore: selectStore(actualVoice) }],
    [source('src/store/useSettingsStore.ts'), { useSettingsStore: Object.assign((selector) => selector(settings), { getState: () => settings }) }],
    [source('src/lib/voice/iceServers.ts'), { STUN_SERVERS: [{ urls: 'stun:example.test' }], getIceServers: async () => ({ iceServers: [{ urls: 'stun:example.test' }], expiresAt: Date.now() + 900_000, relayConfigured: false }) }],
    [source('src/utils/logger.ts'), { logger: { warn() {}, debug() {}, error() {} } }],
    [source('src/lib/platform/platformAdaptersState.ts'), { isPlatformAudioMuted: () => false, subscribeToPlatformAudioGate: () => () => {} }],
  ]);
  function patchGlobal(key, value) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  class Peer {
    constructor() { this.connectionState = 'new'; this.closed = false; this.sender = { replaceTrack: async () => {} }; pcs.push(this); }
    addTransceiver() { return { sender: this.sender }; }
    close() { this.closed = true; }
  }
  patchGlobal('RTCPeerConnection', Peer);
  patchGlobal('document', { addEventListener() {}, removeEventListener() {} });
  patchGlobal('window', {});
  patchGlobal('navigator', { mediaDevices: { getUserMedia: async () => { throw new Error('not configured'); } } });
  const { useVoiceChat } = loader(overrides)(source('src/hooks/useVoiceChat.ts'));
  // eslint-disable-next-line react-hooks/rules-of-hooks -- This harness supplies React's effect/ref runner and executes the real hook.
  const hook = useVoiceChat();
  const cleanups = effects.map((effect) => effect()).filter((fn) => typeof fn === 'function');
  t.after(() => {
    try { cleanups.forEach((cleanup) => cleanup()); }
    finally { restoreGlobals.reverse().forEach((restore) => restore()); }
  });
  async function join() {
    hook.toggleVoice();
    socket.deliver('voice-joined', { roomCode: 'ABC123', token: 'temporary-token' });
    socket.deliver('voice-roster', { roomCode: 'ABC123', maxParticipants: 4, participants: ['a', 'b'].map(participant) });
    await tick();
    assert.equal(actualVoice.getState().participation, 'joined');
  }
  return { hook, socket, voice: actualVoice, state, pcs, emissions, join };
}

test('an unjoined client creates no peers; explicit join creates only voice peers and leave closes them', async (t) => {
  const h = harness(t);
  h.socket.deliver('voice-roster', { roomCode: 'ABC123', maxParticipants: 4, participants: ['b'].map(participant) });
  assert.equal(h.pcs.length, 0);
  await h.join();
  assert.equal(h.pcs.length, 1);
  assert.equal(h.voice.getState().isMicEnabled, false); // Listening does not request hardware.
  h.hook.toggleVoice();
  assert.equal(h.voice.getState().participation, 'off');
  assert.equal(h.pcs[0].closed, true);
  assert.equal(h.emissions.at(-1).event, 'voice-leave');
});

test('delayed microphone permission is stopped when the player leaves voice', async (t) => {
  const h = harness(t);
  await h.join();
  let grant;
  navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve; });
  const pending = h.hook.toggleMic();
  h.hook.toggleVoice();
  let stopped = 0;
  grant({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(h.voice.getState().isMicEnabled, false);
  assert.equal(h.voice.getState().participation, 'off');
  assert.equal(h.emissions.some((e) => e.event === 'voice-status' && e.payload.isMuted === false), false);
});

test('disconnect releases active microphone tracks and requires explicit rejoin', async (t) => {
  const h = harness(t);
  await h.join();
  let rawStops = 0, outgoingStops = 0;
  const outgoing = { getTracks: () => [{ stop: () => outgoingStops++ }], getAudioTracks: () => [{}] };
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop: () => rawStops++ }] });
  window.AudioContext = class {
    state = 'running';
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createMediaStreamDestination() { return { stream: outgoing }; }
    close() { return Promise.resolve(); }
  };
  await h.hook.toggleMic();
  assert.equal(h.voice.getState().isMicEnabled, true);
  h.socket.connected = false;
  h.socket.deliver('disconnect');
  assert.equal(rawStops, 1);
  assert.equal(outgoingStops, 1);
  assert.equal(h.pcs[0].closed, true);
  assert.equal(h.voice.getState().participation, 'off');
  h.socket.connected = true;
  h.socket.id = 'new-a';
  h.socket.deliver('connect');
  assert.equal(h.pcs.length, 1);
});

test('ICE credentials use the active voice token and authorization failures do not silently rejoin', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const { getIceServers, STUN_SERVERS } = loader(new Map([
    [source('src/lib/config.ts'), { BACKEND_URL: 'https://backend.example' }],
    [source('src/utils/logger.ts'), { logger: { warn() {} } }],
  ]))(source('src/lib/voice/iceServers.ts'));
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://backend.example/api/voice/ice');
    assert.equal(options.headers.Authorization, 'Bearer active-token');
    assert.equal(options.cache, 'no-store');
    return { ok: true, status: 200, json: async () => ({ iceServers: STUN_SERVERS, expiresAt: Date.now() + 60_000, relayConfigured: false }) };
  };
  assert.equal((await getIceServers('active-token')).relayConfigured, false);
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(getIceServers('expired-token'), /membership expired/);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual((await getIceServers('active-token')).iceServers, STUN_SERVERS);
});
