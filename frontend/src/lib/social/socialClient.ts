/**
 * ============================================================================
 *  Friends & Social System — socket client.
 * ============================================================================
 *
 * The bridge between Socket.IO events and `useSocialStore`. Mirrors
 * `useSocket.ts` in structure: module-singleton socket listeners + exported
 * action emitters, so the social layer can be started once and live for the
 * entire session without re-attaching on every component mount.
 *
 * Called ONCE from `useSocket.ts` inside `setupSocketListeners`, so every
 * `social:*` listener is registered exactly when the gameplay listeners are.
 *
 * Rules:
 *  1. DISPLAY DATA ONLY. Nothing here computes a relationship or verifies a
 *     secret. The server is the authority; this file passes its payloads
 *     straight into the store.
 *  2. SOCIAL ERRORS NEVER REACH THE GAME. `social:error` updates the social
 *     store, not `useGameStore.setError`, so a failed friend request cannot
 *     disrupt the in-match UI.
 *  3. AUTO-DISMISS NOTIFICATIONS. A notification arriving here gets a timer
 *     before it's even queued — consistent lifetime, never forgotten.
 */

import type { Socket } from 'socket.io-client';
import { useSocialStore, SOCIAL_NOTIFICATION_TTL_MS } from '../../store/useSocialStore';
import { useProfileStore } from '../../store/useProfileStore';
import { useGameStore } from '../../store/useGameStore';
import { logger } from '../../utils/logger';
import type {
  InspectedProfile,
  InviteView,
  JoinTarget,
  PresenceView,
  PrivacySettings,
  SearchResult,
  SocialNotification,
  SocialSnapshot,
} from '../../types/social';

/**
 * Read back the per-session seat secret the gameplay layer stores on first join.
 * Mirrors `loadSecret` in `useSocket.ts` EXACTLY — same key shape, same silent
 * failure on unavailable storage. Duplicated (rather than exported from the
 * hook) so the social layer never imports the gameplay hook module and cannot
 * introduce a cycle; the key format is the contract between them.
 */
function loadSeatSecret(code: string, name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return (
      sessionStorage.getItem(
        `unoverse:secret:${code.toUpperCase()}:${name.trim().toLowerCase()}`
      ) || undefined
    );
  } catch {
    return undefined;
  }
}

/** The durable profile identity attached to every join, mirroring
 *  `profileCreds` in `useSocket.ts`. `{}` when no profile exists yet. */
function profileCreds(): { profileId?: string; profileSecret?: string } {
  const { profileId, profileSecret } = useProfileStore.getState();
  return profileId && profileSecret ? { profileId, profileSecret } : {};
}

/** Whether the listeners have already been wired to the shared socket. Called
 *  once from `setupSocketListeners` in `useSocket.ts`. */
let attached = false;

/**
 * Attach every `social:*` listener to the shared socket.
 *
 * Called ONCE from inside `setupSocketListeners` (useSocket.ts), right after
 * the gameplay listeners are registered. The lifecycle is: app mounts →
 * useSocket connects → setupSocketListeners runs → attachSocialListeners runs.
 */
export function attachSocialListeners(socket: Socket): void {
  if (attached) return;
  attached = true;

  socket.on('social:snapshot', (snapshot: SocialSnapshot) => {
    logger.debug('[SOCIAL] Snapshot received:', snapshot.friends.length, 'friends');
    useSocialStore.getState().applySnapshot(snapshot);
  });

  socket.on('social:presence', (views: PresenceView[]) => {
    useSocialStore.getState().applyPresence(views);
  });

  socket.on('social:search-results', ({ query, results }: { query: string; results: SearchResult[] }) => {
    logger.debug('[SOCIAL] Search results:', query, results.length);
    useSocialStore.getState().applySearchResults(query, results);
  });

  socket.on('social:profile', (profile: InspectedProfile) => {
    logger.debug('[SOCIAL] Profile received:', profile.displayName);
    useSocialStore.getState().applyProfile(profile);
  });

  socket.on('social:invite', (invite: InviteView) => {
    logger.debug('[SOCIAL] Invite received:', invite.from.displayName, invite.roomCode);
    useSocialStore.getState().addInvite(invite);
  });

  socket.on('social:invite-closed', ({ inviteId }: { inviteId: string; reason?: string }) => {
    useSocialStore.getState().dropInvite(inviteId);
  });

  socket.on('social:invite-sent', ({ toId, expiresAt }: { toId: string; expiresAt: number }) => {
    useSocialStore.getState().markInviteSent(toId, expiresAt);
    setTimeout(() => useSocialStore.getState().clearInviteSent(toId), expiresAt - Date.now());
  });

  socket.on('social:invite-expired', ({ toId }: { inviteId: string; toId: string }) => {
    useSocialStore.getState().clearInviteSent(toId);
  });

  socket.on(
    'social:invite-answered',
    ({ toId, accepted }: { inviteId: string; toId: string; accepted: boolean }) => {
      // The recipient rides back on the ack, so the sender's "Invited" pill
      // clears without the client keeping its own invite-id index.
      useSocialStore.getState().clearInviteSent(toId);
      logger.debug('[SOCIAL] Invite answered by', toId, accepted ? '(accepted)' : '(declined)');
    }
  );

  /**
   * A join resolved: either an accepted invitation or a friend-join button.
   * The social layer has validated capacity and privacy and handed back a
   * destination; the client now runs the ORDINARY join flow so the game's
   * join gate stays the one and only authority.
   *
   * `join-room` is emitted directly on the socket we already hold — the same
   * payload `useSocket.joinRoom` builds — rather than reaching into the hook,
   * which cannot be called outside a component. The route change is left to
   * `SocialLayer`, which watches `pendingJoin` and calls the router.
   */
  socket.on('social:join-target', ({ roomCode, asSpectator, via }: JoinTarget) => {
    logger.debug('[SOCIAL] Join target resolved:', roomCode, asSpectator ? '(spectator)' : '', 'via', via);
    const name = useProfileStore.getState().displayName?.trim();
    if (!name) {
      useSocialStore.getState().setError('Set up your profile before joining a friend.');
      return;
    }
    // Already seated in this exact room — nothing to do but surface the modal
    // close. Re-emitting would be harmless but pointlessly noisy.
    if (useGameStore.getState().room?.code === roomCode.toUpperCase()) {
      useSocialStore.getState().setPanelOpen(false);
      return;
    }
    socket.emit('join-room', {
      code: roomCode,
      name,
      secret: loadSeatSecret(roomCode, name),
      ...profileCreds(),
    });
    // The route must change too, but routing is React's job. Park the target;
    // `SocialLayer` owns the `router.push`.
    useSocialStore.getState().setPendingJoin({ roomCode, asSpectator, via });
  });

  socket.on('social:notification', (notification: SocialNotification) => {
    logger.debug('[SOCIAL] Notification:', notification.kind, notification.player.displayName);
    // pushNotification returns the client-side id it assigned, so the timer
    // below dismisses exactly this notification — two arriving in the same
    // millisecond stay independently dismissible.
    const id = useSocialStore.getState().pushNotification(notification);
    setTimeout(() => useSocialStore.getState().dismissNotification(id), SOCIAL_NOTIFICATION_TTL_MS);
  });

  socket.on('social:error', ({ message }: { message: string }) => {
    logger.warn('[SOCIAL] Error:', message);
    useSocialStore.getState().setError(message);
    // Auto-clear after the same TTL so the panel doesn't stay red forever.
    setTimeout(() => useSocialStore.getState().setError(null), SOCIAL_NOTIFICATION_TTL_MS);
  });

  logger.debug('[SOCIAL] Listeners attached');
}

/**
 * Say hello and bind this socket to the local profile.
 *
 * TIMING. There are two independent async things in flight on a cold load: the
 * socket connecting, and zustand `persist` rehydrating the profile out of
 * localStorage. Either can win. If the socket connects first — which it usually
 * does — the profile is still null here, and a naive emit-and-return would leave
 * the socket permanently unbound, so every later social action fails with
 * "Set up your profile to use friends." even though the profile is right there.
 *
 * So: emit if the profile is ready, and otherwise subscribe and emit the moment
 * it becomes ready. The subscription unsubscribes itself after firing once, and
 * is replaced (not stacked) if hello is called again before it resolves.
 *
 * Safe to call repeatedly — the server's `social:hello` is idempotent, binding
 * the same profile to the same socket and re-sending the snapshot.
 */
let pendingHello: (() => void) | null = null;

export function sayHello(socket: Socket | null): void {
  if (!socket?.connected) return;

  // Any earlier wait is stale now — this call supersedes it.
  pendingHello?.();
  pendingHello = null;

  const emit = (profileId: string, profileSecret: string): void => {
    socket.emit('social:hello', { profileId, profileSecret });
    logger.debug('[SOCIAL] Hello sent');
  };

  const { profileId, profileSecret, hydrated } = useProfileStore.getState();
  if (profileId && profileSecret) {
    emit(profileId, profileSecret);
    return;
  }

  // Rehydration has finished and there genuinely is no profile — this player
  // hasn't created one yet. Nothing to wait for; the social UI stays inert
  // until they do, and `CreateProfileModal` calls hello again on creation.
  if (hydrated) {
    logger.debug('[SOCIAL] No profile yet — hello deferred until one exists');
    return;
  }

  // Still rehydrating. Wait for the identity to land, then bind.
  logger.debug('[SOCIAL] Waiting for profile to hydrate before hello');
  const unsubscribe = useProfileStore.subscribe((state) => {
    if (state.profileId && state.profileSecret) {
      unsubscribe();
      pendingHello = null;
      if (socket.connected) emit(state.profileId, state.profileSecret);
    } else if (state.hydrated) {
      // Hydrated with no profile — stop waiting, but don't error. Creating a
      // profile later triggers its own hello.
      unsubscribe();
      pendingHello = null;
    }
  });
  pendingHello = unsubscribe;
}

// ---------------------------------------------------------------------------
// Action emitters — the UI calls these instead of touching the socket.
// ---------------------------------------------------------------------------

export function searchPlayers(socket: Socket | null, query: string): void {
  if (!socket?.connected || !query.trim()) return;
  useSocialStore.getState().beginSearch(query);
  socket.emit('social:search', { query: query.trim(), limit: 20 });
}

export function inspectPlayer(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  useSocialStore.getState().beginLoadProfile(profileId);
  socket.emit('social:inspect', { profileId });
}

export function sendFriendRequest(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:friend-request', { profileId });
  // Acknowledge the tap immediately. The snapshot that follows re-labels this
  // row from the real graph, so a rejected request corrects itself; without this
  // the button sits unchanged for a round-trip and reads as unresponsive.
  useSocialStore.getState().markSearchResultSent(profileId);
}

export function acceptFriendRequest(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:friend-accept', { profileId });
}

export function declineFriendRequest(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:friend-decline', { profileId });
}

export function cancelFriendRequest(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:friend-cancel', { profileId });
}

export function removeFriend(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:friend-remove', { profileId });
}

export function blockPlayer(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:block', { profileId });
}

export function unblockPlayer(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:unblock', { profileId });
}

export function inviteFriend(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:invite', { profileId });
}

export function acceptInvite(socket: Socket | null, inviteId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:invite-accept', { inviteId });
  // Drop the card the moment Accept is tapped. The server also sends
  // `social:invite-closed`, and `dropInvite` is idempotent, so this only removes
  // the round-trip during which the toast would otherwise sit there looking
  // ignored — and if the accept is refused, the error surfaces in the panel.
  useSocialStore.getState().dropInvite(inviteId);
}

export function declineInvite(socket: Socket | null, inviteId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:invite-decline', { inviteId });
  // Same reasoning as accept — the card leaves on the tap, not on the ack.
  useSocialStore.getState().dropInvite(inviteId);
}

export function joinFriend(socket: Socket | null, profileId: string): void {
  if (!socket?.connected) return;
  socket.emit('social:join-friend', { profileId });
}

export function updatePrivacy(socket: Socket | null, privacy: Partial<PrivacySettings>): void {
  if (!socket?.connected) return;
  const { profileSecret } = useProfileStore.getState();
  if (!profileSecret) return;
  socket.emit('social:privacy', { profileSecret, privacy });
}
