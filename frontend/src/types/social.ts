/**
 * ============================================================================
 *  Friends & Social System — CLIENT view types.
 * ============================================================================
 *
 * A strict mirror of `backend/src/social/socialTypes.ts`. Everything here is
 * DISPLAY data served by the server; the client never computes a relationship,
 * a presence status, or a joinability flag for itself. If a button should not
 * exist, the server has already said so in the payload (`joinable`,
 * `canSendRequest`, `relationship`) — the UI reads those rather than
 * re-deriving rules that could drift from the server's.
 *
 * Kept separate from `types/profile.ts` so the social layer can grow (parties,
 * DMs, guilds) without touching the profile contract.
 */

import type { MatchRecord, PrivacySettings, ProfileStats } from './profile';

// ---------------------------------------------------------------------------
// Presence.
// ---------------------------------------------------------------------------

/** What a player is doing right now. Ordered most → least reachable. */
export type PresenceStatus = 'online' | 'lobby' | 'playing' | 'watching' | 'away' | 'offline';

export interface PresenceView {
  profileId: string;
  status: PresenceStatus;
  /** Present ONLY when this viewer may be offered a Join button. */
  roomCode: string | null;
  arena: string | null;
  /** True when joining would land the viewer as a spectator, not a player. */
  joinAsSpectator: boolean;
  /** False when the room cannot take this viewer at all — render Join disabled. */
  joinable: boolean;
  since: number;
  lastSeenAt: number;
}

// ---------------------------------------------------------------------------
// Player summaries.
// ---------------------------------------------------------------------------

export interface PlayerSummary {
  profileId: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  /** null when the subject's privacy hides their outfit from this viewer. */
  outfit: string | null;
  presence: PresenceView;
}

export type RelationshipState =
  | 'self'
  | 'friends'
  | 'request-sent'
  | 'request-received'
  | 'blocked'
  | 'blocked-by'
  | 'none';

export interface FriendSummary extends PlayerSummary {
  since: number;
}

export interface RequestSummary extends PlayerSummary {
  at: number;
}

export interface SearchResult extends PlayerSummary {
  relationship: RelationshipState;
}

/** The complete social state for the local player. Replaced wholesale on every
 *  `social:snapshot` — there is no client-side merge that could drift. */
export interface SocialSnapshot {
  friends: FriendSummary[];
  incoming: RequestSummary[];
  outgoing: RequestSummary[];
  blocked: PlayerSummary[];
  privacy: PrivacySettings;
}

// ---------------------------------------------------------------------------
// Profile inspection.
// ---------------------------------------------------------------------------

export interface InspectedProfile {
  profileId: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  outfit: string | null;
  createdAt: number;
  lastSeenAt: number;
  totalPlayTimeMs: number;
  stats: ProfileStats;
  winRate: number;
  friendCount: number;
  recentMatches: MatchRecord[];
  favoriteArena: string | null;
  presence: PresenceView;
  relationship: RelationshipState;
  canSendRequest: boolean;
  /** What the subject's privacy withheld, so the UI shows an honest "hidden"
   *  state instead of a misleading zero. */
  hidden: {
    matchHistory: boolean;
    outfit: boolean;
    onlineStatus: boolean;
  };
}

// ---------------------------------------------------------------------------
// Invitations.
// ---------------------------------------------------------------------------

export interface InviteView {
  id: string;
  from: PlayerSummary;
  roomCode: string;
  arena: string | null;
  createdAt: number;
  /** Epoch ms the server will drop this invite. Drives the countdown ring. */
  expiresAt: number;
}

/** Where a Join/Accept resolved to. The client then runs the ORDINARY join
 *  flow with this code — the server's join gate stays authoritative. */
export interface JoinTarget {
  roomCode: string;
  asSpectator: boolean;
  via: 'invite' | 'friend';
}

// ---------------------------------------------------------------------------
// Notifications.
// ---------------------------------------------------------------------------

export type SocialNotificationKind =
  | 'friend-request-received'
  | 'friend-request-accepted'
  | 'friend-online'
  | 'friend-playing'
  | 'invite-received'
  | 'invite-declined'
  | 'friend-joined-room';

export interface SocialNotification {
  kind: SocialNotificationKind;
  player: { profileId: string; displayName: string; tag: string; avatarUrl: string | null };
  roomCode?: string;
  at: number;
}

export type { PrivacySettings };
