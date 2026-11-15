import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const filename = new URL('../src/lib/roomMembership.ts', import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const loadedModule = { exports: {} };
vm.compileFunction(compiled, ['exports', 'setTimeout', 'clearTimeout'])(loadedModule.exports, setTimeout, clearTimeout);
const { createRoomMembershipLifecycle } = loadedModule.exports;

function harness() {
  let nextId = 0;
  const timers = new Map();
  const lifecycle = createRoomMembershipLifecycle(
    (callback) => { const id = ++nextId; timers.set(id, callback); return id; },
    (id) => timers.delete(id),
  );
  return {
    lifecycle,
    flush() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
  };
}

test('effect replay keeps the seat, while real route unmount leaves once', () => {
  const { lifecycle, flush } = harness();
  const events = [];
  const firstRelease = lifecycle.acquire('ABC:Alice', () => events.push('join'), () => events.push('leave'));
  firstRelease();
  const replayRelease = lifecycle.acquire('ABC:Alice', () => events.push('join'), () => events.push('leave'));
  flush();
  assert.deepEqual(events, ['join', 'join']);
  replayRelease();
  replayRelease();
  flush();
  assert.deepEqual(events, ['join', 'join', 'leave']);
});

test('room switches leave before joining, and stale cleanup cannot leave the destination', () => {
  const { lifecycle, flush } = harness();
  const events = [];
  const oldRelease = lifecycle.acquire('ABC:Alice', () => events.push('join ABC'), () => events.push('leave ABC'));
  oldRelease();
  const newRelease = lifecycle.acquire('XYZ:Alice', () => events.push('join XYZ'), () => events.push('leave XYZ'));
  oldRelease();
  flush();
  assert.deepEqual(events, ['join ABC', 'leave ABC', 'join XYZ']);
  newRelease();
  flush();
  assert.deepEqual(events, ['join ABC', 'leave ABC', 'join XYZ', 'leave XYZ']);
});

test('explicit exit invalidates scheduled cleanup before a new room can be created', () => {
  const { lifecycle, flush } = harness();
  let leaves = 0;
  const release = lifecycle.acquire('ABC:Alice', () => {}, () => { leaves++; });
  release();
  lifecycle.reset();
  release();
  flush();
  assert.equal(leaves, 0);
  lifecycle.acquire('XYZ:Alice', () => {}, () => { leaves++; });
  assert.equal(leaves, 0);
});
