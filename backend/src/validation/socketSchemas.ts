import { z } from 'zod';

/**
 * Zod schemas for every socket event that carries a client-supplied payload.
 *
 * These run at the socket boundary before any handler logic. Without them, a
 * handler that destructures its payload (e.g. `({ name }) => name.trim()`) throws
 * synchronously on a malformed/missing payload, which — inside a socket.io
 * listener — becomes an uncaught exception that crashes the whole Node process.
 * Validating first turns "malformed input" into a clean per-client error instead
 * of a server-wide DoS.
 *
 * Bounds (name/code/emoji length, etc.) also cap trivially abusive oversized
 * payloads. Unknown keys are stripped via .strip() default; we keep signalData
 * loose since WebRTC SDP/ICE blobs are provider-shaped and only relayed, never
 * interpreted by us.
 */

// Reusable primitives
const nonEmptyName = z.string().trim().min(1).max(40);
const roomCode = z.string().trim().min(1).max(12);
const cardId = z.string().min(1).max(120);
const secret = z.string().min(1).max(200);

export const cardColor = z.enum(['red', 'blue', 'green', 'yellow']);

export const createRoomSchema = z.object({
  name: nonEmptyName,
});

export const joinRoomSchema = z.object({
  code: roomCode,
  name: nonEmptyName,
  secret: secret.optional(),
});

export const sendReactionSchema = z.object({
  // Emojis are short; cap generously to allow multi-codepoint sequences.
  emoji: z.string().min(1).max(32),
});

export const webrtcSignalSchema = z.object({
  targetId: z.string().min(1).max(100),
  // SDP/ICE payloads are opaque to us — relayed verbatim. Just ensure it exists.
  signalData: z.unknown(),
});

export const voiceStatusSchema = z.object({
  isMuted: z.boolean(),
});

export const playCardSchema = z.object({
  cardId,
  // playerId is informational in the handler (socket.id is authoritative); accept
  // but don't require correctness.
  playerId: z.string().max(100).optional(),
});

export const chooseColorSchema = z.object({
  color: cardColor,
});

export type CreateRoomPayload = z.infer<typeof createRoomSchema>;
export type JoinRoomPayload = z.infer<typeof joinRoomSchema>;
export type SendReactionPayload = z.infer<typeof sendReactionSchema>;
export type WebrtcSignalPayload = z.infer<typeof webrtcSignalSchema>;
export type VoiceStatusPayload = z.infer<typeof voiceStatusSchema>;
export type PlayCardPayload = z.infer<typeof playCardSchema>;
export type ChooseColorPayload = z.infer<typeof chooseColorSchema>;
