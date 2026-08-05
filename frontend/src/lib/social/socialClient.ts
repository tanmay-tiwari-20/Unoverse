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
    // The server only sends a snapshot once a hello has bound this socket, so
    // its arrival IS the handshake ack — no extra event needed on the wire.
    markBound();
  });

  /**
   * The handshake was refused. The two reasons need opposite handling:
   *
   *  - `unknown-profile`: this server has never heard of the id. The local
   *    identity is dead (its secret authenticates nothing), so retrying can only
   *    keep failing — drop it and let the landing page's create gate reopen.
   *  - `bad-secret`: the id exists but this browser's secret doesn't match it,
   *    so the identity is equally unusable here. Same treatment, different copy.
   */
  socket.on('social:hello-failed', ({ reason }: { reason: 'unknown-profile' | 'bad-secret' }) => {
    logger.warn('[SOCIAL] Handshake refused:', reason);
    markUnbound();
    // Nothing queued can ever succeed under this identity.
    queued = [];
    useProfileStore.getState().clearIdentity();
    // `reset()` clears `error`, so the message is set after it, not before.
    useSocialStore.getState().reset();
    useSocialStore
      .getState()
      .setError(
        reason === 'unknown-profile'
          ? 'Your profile is no longer on the server. Create a new one to use friends.'
          : 'Your saved profile could not be verified. Create a new one to use friends.'
      );
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

  socket.on('social:error', ({ message, code }: { message: string; code?: string }) => {
    logger.warn('[SOCIAL] Error:', message, code ? `(${code})` : '');
    // `not-bound` is recoverable: the action raced the handshake or arrived after
    // a reconnect, so one silent re-bind attempt is tried before surfacing the
    // error. Every other code is shown immediately.
    if (code === 'not-bound' && !rebindAttempted) {
      rebindAttempted = true;
      logger.debug('[SOCIAL] Retrying handshake once for not-bound error');
      // The server disagrees with this client's idea of being bound — usually a
      // reconnect under a new socket id, or an instance restart. Believe the
      // server, so anything tapped from here queues instead of being emitted
      // into a socket that would reject it again.
      markUnbound();
      sayHello(activeSocket);
      return;
    }
    useSocialStore.getState().setError(message);
    // Auto-clear after the same TTL so the panel doesn't stay red forever.
    setTimeout(() => useSocialStore.getState().setError(null), SOCIAL_NOTIFICATION_TTL_MS);
  });

  // Unbind on disconnect so the next connect establishes a fresh handshake.
  socket.on('disconnect', () => {
    logger.debug('[SOCIAL] Disconnected');
    markUnbound();
  });

  // Watch for identity changes: when a profile is created (or rehydrated from
  // localStorage after connect), say hello immediately so the social layer
  // becomes usable without the player needing to reload or tap anything.
  //
  // Never unsubscribed on purpose: these listeners are attached once for the
  // whole session (`attached` guard above), so the watcher's lifetime is the
  // app's lifetime — the same as every socket listener registered here.
  useProfileStore.subscribe((state, prev) => {
    const hadIdentity = prev.profileId && prev.profileSecret;
    const hasIdentity = state.profileId && state.profileSecret;
    if (!hadIdentity && hasIdentity) {
      logger.debug('[SOCIAL] Identity appeared — saying hello');
      sayHello(activeSocket);
    }
  });

  logger.debug('[SOCIAL] Listeners attached');
  // Rehydration may have completed before the watcher above existed, so greet
  // once here too. `sayHello` is a no-op without an identity and never sends a
  // duplicate hello, so this is safe either way.
  sayHello(socket);
}

/**
 * ============================================================================
 *  The handshake: binding state, retry, and replay.
 * ============================================================================
 *
 * Every social action needs this socket to be BOUND — the server established
 * identity once per connection via `social:hello` and reads it from presence
 * thereafter, so an unbound socket fails every action with "Set up your profile
 * to use friends." even though the profile is sitting right there in
 * localStorage.
 *
 * Binding used to be fire-and-forget, which meant any single failure was
 * permanent: nothing tracked whether the hello landed, nothing retried it, and
 * nothing told the player what had gone wrong. The ways it fails are all
 * ordinary — the socket connects before zustand `persist` has rehydrated the
 * identity; a profile is created after the socket connected; the connection
 * drops and returns under a new socket id; or the server no longer knows the
 * profile at all.
 *
 * So binding is a small state machine instead. Actions taken while unbound are
 * QUEUED and replayed once the snapshot lands, rather than being emitted into a
 * socket that will reject them.
 */

type BindingState = 'idle' | 'pending' | 'bound';

let binding: BindingState = 'idle';

/** The socket the listeners are attached to, so a queued action has something to
 *  replay onto and the identity watcher has something to greet. */
let activeSocket: Socket | null = null;

/** Actions deferred until the handshake completes. Bounded: a player tapping
 *  during a reconnect should replay their intent, not a minute of backlog. */
let queued: Array<(socket: Socket) => void> = [];
const MAX_QUEUED = 8;

/** How long to wait for the snapshot before calling the handshake failed. */
const HELLO_TIMEOUT_MS = 8000;
let helloTimer: ReturnType<typeof setTimeout> | null = null;

/** Guards against an unbound/rebind loop: the server's `not-bound` gets exactly
 *  one silent re-handshake per successful bind, then the error is shown. */
let rebindAttempted = false;

function clearHelloTimer(): void {
  if (helloTimer) {
    clearTimeout(helloTimer);
    helloTimer = null;
  }
}

/** The handshake landed. Replay whatever the player asked for while it was in
 *  flight — this is what makes a search typed during reconnect just work. */
function markBound(): void {
  binding = 'bound';
  rebindAttempted = false;
  clearHelloTimer();

  const socket = activeSocket;
  if (!socket?.connected || queued.length === 0) {
    queued = [];
    return;
  }
  const replay = queued;
  queued = [];
  for (const action of replay) {
    try {
      action(socket);
    } catch (err) {
      logger.warn('[SOCIAL] Queued action failed after bind:', err);
    }
  }
}

/** The handshake is no longer valid — the next action re-establishes it. */
function markUnbound(): void {
  binding = 'idle';
  clearHelloTimer();
}

/**
 * Say hello and bind this socket to the local profile.
 *
 * Safe to call repeatedly: the server's handler is idempotent, and an in-flight
 * hello is not duplicated. When no identity exists yet this is a no-op — the
 * identity watcher installed by `attachSocialListeners` fires the hello the
 * moment one appears, whether that's from rehydration or from the player
 * creating a profile.
 */
export function sayHello(socket: Socket | null): void {
  if (socket) activeSocket = socket;
  if (!socket?.connected) return;
  if (binding === 'pending') return;

  const { profileId, profileSecret } = useProfileStore.getState();
  if (!profileId || !profileSecret) {
    logger.debug('[SOCIAL] No profile yet — hello deferred until one exists');
    return;
  }

  binding = 'pending';
  socket.emit('social:hello', { profileId, profileSecret });
  logger.debug('[SOCIAL] Hello sent');

  // A hello that is never answered would otherwise leave actions queued forever.
  clearHelloTimer();
  helloTimer = setTimeout(() => {
    helloTimer = null;
    if (binding !== 'pending') return;
    binding = 'idle';
    queued = [];
    logger.warn('[SOCIAL] Handshake timed out');
    useSocialStore.getState().setError('Could not reach the friends service. Please try again.');
  }, HELLO_TIMEOUT_MS);
}

/**
 * Run a social action, establishing the binding first if necessary.
 *
 * Every emitter goes through this, so no action can be sent to a socket the
 * server will reject — the reason the original bug was reachable from every
 * button in the panel at once.
 */
function whenBound(socket: Socket | null, action: (socket: Socket) => void): void {
  if (!socket?.connected) return;
  activeSocket = socket;

  if (binding === 'bound') {
    action(socket);
    return;
  }

  const { profileId, profileSecret } = useProfileStore.getState();
  if (!profileId || !profileSecret) {
    // Genuinely no identity — this is the one case where the original message
    // was the truth, and creating a profile is what fixes it.
    useSocialStore.getState().setError('Create a profile to use friends.');
    return;
  }

  if (queued.length < MAX_QUEUED) queued.push(action);
  sayHello(socket);
}

// ---------------------------------------------------------------------------
// Action emitters — the UI calls these instead of touching the socket.
// ---------------------------------------------------------------------------

export function searchPlayers(socket: Socket | null, query: string): void {
  if (!query.trim()) return;
  useSocialStore.getState().beginSearch(query);
  whenBound(socket, (s) => {
    s.emit('social:search', { query: query.trim(), limit: 20 });
  });
}

export function inspectPlayer(socket: Socket | null, profileId: string): void {
  useSocialStore.getState().beginLoadProfile(profileId);
  whenBound(socket, (s) => {
    s.emit('social:inspect', { profileId });
  });
}

export function sendFriendRequest(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:friend-request', { profileId });
    // Acknowledge the tap immediately. The snapshot that follows re-labels this
    // row from the real graph, so a rejected request corrects itself; without this
    // the button sits unchanged for a round-trip and reads as unresponsive.
    useSocialStore.getState().markSearchResultSent(profileId);
  });
}

export function acceptFriendRequest(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:friend-accept', { profileId });
  });
}

export function declineFriendRequest(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:friend-decline', { profileId });
  });
}

export function cancelFriendRequest(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:friend-cancel', { profileId });
  });
}

export function removeFriend(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:friend-remove', { profileId });
  });
}

export function blockPlayer(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:block', { profileId });
  });
}

export function unblockPlayer(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:unblock', { profileId });
  });
}

export function inviteFriend(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:invite', { profileId });
  });
}

export function acceptInvite(socket: Socket | null, inviteId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:invite-accept', { inviteId });
    // Drop the card the moment Accept is tapped. The server also sends
    // `social:invite-closed`, and `dropInvite` is idempotent, so this only removes
    // the round-trip during which the toast would otherwise sit there looking
    // ignored — and if the accept is refused, the error surfaces in the panel.
    useSocialStore.getState().dropInvite(inviteId);
  });
}

export function declineInvite(socket: Socket | null, inviteId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:invite-decline', { inviteId });
    // Same reasoning as accept — the card leaves on the tap, not on the ack.
    useSocialStore.getState().dropInvite(inviteId);
  });
}

export function joinFriend(socket: Socket | null, profileId: string): void {
  whenBound(socket, (s) => {
    s.emit('social:join-friend', { profileId });
  });
}

export function updatePrivacy(socket: Socket | null, privacy: Partial<PrivacySettings>): void {
  const { profileSecret } = useProfileStore.getState();
  if (!profileSecret) return;
  whenBound(socket, (s) => {
    s.emit('social:privacy', { profileSecret, privacy });
  });
}
