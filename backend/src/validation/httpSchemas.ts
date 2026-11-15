import { z } from 'zod';
import { arenaSelection } from './socketSchemas';
import { sanitizeDisplayName } from '../profiles/profileTypes';

const name = z.string().max(160).transform(sanitizeDisplayName)
  .refine((value) => value.length > 0, 'A display name is required');
const secret = z.string().min(1).max(200);
const cosmetic = z.string().max(100).nullable();
const roomCode = z.string().trim().regex(/^[a-z0-9]{6}$/i).transform((value) => value.toUpperCase());

export const httpCreateRoomSchema = z.object({
  visibility: z.enum(['public', 'private']).optional(),
  arena: arenaSelection.optional(),
}).default({});
export const quickPlaySchema = z.object({ name: name.optional() }).default({});
export const httpJoinRoomSchema = z.object({
  code: roomCode,
  name,
  secret: secret.optional(),
  profileId: z.string().min(1).max(100).optional(),
  profileSecret: secret.optional(),
}).refine((value) => !!value.profileId === !!value.profileSecret, 'Profile credentials must be supplied together');
export const createProfileSchema = z.object({ displayName: name, avatar: cosmetic.optional(), outfit: cosmetic.optional() });
export const editProfileSchema = z.object({
  secret, displayName: name.optional(), avatar: cosmetic.optional(), outfit: cosmetic.optional(),
});
export const resetProfileSchema = z.object({ secret });
export const crazyGamesTokenSchema = z.object({ token: z.string().min(1).max(16_384) });
export const bugReportSchema = z.object({
  message: z.string().trim().min(10, 'Please describe the issue in at least 10 characters').max(4000),
  roomCode: roomCode.optional(),
});
