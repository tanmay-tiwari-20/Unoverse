import { z } from 'zod';
import { WEBRTC_MAX_SIGNAL_BYTES } from '../config/serverConfig';

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
// Persistent-profile identity presented on create/join. Both are opaque UUIDs;
// the server verifies profileSecret against the stored profile before trusting
// profileId. Optional everywhere — a client without a profile joins as before.
const profileId = z.string().min(1).max(100);
const profileSecret = z.string().min(1).max(200);

export const cardColor = z.enum(['red', 'blue', 'green', 'yellow']);

// Themed 3D arena selection. Concrete ids plus `random` (resolved server-side at
// creation). Kept in sync with `rooms/arenas.ts` / the frontend arena registry.
export const arenaSelection = z.enum([
  'classic',
  'space',
  'jungle',
  'glacier',
  'cyber',
  'volcano',
  'random',
]);

export const createRoomSchema = z.object({
  name: nonEmptyName,
  arena: arenaSelection.optional(),
  profileId: profileId.optional(),
  profileSecret: profileSecret.optional(),
});

export const joinRoomSchema = z.object({
  code: roomCode,
  name: nonEmptyName,
  secret: secret.optional(),
  profileId: profileId.optional(),
  profileSecret: profileSecret.optional(),
});

export const sendReactionSchema = z.object({
  // Emojis are short; cap generously to allow multi-codepoint sequences.
  emoji: z.string().min(1).max(32),
});

export const sendChatSchema = z.object({
  // Trim + bound the message. Empty (after trim) is rejected; long messages are
  // capped so a single client can't broadcast an oversized payload to the room.
  text: z.string().trim().min(1).max(500),
});

/**
 * WebRTC signaling payload — STRICTLY validated (not an opaque blob).
 *
 * The server only relays these between two sockets in the same room, so an
 * attacker previously could push arbitrary JSON of any size at another client.
 * We now accept ONLY the four wire shapes the voice-chat mesh actually sends
 * (offer / answer / ice-candidate / request-offer), reject unknown keys, and cap
 * the total serialized size so no oversized blob is ever broadcast.
 *
 * SDP strings are provider-shaped and remain opaque — we bound their length but
 * do not parse them — so valid offers/answers/ICE candidates pass unchanged.
 */

// RTCSessionDescriptionInit — { type, sdp? }. SDP length-bounded, content opaque.
const sessionDescription = z
  .object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().max(WEBRTC_MAX_SIGNAL_BYTES).optional(),
  })
  .strict();

// RTCIceCandidateInit — all fields optional per the spec (end-of-candidates is {}).
const iceCandidate = z
  .object({
    candidate: z.string().max(4096).optional(),
    sdpMid: z.string().max(256).nullish(),
    sdpMLineIndex: z.number().int().min(0).max(1024).nullish(),
    usernameFragment: z.string().max(256).nullish(),
  })
  .strict();

const signalDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('offer'), offer: sessionDescription }).strict(),
  z.object({ type: z.literal('answer'), answer: sessionDescription }).strict(),
  z.object({ type: z.literal('ice-candidate'), candidate: iceCandidate }).strict(),
  z.object({ type: z.literal('request-offer') }).strict(),
]);

export const webrtcSignalSchema = z
  .object({
    targetId: z.string().min(1).max(100),
    signalData: signalDataSchema,
  })
  // Final backstop: reject any payload whose serialized size exceeds the byte
  // cap, regardless of internal shape. Prevents oversized blobs being relayed.
  .refine(
    (p) => {
      try {
        return Buffer.byteLength(JSON.stringify(p.signalData), 'utf8') <= WEBRTC_MAX_SIGNAL_BYTES;
      } catch {
        return false;
      }
    },
    { message: `signalData exceeds ${WEBRTC_MAX_SIGNAL_BYTES} bytes`, path: ['signalData'] }
  );

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

/**
 * House rules update. Every field is optional so a client may send only what it
 * changed; the server merges onto the existing rules and normalizes (clamping
 * numbers and enforcing dependencies), so bounds here are intentionally loose —
 * normalizeHouseRules is the authority. Unknown keys are stripped.
 */
export const houseRulesSchema = z
  .object({
    jumpIn: z.boolean(),
    sevenSwap: z.boolean(),
    zeroRotate: z.boolean(),
    drawThenPlay: z.boolean(),
    forcePlayDrawnCard: z.boolean(),
    drawUntilPlayable: z.boolean(),
    mustPlayIfPlayable: z.boolean(),

    stacking: z.boolean(),
    stackDrawTwoOnWildFour: z.boolean(),
    stackToEat: z.boolean(),

    challengeWildDrawFour: z.boolean(),
    bluffingWildDrawFour: z.boolean(),

    mustSayUno: z.boolean(),
    unoCallMode: z.enum(['manual', 'auto']),
    allowLateUno: z.boolean(),
    unoPenaltyCards: z.number().int().min(0).max(50),

    reverseAsSkipInTwoPlayer: z.boolean(),
    skipChaining: z.boolean(),

    allowWinWithWild: z.boolean(),
    allowWinWithDrawCard: z.boolean(),
    allowWinWithActionCard: z.boolean(),
    numberCardFinishOnly: z.boolean(),

    autoReshuffle: z.boolean(),
    turnTimer: z.boolean(),
    turnTimerSeconds: z.number().int().min(0).max(600),
    enableChat: z.boolean(),
    spectatorMode: z.boolean(),
    maxSpectators: z.number().int().min(0).max(50),
    allowRejoin: z.boolean(),
    targetScore: z.number().int().min(0).max(100000),
    maxPlayers: z.number().int().min(2).max(10),
  })
  .partial();

export const updateHouseRulesSchema = z.object({
  rules: houseRulesSchema,
});

/** Arena change (host only, lobby only). `random` resolves server-side. */
export const updateArenaSchema = z.object({
  arena: arenaSelection,
});

export const jumpInSchema = z.object({
  cardId,
});

export const swapTargetSchema = z.object({
  targetId: z.string().min(1).max(100),
});

/** Host adds bots to the lobby. Count is clamped server-side to the free seats;
 *  the bound here just rejects absurd payloads. */
export const addBotsSchema = z.object({
  count: z.number().int().min(1).max(10),
});

export const removeBotSchema = z.object({
  botId: z.string().min(1).max(100),
});

/** start-game payload. Optional & backward compatible: an old client emitting no
 *  payload behaves exactly as before. fillWithBots tops the table up with bots. */
export const startGameSchema = z
  .object({
    fillWithBots: z.boolean().optional(),
  })
  .optional()
  .nullable();

export type CreateRoomPayload = z.infer<typeof createRoomSchema>;
export type JoinRoomPayload = z.infer<typeof joinRoomSchema>;
export type SendReactionPayload = z.infer<typeof sendReactionSchema>;
export type SendChatPayload = z.infer<typeof sendChatSchema>;
export type WebrtcSignalPayload = z.infer<typeof webrtcSignalSchema>;
export type VoiceStatusPayload = z.infer<typeof voiceStatusSchema>;
export type PlayCardPayload = z.infer<typeof playCardSchema>;
export type ChooseColorPayload = z.infer<typeof chooseColorSchema>;
export type HouseRulesPayload = z.infer<typeof houseRulesSchema>;
export type UpdateHouseRulesPayload = z.infer<typeof updateHouseRulesSchema>;
export type UpdateArenaPayload = z.infer<typeof updateArenaSchema>;
export type JumpInPayload = z.infer<typeof jumpInSchema>;
export type SwapTargetPayload = z.infer<typeof swapTargetSchema>;
export type AddBotsPayload = z.infer<typeof addBotsSchema>;
export type RemoveBotPayload = z.infer<typeof removeBotSchema>;
export type StartGamePayload = z.infer<typeof startGameSchema>;
