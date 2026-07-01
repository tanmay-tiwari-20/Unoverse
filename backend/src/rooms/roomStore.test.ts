import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FileRoomStore, MemoryRoomStore, RoomStore } from './roomStore';
import { Room } from './roomManager';

function sampleRoom(code: string): Room {
  return {
    code,
    hostId: 'sock1',
    status: 'playing',
    players: [
      { id: 'sock1', name: 'Alice', seatNumber: 1, isHost: true, secret: 'sec-a' },
      { id: 'sock2', name: 'Bob', seatNumber: 2, isHost: false, secret: 'sec-b' },
    ],
    game: {
      deck: [{ id: 'green-3-x', color: 'green', value: '3' }],
      discardPile: [{ id: 'red-5-y', color: 'red', value: '5' }],
      hands: { sock1: [], sock2: [] },
      currentPlayerId: 'sock1',
      direction: 'clockwise',
      wildColor: null,
      status: 'playing',
      colorChooserId: null,
      winnerId: null,
      unoCalled: { sock1: false, sock2: false },
      drawStack: 0,
      pendingDrawType: null,
      drawnCardId: null,
    },
  };
}

describe('FileRoomStore', () => {
  let dir: string;
  let store: RoomStore;

  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `uno-store-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new FileRoomStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('saves and reloads a room verbatim (including game state and secrets)', async () => {
    const room = sampleRoom('ABC123');
    await store.save(room);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(room);
  });

  it('overwrites an existing snapshot on re-save', async () => {
    const room = sampleRoom('ABC123');
    await store.save(room);
    room.status = 'lobby';
    room.game = undefined;
    await store.save(room);
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].status).toBe('lobby');
    expect(loaded[0].game).toBeUndefined();
  });

  it('removes a snapshot', async () => {
    await store.save(sampleRoom('ABC123'));
    await store.save(sampleRoom('XYZ789'));
    await store.remove('ABC123');
    const loaded = await store.loadAll();
    expect(loaded.map((r) => r.code).sort()).toEqual(['XYZ789']);
  });

  it('loadAll returns empty for a fresh directory', async () => {
    expect(await store.loadAll()).toEqual([]);
  });

  it('ignores path-traversal characters in the room code', async () => {
    // Should not escape the store directory.
    await store.save(sampleRoom('../evil'));
    const loaded = await store.loadAll();
    expect(loaded).toHaveLength(1);
    const files = await fs.readdir(dir);
    expect(files.every((f) => !f.includes('..'))).toBe(true);
  });
});

describe('MemoryRoomStore', () => {
  it('persists nothing', async () => {
    const store = new MemoryRoomStore();
    await store.save(sampleRoom('ABC123'));
    expect(await store.loadAll()).toEqual([]);
  });
});
