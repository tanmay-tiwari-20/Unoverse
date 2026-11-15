import { describe, expect, it } from 'vitest';
import { httpJoinRoomSchema, createProfileSchema, editProfileSchema, bugReportSchema, httpCreateRoomSchema } from './httpSchemas';

describe('HTTP payload boundaries', () => {
  it.each([null, [], 'room', 42, { code: 42, name: 'Player' }, { code: 'ABC123', name: {} },
    { code: 'ABC123', name: 'Player', profileId: '123' }])('rejects malformed joins without reaching room logic: %j', (body) => {
    expect(httpJoinRoomSchema.safeParse(body).success).toBe(false);
  });
  it('normalizes room codes and strips untrusted state and credentials', () => {
    expect(httpJoinRoomSchema.parse({ code: ' abc123 ', name: ' Player ', isHost: true })).toEqual({ code: 'ABC123', name: 'Player' });
    expect(createProfileSchema.parse({ displayName: 'Name', stats: { matchesWon: 999 } })).toEqual({ displayName: 'Name' });
    expect(bugReportSchema.parse({ message: '  A valid issue description  ', secret: 'private', roomCode: 'abc123' }))
      .toEqual({ message: 'A valid issue description', roomCode: 'ABC123' });
  });
  it('rejects invisible names, wrong cosmetic types and invalid report lengths', () => {
    expect(createProfileSchema.safeParse({ displayName: '\u200b\u202e' }).success).toBe(false);
    expect(editProfileSchema.safeParse({ secret: 'valid', outfit: {} }).success).toBe(false);
    expect(bugReportSchema.safeParse({ message: 'short' }).success).toBe(false);
    expect(bugReportSchema.safeParse({ message: 'a'.repeat(4001) }).success).toBe(false);
    expect(httpCreateRoomSchema.safeParse({ visibility: 'invalid' }).success).toBe(false);
  });
});
