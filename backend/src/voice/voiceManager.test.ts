import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { VoiceManager, resolveVoiceConfig, issueIceCredentials } from './voiceManager';

const human = (id: string) => ({ id, uid: `seat-${id}` });
const room = () => ({ code: 'ABC123', players: [human('a'), human('b'), human('c'), { ...human('bot'), isBot: true }], spectators: [human('spectator')] });
const config = { maxParticipants: 2, turnUrls: [], turnSecret: '', credentialTtlSeconds: 900 };

describe('explicit bounded voice membership', () => {
  it('excludes spectators and bots and requires both signaling endpoints to join', () => {
    const manager = new VoiceManager(config), table = room();
    expect(() => manager.join(table, 'spectator')).toThrow(/seated human/);
    expect(() => manager.join(table, 'bot')).toThrow(/seated human/);
    expect(manager.canSignal(table, 'a', 'b')).toBe(false);
    manager.join(table, 'a');
    expect(manager.canSignal(table, 'a', 'b')).toBe(false);
    manager.join(table, 'b');
    expect(manager.canSignal(table, 'a', 'b')).toBe(true);
    expect(manager.canSignal(table, 'a', 'a')).toBe(false);
    expect(() => manager.join(table, 'c')).toThrow(/full/);
    expect(manager.join(table, 'a').roster.participants).toHaveLength(2);
  });

  it('keeps muted members, revokes leave tokens and restores capacity', () => {
    const manager = new VoiceManager(config), table = room();
    const joined = manager.join(table, 'a');
    manager.join(table, 'b');
    expect(manager.setMuted(table, 'a', false)).toBe(true);
    expect(manager.setMuted(table, 'a', true)).toBe(true);
    expect(manager.roster(table.code).participants).toHaveLength(2);
    expect(JSON.stringify(manager.roster(table.code))).not.toContain(joined.token);
    expect(manager.authorizeToken(joined.token, () => table)?.playerId).toBe('a');
    manager.leave(table.code, 'a');
    expect(manager.authorizeToken(joined.token, () => table)).toBeNull();
    expect(manager.canSignal(table, 'a', 'b')).toBe(false);
    expect(manager.setMuted(table, 'a', false)).toBe(false);
    expect(manager.join(table, 'c').roster.participants).toHaveLength(2);
  });

  it('requires a new join after socket identity or seat changes', () => {
    const manager = new VoiceManager(config), table = room();
    const old = manager.join(table, 'a');
    table.players[0] = { id: 'new-a', uid: 'seat-a' };
    expect(manager.authorizeToken(old.token, () => table)).toBeNull();
    expect(manager.roster(table.code).participants).toEqual([]);
    const next = manager.join(table, 'new-a');
    expect(next.token).not.toBe(old.token);
    table.players[0].uid = 'different-seat';
    expect(manager.authorizeToken(next.token, () => table)).toBeNull();
  });

  it('revokes credentials when the room disappears', () => {
    const manager = new VoiceManager(config);
    const { token } = manager.join(room(), 'a');
    expect(manager.authorizeToken(token, () => undefined)).toBeNull();
    expect(manager.roster('ABC123').participants).toEqual([]);
  });
});

describe('private short-lived coturn credentials', () => {
  it('defaults to STUN without permanent relay credentials', () => {
    const result = issueIceCredentials(resolveVoiceConfig({}), 'a', 1_000_000);
    expect(result.relayConfigured).toBe(false);
    expect(result.iceServers).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/credential|openrelay|turn:/);
  });

  it('uses coturn HMAC format with a bounded expiry and omits the shared secret', () => {
    const configured = resolveVoiceConfig({ TURN_URLS: 'turn:relay.example:3478, turns:relay.example:443', TURN_SHARED_SECRET: 'server-only-secret', TURN_CREDENTIAL_TTL_SECONDS: '120' });
    const result = issueIceCredentials(configured, 'socket-a', 1_000_500);
    expect(result.expiresAt).toBe(1_120_000);
    const relay = result.iceServers[1] as { username: string; credential: string };
    expect(relay.username).toBe('1120:socket-a');
    expect(relay.credential).toBe(createHmac('sha1', configured.turnSecret).update(relay.username).digest('base64'));
    expect(JSON.stringify(result)).not.toContain(configured.turnSecret);
  });

  it('fails on partial or unsafe relay configuration and oversized participation', () => {
    for (const env of [{ TURN_URLS: 'turn:relay.example' }, { TURN_SHARED_SECRET: 'secret' }, { TURN_URLS: 'https://relay.example', TURN_SHARED_SECRET: 'secret' }, { VOICE_MAX_PARTICIPANTS: '20' }, { TURN_CREDENTIAL_TTL_SECONDS: '86400' }]) {
      expect(() => resolveVoiceConfig(env)).toThrow();
    }
  });
});
