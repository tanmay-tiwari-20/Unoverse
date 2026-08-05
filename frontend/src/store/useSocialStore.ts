/**
 * ============================================================================
 *  Friends & Social System — client store.
 * ============================================================================
 *
 * Holds every piece of social state the UI reads: the friend graph, live
 * presence, invitations, search results, lazily-loaded profiles and the small
 * amount of panel/modal UI state.
 *
 * Two rules keep this honest:
 *
 *  1. THE SERVER IS THE AUTHORITY. Nothing here computes a relationship, a
 *     status, or whether a room can be joined. `social:snapshot` REPLACES the
 *     graph wholesale rather than merging, so the client can never drift into a
 *     state the server does not agree with.
 *
 *  2. RE-RENDERS ARE SCOPED. State is split into independent slices (graph,
 *     presence, invites, search, profiles) so a presence tick for one friend
 *     does not invalidate the search results or the open profile modal.
 *     Components subscribe to the narrowest slice they need.
 *
 * Presence arrives incrementally and is kept in its own map rather than being
 * folded back into the friend objects — one friend coming online then replaces
 * one map entry instead of rebuilding the whole list.
 */

import { create } from 'zustand';
import type {
  FriendSummary,
  InspectedProfile,
  InviteView,
  JoinTarget,
  PlayerSummary,
  PresenceStatus,
  PresenceView,
  PrivacySettings,
  RelationshipState,
  RequestSummary,
  SearchResult,
  SocialNotification,
} from '../types/social';

/** A notification with a client-side id, so two firing in the same millisecond
 *  can still be dismissed independently. */
export interface QueuedNotification extends SocialNotification {
  id: number;
}

/** How long a social notification stays on screen. Matches the gameplay toast
 *  lifetime in `useGameStore` so the two feel like one system. */
export const SOCIAL_NOTIFICATION_TTL_MS = 4200;

interface SocialState {
  // ---- The graph (replaced wholesale by social:snapshot) -------------------
  friends: FriendSummary[];
  incoming: RequestSummary[];
  outgoing: RequestSummary[];
  blocked: PlayerSummary[];
  privacy: PrivacySettings | null;
  /** False until the first snapshot lands — lets the panel show a skeleton
   *  rather than an "add some friends" empty state it hasn't earned yet. */
  ready: boolean;

  // ---- Live presence -------------------------------------------------------
  /** profileId -> latest presence. Updated in place by `social:presence`. */
  presence: Record<string, PresenceView>;

  // ---- Invitations ---------------------------------------------------------
  /** Invitations addressed to me, newest last. Bounded by the server's TTL. */
  invites: InviteView[];
  /** Friends I have a live outgoing invite to, so their card can show "Invited"
   *  instead of offering Invite again. profileId -> expiry epoch ms. */
  sentInvites: Record<string, number>;

  // ---- Search --------------------------------------------------------------
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;

  // ---- Lazily-loaded profiles ---------------------------------------------
  /** profileId -> the detailed view. Cached so re-opening a profile paints
   *  instantly while the fresh copy is fetched behind it. */
  profiles: Record<string, InspectedProfile>;
  /** profileId currently in flight, for the modal's loading state. */
  loadingProfile: string | null;

  // ---- Notifications -------------------------------------------------------
  notifications: QueuedNotification[];

  // ---- UI ------------------------------------------------------------------
  panelOpen: boolean;
  /** profileId of the open profile modal, or null. */
  openProfileId: string | null;
  /** Last social error, shown inline in the panel (never as a game error). */
  error: string | null;
  /** A resolved join destination waiting to be routed to. Set by the socket
   *  client (which cannot route) and consumed by `SocialLayer` (which can). */
  pendingJoin: JoinTarget | null;

  // ---- Actions -------------------------------------------------------------
  applySnapshot: (snapshot: {
    friends: FriendSummary[];
    incoming: RequestSummary[];
    outgoing: RequestSummary[];
    blocked: PlayerSummary[];
    privacy: PrivacySettings;
  }) => void;
  applyPresence: (views: PresenceView[]) => void;

  addInvite: (invite: InviteView) => void;
  dropInvite: (inviteId: string) => void;
  markInviteSent: (toId: string, expiresAt: number) => void;
  clearInviteSent: (toId: string) => void;

  beginSearch: (query: string) => void;
  applySearchResults: (query: string, results: SearchResult[]) => void;
  /** Flip one search row to `request-sent` the instant the request is emitted.
   *  The next `social:snapshot` is still the authority — this only removes the
   *  round-trip delay before the button acknowledges the tap. */
  markSearchResultSent: (profileId: string) => void;
  clearSearch: () => void;

  beginLoadProfile: (profileId: string) => void;
  applyProfile: (profile: InspectedProfile) => void;

  /** Returns the client-side id assigned, so the caller can schedule exactly
   *  this notification's dismissal. */
  pushNotification: (notification: SocialNotification) => number;
  dismissNotification: (id: number) => void;

  setPanelOpen: (open: boolean) => void;
  openProfile: (profileId: string | null) => void;
  setError: (message: string | null) => void;
  setPendingJoin: (target: JoinTarget | null) => void;

  reset: () => void;
}

const EMPTY = {
  friends: [] as FriendSummary[],
  incoming: [] as RequestSummary[],
  outgoing: [] as RequestSummary[],
  blocked: [] as PlayerSummary[],
  privacy: null,
  ready: false,
  presence: {} as Record<string, PresenceView>,
  invites: [] as InviteView[],
  sentInvites: {} as Record<string, number>,
  searchQuery: '',
  searchResults: [] as SearchResult[],
  searchLoading: false,
  profiles: {} as Record<string, InspectedProfile>,
  loadingProfile: null,
  notifications: [] as QueuedNotification[],
  panelOpen: false,
  openProfileId: null,
  error: null,
  pendingJoin: null,
};

let notificationSeq = 0;

export const useSocialStore = create<SocialState>((set, get) => ({
  ...EMPTY,

  applySnapshot: (snapshot) =>
    set((state) => ({
      friends: snapshot.friends,
      incoming: snapshot.incoming,
      outgoing: snapshot.outgoing,
      blocked: snapshot.blocked,
      privacy: snapshot.privacy,
      ready: true,
      // Search results are their own slice and are NOT part of the snapshot, so
      // a row the player just acted on would otherwise keep the relationship it
      // was fetched with. Re-derive each row's relationship from the fresh graph
      // — the snapshot stays the authority, the stale row just follows it.
      searchResults: relabelSearchResults(state.searchResults, snapshot),
      // Seed presence from the snapshot so the first paint is already accurate,
      // without discarding any live update that arrived first.
      presence: snapshot.friends.reduce<Record<string, PresenceView>>(
        (acc, friend) => {
          acc[friend.profileId] = state.presence[friend.profileId] ?? friend.presence;
          return acc;
        },
        {}
      ),
    })),

  applyPresence: (views) => {
    if (views.length === 0) return;
    set((state) => {
      // Skip the state write entirely when nothing actually changed — the away
      // sweep and room refreshes can both re-send an identical view.
      const changed = views.some((v) => !isSamePresence(state.presence[v.profileId], v));
      if (!changed) return state;
      const presence = { ...state.presence };
      for (const view of views) presence[view.profileId] = view;
      return { ...state, presence };
    });
  },

  addInvite: (invite) =>
    set((state) => ({
      invites: [...state.invites.filter((i) => i.id !== invite.id), invite],
    })),

  dropInvite: (inviteId) =>
    set((state) => ({ invites: state.invites.filter((i) => i.id !== inviteId) })),

  markInviteSent: (toId, expiresAt) =>
    set((state) => ({ sentInvites: { ...state.sentInvites, [toId]: expiresAt } })),

  clearInviteSent: (toId) =>
    set((state) => {
      if (!(toId in state.sentInvites)) return state;
      const sentInvites = { ...state.sentInvites };
      delete sentInvites[toId];
      return { ...state, sentInvites };
    }),

  beginSearch: (query) => set({ searchQuery: query, searchLoading: true }),

  applySearchResults: (query, results) =>
    set((state) =>
      // A stale response for a query the player has already moved past is
      // dropped rather than flickering into view.
      state.searchQuery.trim() === query.trim()
        ? { ...state, searchResults: results, searchLoading: false }
        : state
    ),

  /** Optimistically mark a search result as having an outgoing request, so the
   *  Add Friend button updates to "Sent" immediately without waiting for a
   *  server round-trip. */
  markSearchResultSent: (profileId: string) =>
    set((state) => ({
      searchResults: state.searchResults.map((r) =>
        r.profileId === profileId ? { ...r, relationship: 'request-sent' as const } : r
      ),
    })),

  clearSearch: () => set({ searchQuery: '', searchResults: [], searchLoading: false }),

  beginLoadProfile: (profileId) => set({ loadingProfile: profileId }),

  applyProfile: (profile) =>
    set((state) => ({
      profiles: { ...state.profiles, [profile.profileId]: profile },
      loadingProfile: state.loadingProfile === profile.profileId ? null : state.loadingProfile,
    })),

  pushNotification: (notification) => {
    const id = ++notificationSeq;
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }].slice(-4),
    }));
    return id;
  },

  dismissNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),

  setPanelOpen: (open) => set({ panelOpen: open, error: open ? get().error : null }),
  openProfile: (profileId) => set({ openProfileId: profileId }),
  setError: (message) => set({ error: message }),
  setPendingJoin: (target) => set({ pendingJoin: target }),

  reset: () => set({ ...EMPTY, presence: {}, profiles: {}, sentInvites: {} }),
}));

/** Field-wise presence comparison — the fields the UI actually renders. */
function isSamePresence(a: PresenceView | undefined, b: PresenceView): boolean {
  return (
    !!a &&
    a.status === b.status &&
    a.roomCode === b.roomCode &&
    a.joinable === b.joinable &&
    a.joinAsSpectator === b.joinAsSpectator &&
    a.lastSeenAt === b.lastSeenAt
  );
}

/**
 * Re-label search rows from a fresh snapshot.
 *
 * `social:search-results` is a separate response from `social:snapshot`, so a row
 * fetched before the player tapped Add Friend keeps whatever relationship the
 * search carried — which is why the button never acknowledged the request. The
 * snapshot IS the graph, so every relationship the panel can render is derivable
 * from it; anything not mentioned (self, blocked-by, none) is left as the server
 * originally labelled it rather than guessed at here.
 */
function relabelSearchResults(
  results: SearchResult[],
  snapshot: {
    friends: FriendSummary[];
    incoming: RequestSummary[];
    outgoing: RequestSummary[];
    blocked: PlayerSummary[];
  }
): SearchResult[] {
  if (results.length === 0) return results;

  const next = new Map<string, RelationshipState>();
  for (const f of snapshot.friends) next.set(f.profileId, 'friends');
  for (const r of snapshot.incoming) next.set(r.profileId, 'request-received');
  for (const r of snapshot.outgoing) next.set(r.profileId, 'request-sent');
  for (const b of snapshot.blocked) next.set(b.profileId, 'blocked');

  let changed = false;
  const relabelled = results.map((row) => {
    // 'self' and 'blocked-by' are server-only facts the snapshot doesn't carry,
    // so they're never overwritten.
    if (row.relationship === 'self' || row.relationship === 'blocked-by') return row;
    const relationship = next.get(row.profileId) ?? 'none';
    if (relationship === row.relationship) return row;
    changed = true;
    return { ...row, relationship };
  });

  // Same identity back when nothing moved, so a snapshot that didn't touch any
  // visible row can't re-render the search list.
  return changed ? relabelled : results;
}

// ---------------------------------------------------------------------------
// Selectors.
// ---------------------------------------------------------------------------

/** Ordering for the friends list: most reachable first, then alphabetical.
 *  Mirrors the server's snapshot ordering so a live presence update re-sorts
 *  the list the same way a fresh snapshot would. */
const STATUS_WEIGHT: Record<PresenceStatus, number> = {
  playing: 0,
  lobby: 1,
  watching: 2,
  online: 3,
  away: 4,
  offline: 5,
};

/** The live presence for a player, falling back to whatever the snapshot
 *  carried (and finally to a synthesized offline view). */
export function presenceOf(
  presence: Record<string, PresenceView>,
  player: { profileId: string; presence: PresenceView }
): PresenceView {
  return presence[player.profileId] ?? player.presence;
}

/** Friends in display order, with live presence folded in. */
export function sortedFriends(
  friends: FriendSummary[],
  presence: Record<string, PresenceView>
): FriendSummary[] {
  return [...friends]
    .map((f) => ({ ...f, presence: presenceOf(presence, f) }))
    .sort((a, b) => {
      const delta = STATUS_WEIGHT[a.presence.status] - STATUS_WEIGHT[b.presence.status];
      if (delta !== 0) return delta;
      return a.displayName.localeCompare(b.displayName);
    });
}

/** Count of things that need the player's attention — drives the badge on the
 *  Friends button. Requests and invitations both qualify; a friend merely
 *  coming online does not. */
export function attentionCount(state: {
  incoming: RequestSummary[];
  invites: InviteView[];
}): number {
  return state.incoming.length + state.invites.length;
}
