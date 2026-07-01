import { describe, it, expect } from 'vitest';
import {
  createRoomSchema,
  joinRoomSchema,
  sendReactionSchema,
  webrtcSignalSchema,
  voiceStatusSchema,
  playCardSchema,
  chooseColorSchema,
} from '../validation/socketSchemas';

/**
 * These schemas are the crash barrier at the socket boundary. The key property we
 * assert: malformed / missing / oversized payloads are REJECTED (safeParse.success
 * === false) rather than passed through to a handler that would throw and crash the
 * process. Well-formed payloads must pass and be trimmed/typed.
 */

describe('createRoomSchema', () => {
  it('accepts a valid name (trimmed)', () => {
    const r = createRoomSchema.safeParse({ name: '  Alice  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Alice');
  });

  it.each([
    ['missing payload', undefined],
    ['null payload', null],
    ['non-object', 'Alice'],
    ['missing name', {}],
    ['empty name', { name: '   ' }],
    ['non-string name', { name: 123 }],
    ['oversized name', { name: 'x'.repeat(100) }],
  ])('rejects %s', (_label, payload) => {
    expect(createRoomSchema.safeParse(payload).success).toBe(false);
  });
});

describe('joinRoomSchema', () => {
  it('accepts code + name with optional secret', () => {
    expect(joinRoomSchema.safeParse({ code: 'ABC123', name: 'Bob' }).success).toBe(true);
    expect(joinRoomSchema.safeParse({ code: 'ABC123', name: 'Bob', secret: 'tok' }).success).toBe(true);
  });

  it.each([
    ['missing code', { name: 'Bob' }],
    ['missing name', { code: 'ABC123' }],
    ['empty code', { code: '', name: 'Bob' }],
    ['oversized code', { code: 'x'.repeat(50), name: 'Bob' }],
    ['non-string secret', { code: 'ABC123', name: 'Bob', secret: 42 }],
    ['null', null],
  ])('rejects %s', (_label, payload) => {
    expect(joinRoomSchema.safeParse(payload).success).toBe(false);
  });
});

describe('sendReactionSchema', () => {
  it('accepts an emoji', () => {
    expect(sendReactionSchema.safeParse({ emoji: '🎉' }).success).toBe(true);
  });
  it.each([
    ['missing emoji', {}],
    ['empty emoji', { emoji: '' }],
    ['oversized emoji', { emoji: 'x'.repeat(100) }],
    ['non-string', { emoji: 5 }],
  ])('rejects %s', (_label, payload) => {
    expect(sendReactionSchema.safeParse(payload).success).toBe(false);
  });
});

describe('webrtcSignalSchema', () => {
  it('accepts a targetId with opaque signalData', () => {
    expect(webrtcSignalSchema.safeParse({ targetId: 'sock123', signalData: { type: 'offer' } }).success).toBe(true);
  });
  it('rejects a missing targetId', () => {
    expect(webrtcSignalSchema.safeParse({ signalData: {} }).success).toBe(false);
  });
});

describe('voiceStatusSchema', () => {
  it('accepts a boolean isMuted', () => {
    expect(voiceStatusSchema.safeParse({ isMuted: true }).success).toBe(true);
  });
  it.each([
    ['string isMuted', { isMuted: 'yes' }],
    ['missing', {}],
  ])('rejects %s', (_label, payload) => {
    expect(voiceStatusSchema.safeParse(payload).success).toBe(false);
  });
});

describe('playCardSchema', () => {
  it('accepts a cardId (playerId optional)', () => {
    expect(playCardSchema.safeParse({ cardId: 'red-5-abc' }).success).toBe(true);
    expect(playCardSchema.safeParse({ cardId: 'red-5-abc', playerId: 'p1' }).success).toBe(true);
  });
  it.each([
    ['missing cardId', {}],
    ['empty cardId', { cardId: '' }],
    ['non-string cardId', { cardId: 99 }],
    ['null', null],
  ])('rejects %s', (_label, payload) => {
    expect(playCardSchema.safeParse(payload).success).toBe(false);
  });
});

describe('chooseColorSchema', () => {
  it.each(['red', 'blue', 'green', 'yellow'])('accepts %s', (color) => {
    expect(chooseColorSchema.safeParse({ color }).success).toBe(true);
  });
  it.each([
    ['wild is not selectable', { color: 'wild' }],
    ['arbitrary string', { color: 'purple' }],
    ['missing', {}],
  ])('rejects %s', (_label, payload) => {
    expect(chooseColorSchema.safeParse(payload).success).toBe(false);
  });
});
