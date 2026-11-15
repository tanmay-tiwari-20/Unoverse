import { randomBytes, createHmac } from 'crypto';

interface VoiceRoom {
  code: string;
  players: Array<{ id: string; uid: string; isBot?: boolean }>;
}

export interface VoiceParticipant {
  playerId: string;
  seatUid: string;
  isMuted: boolean;
}

export interface VoiceRoster {
  roomCode: string;
  maxParticipants: number;
  participants: VoiceParticipant[];
}

export interface VoiceConfig {
  maxParticipants: number;
  turnUrls: string[];
  turnSecret: string;
  credentialTtlSeconds: number;
}

function integer(raw: string | undefined, fallback: number, min: number, max: number, name: string) {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return n;
}

export function resolveVoiceConfig(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  const turnUrls = (env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  const turnSecret = (env.TURN_SHARED_SECRET || '').trim();
  if (Boolean(turnUrls.length) !== Boolean(turnSecret)) throw new Error('TURN_URLS and TURN_SHARED_SECRET must both be configured');
  if (turnUrls.some((u) => !/^turns?:[^\s]+$/i.test(u))) throw new Error('TURN_URLS must contain turn: or turns: URLs');
  return {
    maxParticipants: integer(env.VOICE_MAX_PARTICIPANTS, 4, 2, 6, 'VOICE_MAX_PARTICIPANTS'),
    turnUrls,
    turnSecret,
    credentialTtlSeconds: integer(env.TURN_CREDENTIAL_TTL_SECONDS, 900, 60, 3600, 'TURN_CREDENTIAL_TTL_SECONDS'),
  };
}

export const STUN_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/** coturn's TURN REST API format; the shared secret never leaves the backend. */
export function issueIceCredentials(config: VoiceConfig, playerId: string, nowMs = Date.now()) {
  const expiresAt = (Math.floor(nowMs / 1000) + config.credentialTtlSeconds) * 1000;
  if (!config.turnUrls.length) return { iceServers: STUN_SERVERS, expiresAt, relayConfigured: false };
  const username = `${Math.floor(expiresAt / 1000)}:${playerId}`;
  const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
  return {
    iceServers: [...STUN_SERVERS, { urls: config.turnUrls, username, credential }],
    expiresAt,
    relayConfigured: true,
  };
}

/** Explicit, ephemeral voice membership. Reconnects must join again. */
export class VoiceManager {
  private rooms = new Map<string, Map<string, VoiceParticipant & { token: string }>>();
  private tokens = new Map<string, { roomCode: string; playerId: string }>();

  constructor(readonly config: VoiceConfig) {}

  join(room: VoiceRoom, playerId: string): { token: string; roster: VoiceRoster } {
    const seat = room.players.find((p) => p.id === playerId && !p.isBot);
    if (!seat) throw new Error('Voice is available to seated human players only.');
    this.prune(room);
    let participants = this.rooms.get(room.code);
    const existing = participants?.get(playerId);
    if (existing) return { token: existing.token, roster: this.roster(room.code) };
    if ((participants?.size || 0) >= this.config.maxParticipants) throw new Error(`Voice chat is full (${this.config.maxParticipants} players).`);
    if (!participants) this.rooms.set(room.code, participants = new Map());
    const token = randomBytes(32).toString('hex');
    participants.set(playerId, { playerId, seatUid: seat.uid, isMuted: true, token });
    this.tokens.set(token, { roomCode: room.code, playerId });
    return { token, roster: this.roster(room.code) };
  }

  leave(roomCode: string, playerId: string): boolean {
    const participants = this.rooms.get(roomCode);
    const member = participants?.get(playerId);
    if (!member) return false;
    this.tokens.delete(member.token);
    participants!.delete(playerId);
    if (!participants!.size) this.rooms.delete(roomCode);
    return true;
  }

  prune(room: VoiceRoom): void {
    const seats = new Map(room.players.filter((p) => !p.isBot).map((p) => [p.id, p.uid]));
    for (const p of this.rooms.get(room.code)?.values() || []) {
      if (seats.get(p.playerId) !== p.seatUid) this.leave(room.code, p.playerId);
    }
  }

  roster(roomCode: string): VoiceRoster {
    return {
      roomCode,
      maxParticipants: this.config.maxParticipants,
      participants: [...(this.rooms.get(roomCode)?.values() || [])].map(({ playerId, seatUid, isMuted }) => ({ playerId, seatUid, isMuted })),
    };
  }

  canSignal(room: VoiceRoom, source: string, target: string): boolean {
    this.prune(room);
    const members = this.rooms.get(room.code);
    return source !== target && !!members?.has(source) && !!members.has(target);
  }

  setMuted(room: VoiceRoom, playerId: string, isMuted: boolean): boolean {
    this.prune(room);
    const member = this.rooms.get(room.code)?.get(playerId);
    if (!member) return false;
    member.isMuted = isMuted;
    return true;
  }

  authorizeToken(token: string, getRoom: (code: string) => VoiceRoom | undefined | null) {
    const member = this.tokens.get(token);
    if (!member) return null;
    const room = getRoom(member.roomCode);
    if (!room) { this.leave(member.roomCode, member.playerId); return null; }
    this.prune(room);
    return this.tokens.has(token) ? member : null;
  }
}
