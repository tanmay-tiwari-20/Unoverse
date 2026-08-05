/**
 * ============================================================================
 *  Friends & Social System — domain types (wire shapes).
 * ============================================================================
 *
 * These describe everything the social layer sends to clients. They are
 * DISPLAY projections: like `PublicProfile`, nothing here is ever accepted back
 * from a client as truth. The friend graph and privacy settings themselves live
 * on `Profile` (see `profiles/profileTypes.ts`) so they ride the existing
 * profile store; this module owns the runtime-only concepts — presence,
 * invitations, and the viewer-aware views built from both.
 *
 * Separation of concerns: nothing in here is imported by the game engine, the
 * room manager, or any gameplay path. The social layer depends on rooms
 * (to describe what a friend is doing and to route a join); rooms never depend
 * on the social layer.
 */

import type { MatchRecord, ProfileStats, PrivacySettings, FriendRequestPolicy } from '../profiles/profileTypes';

// ---------------------------------------------------------------------------
// Presence.
// ---------------------------------------------------------------------------

/**
 * What a player is doing right now, ordered from most to least "reachable".
 *
 *   online   — connected, not in a room (browsing the landing page)
 *   lobby    — in a room that has not started its match
 *   playing  — seated in a room with a match in progress
 *   watching — spectating a room with a match in progress
 *   away     — connected but idle past the away threshold
 *   offline  — no live socket for this profile
 */
export type PresenceStatus = 'online' | 'lobby' | 'playing' | 'watching' | 'away' | 'offline';

/** One friend's live presence, as broadcast to their friends. */
export interface PresenceView {
  profileId: string;
  status: PresenceStatus;
  /** Room the player is in, when they are in one AND it is joinable by friends.
   *  `null` whenever the viewer must not be offered a Join button. */
  roomCode: string | null;
  /** Themed arena of that room, for the friend card's subtitle. */
  arena: string | null;
  /** True when a friend tapping "Join" would land as a spectator rather than a
   *  player (match already running, or every seat taken). */
  joinAsSpectator: boolean;
  /** False when the room cannot accept this viewer at all (completely full, or
   *  spectating disabled on a full table). The Join button renders disabled. */
  joinable: boolean;
  /** Epoch ms this presence last changed — drives "last seen" for offline. */
  since: number;
  /** Epoch ms of the profile's last activity (used when status is 'offline'). */
  lastSeenAt: number;
}

/** An offline presence stub — the shape returned for a friend with no live socket. */
export function offlinePresence(profileId: string, lastSeenAt: number): PresenceView {
  return {
    profileId,
    status: 'offline',
    roomCode: null,
    arena: null,
    joinAsSpectator: false,
    joinable: false,
    since: lastSeenAt,
    lastSeenAt,
  };
}

// ---------------------------------------------------------------------------
// Player summaries (friend cards, search results, request lists).
// ---------------------------------------------------------------------------

/**
 * The compact identity card used everywhere a player is listed. Intentionally
 * small — a friends list of 200 costs a few KB, and everything expensive
 * (stats, match history, outfit preview) is lazy-loaded by `inspect` only when
 * the player actually opens someone's profile.
 */
export interface PlayerSummary {
  profileId: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  /** Withheld (null) when the subject's privacy hides their outfit from viewer. */
  outfit: string | null;
  presence: PresenceView;
}

/** How the viewer is related to the subject. Drives which action buttons render. */
export type RelationshipState =
  | 'self'
  | 'friends'
  | 'request-sent'      // viewer -> subject, pending
  | 'request-received'  // subject -> viewer, pending
  | 'blocked'           // viewer has blocked subject
  | 'blocked-by'        // subject has blocked viewer
  | 'none';

/** A friend-list entry: identity + when the friendship started. */
export interface FriendSummary extends PlayerSummary {
  since: number;
}

/** A pending-request entry: identity + when the request was sent. */
export interface RequestSummary extends PlayerSummary {
  at: number;
}

/** A search hit: identity + the viewer's relationship, so the result row can
 *  render the correct action without a second round trip. */
export interface SearchResult extends PlayerSummary {
  relationship: RelationshipState;
}

/**
 * The complete social state for one player, sent once on `social:hello` and
 * re-sent whenever the graph changes. The client treats this as authoritative
 * and replaces its local state wholesale — there is no client-side merge logic
 * that could drift from the server.
 */
export interface SocialSnapshot {
  friends: FriendSummary[];
  incoming: RequestSummary[];
  outgoing: RequestSummary[];
  blocked: PlayerSummary[];
  privacy: PrivacySettings;
}

// ---------------------------------------------------------------------------
// Profile inspection (clicking any player, anywhere).
// ---------------------------------------------------------------------------

/**
 * The detailed, VIEWER-AWARE profile view. Built by `socialManager.inspect`,
 * which applies the subject's privacy settings server-side: a viewer who may not
 * see match history simply never receives `recentMatches`, rather than receiving
 * it and being trusted to hide it.
 */
export interface InspectedProfile {
  profileId: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  /** null when hidden by privacy — the 3D preview falls back to the default skin. */
  outfit: string | null;
  createdAt: number;
  lastSeenAt: number;
  totalPlayTimeMs: number;
  stats: ProfileStats;
  winRate: number;
  friendCount: number;
  /** Empty when the subject hides their match history from this viewer. */
  recentMatches: MatchRecord[];
  /** Most-played arena across the visible history, or null when unknown. */
  favoriteArena: string | null;
  presence: PresenceView;
  relationship: RelationshipState;
  /** True when the viewer may send a friend request right now (policy + block
   *  checks already applied), so the button state needs no client-side rules. */
  canSendRequest: boolean;
  /** Which fields were withheld, so the UI can show an honest "hidden" state
   *  instead of rendering a misleading zero. */
  hidden: {
    matchHistory: boolean;
    outfit: boolean;
    onlineStatus: boolean;
  };
}

// ---------------------------------------------------------------------------
// Game invitations.
// ---------------------------------------------------------------------------

/** A live invitation from one player to another to join their room. */
export interface GameInvite {
  id: string;
  fromId: string;
  toId: string;
  roomCode: string;
  createdAt: number;
  expiresAt: number;
}

/** The invitation as the recipient sees it (sender identity resolved). */
export interface InviteView {
  id: string;
  from: PlayerSummary;
  roomCode: string;
  arena: string | null;
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Notifications.
// ---------------------------------------------------------------------------

/**
 * Lightweight social notifications. The server decides WHEN one fires (it owns
 * the truth about presence and the graph); the client decides how to render it,
 * reusing the existing toast look. Deliberately a closed union so a new kind
 * can never reach an old client as an unhandled blob.
 */
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
  /** The other player this notification is about (always present). */
  player: { profileId: string; displayName: string; tag: string; avatarUrl: string | null };
  /** Room code, for the room-related kinds. */
  roomCode?: string;
  at: number;
}

// ---------------------------------------------------------------------------
// Re-exports so the socket layer has one social import site.
// ---------------------------------------------------------------------------

export type { PrivacySettings, FriendRequestPolicy };
