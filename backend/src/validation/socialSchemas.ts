import { z } from 'zod';
import { SOCIAL_CONFIG } from '../config/serverConfig';

/**
 * Zod schemas for every `social:*` socket event.
 *
 * Split out of `socketSchemas.ts` on purpose: gameplay payloads and social
 * payloads share nothing, and keeping the social wire contract in its own module
 * means the friends system can evolve (parties, DMs, guilds) without touching the
 * file every game action validates against.
 *
 * Same contract as the gameplay schemas: these run at the socket boundary, before
 * any handler logic, so a malformed payload becomes a clean per-client error
 * rather than an uncaught throw inside a socket.io listener.
 *
 * Note what is NOT here: no room code on `social:invite`, no status on any event,
 * no stat or relationship values anywhere. Everything the server could be lied to
 * about is derived server-side (the invite's room comes from the sender's live
 * presence, status comes from the room they hold). The client may only ever name
 * a *target* — a profile id or an invite id — never a fact.
 */

// Reusable primitives — same bounds as the gameplay schemas so an id that is
// valid on `join-room` is valid here too.
const profileId = z.string().min(1).max(100);
const profileSecret = z.string().min(1).max(200);
const inviteId = z.string().min(1).max(100);

/**
 * Opening handshake. The social layer is the only place a socket asserts a
 * persistent identity for its whole lifetime (gameplay asserts it per action), so
 * both halves are required and the secret is verified before anything is bound.
 */
export const socialHelloSchema = z.object({
  profileId,
  profileSecret,
});

/**
 * Player search. Accepts a display name, a `Name#TAG`, a bare `#TAG` or a Player
 * ID (with or without the leading `#`) — the parsing lives in
 * `profileManager.searchProfiles`, so the schema only bounds the length. `limit`
 * is optional and clamped again server-side.
 */
export const socialSearchSchema = z.object({
  query: z.string().trim().min(1).max(64),
  limit: z.number().int().min(1).max(SOCIAL_CONFIG.searchLimit).optional(),
});

/**
 * Every graph action that names another player: inspect, friend request,
 * accept/decline/cancel, remove, block/unblock, invite, join. They share one
 * shape deliberately — the *verb* is the event name, and the server decides what
 * is permitted from the relationship, never from anything in the payload.
 */
export const socialTargetSchema = z.object({
  profileId,
});

/** Accept / decline a game invitation by its server-issued id. */
export const socialInviteIdSchema = z.object({
  inviteId,
});

/**
 * Privacy update. Every field optional so the client can send only what changed;
 * the server merges onto the stored settings and re-normalizes, so
 * `normalizePrivacy` stays the single authority on what a valid setting is.
 * Carries the secret because this is an owner-only write, exactly like
 * `PATCH /api/profiles/:id`.
 */
export const socialPrivacySchema = z.object({
  profileSecret,
  privacy: z
    .object({
      friendRequests: z.enum(['everyone', 'friends-of-friends', 'nobody']),
      showOnlineStatus: z.boolean(),
      showMatchHistory: z.boolean(),
      showOutfit: z.boolean(),
      allowFriendJoin: z.boolean(),
    })
    .partial(),
});

export type SocialHelloPayload = z.infer<typeof socialHelloSchema>;
export type SocialSearchPayload = z.infer<typeof socialSearchSchema>;
export type SocialTargetPayload = z.infer<typeof socialTargetSchema>;
export type SocialInviteIdPayload = z.infer<typeof socialInviteIdSchema>;
export type SocialPrivacyPayload = z.infer<typeof socialPrivacySchema>;
