import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const backend = path.resolve(frontend, '../backend');
const backendRequire = createRequire(path.join(backend, 'package.json'));
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
backendRequire('ts-node/register/transpile-only');
const { makeState, card, players2 } = backendRequire('./src/test/helpers.ts');
let browser, frontendProcess, backendProcess, dataDirectory, frontendUrl, backendUrl;
const contexts = [];
const diagnostics = new Map();

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function startProcess(command, cwd, env) {
  const inheritedEnv = { ...process.env };
  // Deployment-specific limits and relay settings must not alter fixtures.
  for (const key of Object.keys(inheritedEnv)) {
    if (/^(?:RL_|CHAT_|ROOM_|TURN_|VOICE_|CRAZYGAMES_|PROFILE_|REPORT_|REDIS_|TRUST_PROXY_|CORS_)/.test(key)) delete inheritedEnv[key];
  }
  const preload = command[0] === '-r' ? command.slice(0, 2) : [];
  const program = command.slice(preload.length);
  const child = spawn(process.execPath, [...preload, path.join(frontend, 'tests/e2e/child.mjs'), ...program], {
    cwd, env: { ...inheritedEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true, detached: process.platform !== 'win32',
  });
  diagnostics.set(child, '');
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (data) => diagnostics.set(child, (diagnostics.get(child) + data).slice(-6000)));
  }
  child.on('error', (error) => diagnostics.set(child, String(error)));
  return child;
}

const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;

async function waitForServer(url, child, { timeoutMs = 90_000, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (hasExited(child)) throw new Error(diagnostics.get(child));
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(1000)]) : AbortSignal.timeout(1000);
    try { if ((await fetch(url, { signal: requestSignal })).ok) return; } catch { /* Starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.error(`Server did not become ready at ${url}: ${diagnostics.get(child)}`);
  throw new Error(`Server did not become ready: ${diagnostics.get(child)}`);
}

async function stopProcess(child) {
  if (!child || hasExited(child)) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  // Cooperative shutdown uses each child's own signal handler and retained
  // worker handles; opening another process by PID is restricted on Windows.
  if (child.connected) child.send('shutdown', () => {});
  else child.kill();
  await Promise.race([exited, new Promise((resolve) => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
  if (!hasExited(child)) {
    child.kill('SIGKILL');
    await Promise.race([exited, new Promise((resolve) => { const timer = setTimeout(resolve, 3000); timer.unref(); })]);
  }
  if (!hasExited(child)) throw new Error(`Fixture process did not exit: ${diagnostics.get(child)}`);
  if (child.connected) child.disconnect();
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

async function removeFixtureDirectory(directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('unoverse-browser-')) throw new Error('Unexpected browser fixture directory');
  await fs.rm(resolved, { recursive: true, force: true });
}

before(async (context) => {
  const deadline = Date.now() + 110_000;
  const frontendPort = await freePort();
  let backendPort = await freePort();
  while (backendPort === frontendPort) backendPort = await freePort();
  frontendUrl = `http://127.0.0.1:${frontendPort}`;
  backendUrl = `http://127.0.0.1:${backendPort}`;
  frontendProcess = startProcess([path.join(frontend, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(frontendPort)], frontend, {
    NODE_ENV: 'development', NEXT_PUBLIC_BACKEND_URL: backendUrl, NEXT_PUBLIC_PLATFORM: 'web', NEXT_TELEMETRY_DISABLED: '1',
  });
  await waitForServer(frontendUrl, frontendProcess, { timeoutMs: deadline - Date.now(), signal: context.signal });
  // Compile the lobby before navigation assertions start. A cold development
  // compilation can exceed an interaction timeout on slower machines.
  await waitForServer(`${frontendUrl}/lobby/E2E001?name=Alice`, frontendProcess, { timeoutMs: deadline - Date.now(), signal: context.signal });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
}, { timeout: 120_000 });

beforeEach(async (context) => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'unoverse-browser-'));
  const roomDirectory = path.join(dataDirectory, 'rooms');
  await fs.mkdir(roomDirectory);
  const first = context.name.includes('Wild') ? card('wild', 'wild') : card('red', '7');
  const aliceHand = context.name.includes('large phone hand')
    ? [first, ...Array.from({ length: 38 }, () => card('blue', '8')), card('red', '9')]
    : [first, card('blue', '8')];
  const game = makeState({
    hands: { p1: aliceHand, p2: [card('red', '9'), card('yellow', '2')] },
    rules: { allowLateUno: true, unoPenaltyCards: 2, turnTimer: false, stackDrawTwoOnWildFour: true },
  });
  await fs.writeFile(path.join(roomDirectory, 'E2E001.json'), JSON.stringify({
    code: 'E2E001', hostId: 'p1', players: players2(), game, houseRules: game.rules, status: 'playing', arena: 'classic',
  }));
  await startBackend(context.signal);
}, { timeout: 30_000 });

async function startBackend(signal) {
  backendProcess = startProcess(['-r', backendRequire.resolve('ts-node/register/transpile-only'), path.join(backend, 'src/index.ts')], dataDirectory, {
    HOST: '127.0.0.1', PORT: new URL(backendUrl).port, NODE_ENV: 'development', STORE: 'file', DATA_DIR: path.join(dataDirectory, 'rooms'),
    PROFILE_DIR: path.join(dataDirectory, 'profiles'), REPORT_DIR: path.join(dataDirectory, 'reports'),
    REDIS_URL: '', CORS_ORIGIN: '*', TRUST_PROXY_HOPS: '0', LOG_LEVEL: 'silent', CRAZYGAMES_AUTH_ENABLED: 'false',
  });
  await waitForServer(`${backendUrl}/health`, backendProcess, { timeoutMs: 20_000, signal });
}

afterEach(async (context) => {
  try {
    if (context.error) {
      console.error(context.error);
      await fs.mkdir(path.join(frontend, 'test-results'), { recursive: true });
      for (const [index, browserContext] of contexts.entries()) {
        const page = browserContext.pages()[0];
        if (page) await page.screenshot({ path: path.join(frontend, 'test-results', `failure-${index}.png`), fullPage: true, timeout: 3000 }).catch(() => {});
      }
    }
    for (const context of contexts.splice(0)) await context.close();
  } finally {
    await stopProcess(backendProcess);
    if (dataDirectory) await removeFixtureDirectory(dataDirectory);
  }
}, { timeout: 30_000 });
after(async () => {
  try { await browser?.close(); } finally { await stopProcess(frontendProcess); }
}, { timeout: 15_000 });

async function player(name, options = {}) {
  const profileResponse = await fetch(`${backendUrl}/api/profiles`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name }),
  });
  assert.equal(profileResponse.status, 201);
  const { profile, secret } = await profileResponse.json();
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 800 },
    hasTouch: options.hasTouch ?? false,
    isMobile: options.hasTouch ?? false,
    reducedMotion: 'reduce',
  });
  contexts.push(context);
  await context.addInitScript(({ name, id, secret }) => {
    localStorage.setItem('unoverse:profile', JSON.stringify({ state: { profileId: id, profileSecret: secret, displayName: name }, version: 0 }));
    sessionStorage.setItem(`unoverse:secret:E2E001:${name.toLowerCase()}`, name === 'Alice' ? 's1' : 's2');
  }, { name, id: profile.id, secret });
  if (options.noWebGL) await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return String(type).startsWith('webgl') ? null : original.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return { context, page };
}

async function joinFromHome(page) {
  await page.goto(frontendUrl);
  await page.getByRole('textbox', { name: 'Room code to join' }).fill('E2E001');
  await page.getByRole('button', { name: 'Join Room', exact: true }).click();
  await page.waitForURL(/\/lobby\/E2E001/, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Draw Card/ }).waitFor();
}

test('two browser players follow server turns, late UNO and actual penalty notices', { timeout: 90_000 }, async () => {
  const alice = await player('Alice');
  const bob = await player('Bob');
  await joinFromHome(alice.page);
  await joinFromHome(bob.page);
  await alice.page.getByRole('button', { name: 'Play Red 7', exact: true }).click();
  await alice.page.getByRole('button', { name: 'CALL UNO NOW!', exact: true }).waitFor();
  const forbidden = bob.page.getByRole('button', { name: /Yellow 2 \(not playable\)/ });
  assert.equal(await forbidden.getAttribute('aria-disabled'), 'true');
  await bob.page.getByRole('button', { name: 'Play Red 9', exact: true }).click();
  await alice.page.getByText('You forgot to call UNO! +2 penalty cards', { exact: true }).waitFor();
  assert.equal(await alice.page.getByRole('button', { name: /Green 3/ }).count(), 2);
});

test('a Wild color decision and late UNO survive a browser reload', { timeout: 90_000 }, async () => {
  const alice = await player('Alice');
  const bob = await player('Bob');
  await joinFromHome(alice.page);
  await joinFromHome(bob.page);
  await alice.page.getByRole('button', { name: 'Play Wild', exact: true }).click();
  await alice.page.getByRole('dialog', { name: 'Choose Color' }).waitFor();
  await alice.page.keyboard.press('Escape');
  assert.equal(await alice.page.getByRole('dialog', { name: 'Choose Color' }).isVisible(), true);
  await alice.page.reload();
  await alice.page.getByRole('dialog', { name: 'Choose Color' }).waitFor();
  await alice.page.getByRole('button', { name: 'Red', exact: true }).click();
  await alice.page.getByRole('button', { name: 'CALL UNO NOW!', exact: true }).click();
  await bob.page.getByRole('button', { name: 'Play Red 9', exact: true }).click();
  await alice.page.getByRole('button', { name: /Blue 8/ }).waitFor();
  assert.equal(await alice.page.getByRole('button', { name: /Green 3/ }).count(), 0);
});

test('gameplay controls work when WebGL is unavailable', { timeout: 90_000 }, async () => {
  const alice = await player('Alice', { noWebGL: true });
  const bob = await player('Bob');
  await joinFromHome(alice.page);
  await joinFromHome(bob.page);
  await alice.page.getByRole('button', { name: 'Play Red 7', exact: true }).click();
  await bob.page.getByRole('button', { name: 'Play Red 9', exact: true }).waitFor();
  assert.equal(await alice.page.getByRole('button', { name: 'Draw Card', exact: true }).isVisible(), true);
});

test('a large phone hand scrolls to both edge cards without playing during a swipe', { timeout: 90_000 }, async () => {
  const alice = await player('Alice', { viewport: { width: 360, height: 780 }, hasTouch: true, noWebGL: true });
  const bob = await player('Bob', { noWebGL: true });
  await joinFromHome(alice.page);
  await joinFromHome(bob.page);
  await alice.page.getByRole('button', { name: 'Play in Portrait', exact: true }).click();
  const hand = alice.page.getByRole('region', { name: 'Your hand', exact: true });
  const strip = hand.locator('[data-hand-scroll="true"]');
  await strip.waitFor();
  assert.equal(await hand.locator('[data-card-id]').count(), 40);
  const initial = await strip.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft,
  }));
  assert.ok(initial.left >= 0 && initial.right <= 360, 'the scroll viewport fits on the phone');
  assert.ok(initial.scrollWidth > initial.width, 'large hands have a scrollable range');
  assert.equal(initial.scrollLeft, 0, 'the first card starts within reach');

  const touch = await alice.context.newCDPSession(alice.page);
  const settleHand = () => strip.evaluate((element) => new Promise((resolve) => {
    let previous = element.scrollLeft;
    let stableFrames = 0;
    const frame = () => {
      const current = element.scrollLeft;
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 3) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  const swipe = async (direction) => {
    await settleHand();
    const bounds = await strip.boundingBox();
    const from = direction === 'left' ? bounds.x + bounds.width - 35 : bounds.x + 35;
    const to = direction === 'left' ? bounds.x + 35 : bounds.x + bounds.width - 35;
    const y = bounds.y + bounds.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
    for (let step = 1; step <= 8; step++) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * step / 8, y }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settleHand();
  };
  // Native touch input must move the strip; setting scrollLeft here would hide
  // pointer-event or touch-action regressions in the actual hand component.
  for (let swipeCount = 0; swipeCount < 24; swipeCount++) {
    if (await strip.evaluate((element) => element.scrollLeft + element.clientWidth >= element.scrollWidth - 1)) break;
    await swipe('left');
  }
  await alice.page.waitForFunction(() => {
    const element = document.querySelector('[data-hand-scroll="true"]');
    return element && element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
  });
  await swipe('left');
  assert.equal(await hand.locator('[data-card-id]').count(), 40, 'swipes must not play any card');
  const last = hand.getByRole('button', { name: 'Play Red 9', exact: true });
  const lastBounds = await last.boundingBox();
  assert.ok(lastBounds.x >= initial.left && lastBounds.x + lastBounds.width <= initial.right, 'the final card is fully visible');
  await last.tap();
  await bob.page.getByRole('button', { name: 'Play Red 9', exact: true }).waitFor();
  await alice.page.waitForFunction(() => document.querySelectorAll('[aria-label="Your hand"] [data-card-id]').length === 39);
  assert.equal(await hand.locator('[data-card-id]').count(), 39, 'the edge card can be played by touch');

  for (let swipeCount = 0; swipeCount < 24; swipeCount++) {
    if (await strip.evaluate((element) => element.scrollLeft <= 1)) break;
    await swipe('right');
  }
  await alice.page.waitForFunction(() => document.querySelector('[data-hand-scroll="true"]')?.scrollLeft <= 1);
  await swipe('right');
  assert.match(alice.page.url(), /\/lobby\/E2E001/, 'swiping past a hand edge must not navigate browser history');
  const firstBounds = await hand.getByRole('button', { name: 'Red 7', exact: true }).boundingBox();
  assert.ok(firstBounds.x >= initial.left && firstBounds.x + firstBounds.width <= initial.right, 'the first card remains reachable after scrolling back');
  await touch.detach();
});

test('blocked browser storage still permits creating a guest profile', { timeout: 90_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  contexts.push(context);
  await context.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(frontendUrl);
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('StorageTest');
  await page.getByRole('button', { name: "Let's Play!", exact: true }).click();
  await page.getByRole('button', { name: 'Play Now', exact: true }).waitFor();
});

test('browser Back releases the room seat instead of retaining ghost membership', { timeout: 90_000 }, async () => {
  const alice = await player('Alice');
  const bob = await player('Bob');
  await joinFromHome(alice.page);
  await joinFromHome(bob.page);
  await alice.page.goBack();
  await alice.page.getByRole('textbox', { name: 'Room code to join' }).waitFor();
  const response = await fetch(`${backendUrl}/api/rooms/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'E2E001', name: 'Observer' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).playerCount, 1);
});

test('reconnecting after a room expires replaces the old table with Return Home', { timeout: 90_000 }, async (context) => {
  const alice = await player('Alice', { noWebGL: true });
  const bob = await player('Bob', { noWebGL: true });
  await joinFromHome(alice.page);
  await joinFromHome(bob.page);
  await stopProcess(backendProcess);
  await fs.unlink(path.join(dataDirectory, 'rooms', 'E2E001.json'));
  await startBackend(context.signal);
  await alice.page.getByRole('heading', { name: 'Room Unavailable', exact: true }).waitFor();
  assert.equal(await alice.page.getByRole('region', { name: 'Your hand', exact: true }).count(), 0);
  assert.equal(await alice.page.getByRole('button', { name: 'Draw Card', exact: true }).count(), 0);
  await alice.page.getByRole('button', { name: 'Return Home', exact: true }).click();
  await alice.page.waitForURL(`${frontendUrl}/`);
  await alice.page.getByRole('textbox', { name: 'Room code to join' }).waitFor();
});

test('bug reporting retains failed submissions and acknowledges a real saved report', { timeout: 90_000 }, async () => {
  const alice = await player('Alice');
  await joinFromHome(alice.page);
  await alice.page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await alice.page.getByRole('button', { name: 'More', exact: true }).click();
  await alice.page.getByRole('button', { name: /Report a Bug/ }).click();
  const message = 'The card control stopped responding after a draw.';
  await alice.page.getByRole('textbox', { name: /What went wrong/ }).fill(message);
  await alice.context.route('**/api/report-bug', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Report could not be saved' }) }));
  await alice.page.getByRole('button', { name: 'Submit', exact: true }).click();
  await alice.page.getByText('Report could not be saved', { exact: true }).waitFor();
  assert.equal(await alice.page.getByRole('textbox', { name: /What went wrong/ }).inputValue(), message);
  await alice.context.unroute('**/api/report-bug');
  await alice.page.getByRole('button', { name: 'Submit', exact: true }).click();
  await alice.page.getByText(/Report received\. Reference:/).waitFor();
  const reports = await fs.readdir(path.join(dataDirectory, 'reports'));
  assert.equal(reports.length, 1);
  const saved = JSON.parse(await fs.readFile(path.join(dataDirectory, 'reports', reports[0]), 'utf8'));
  assert.equal(saved.message, message);
  assert.equal(saved.roomCode, 'E2E001');
});
