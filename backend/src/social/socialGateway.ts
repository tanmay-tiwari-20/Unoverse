/**
 * ============================================================================
 *  Social gateway — the ONLY bridge between sockets and the social layer.
 * ============================================================================
 *
 * Everything socket-shaped about the Friends & Social System lives here:
 * identity binding, the `social:*` event handlers, friend-scoped presence
 * fan-out, notification delivery, and the away sweep. `socialManager` and
 * `presenceManager` stay transport-agnostic; `index.ts` keeps its gameplay
 * handlers untouched and only calls the four lifecycle hooks at the bottom.
 *
 * Design rules this file follows:
 *
 *  1. NOTHING IS BROADCAST WIDELY. Social traffic is addressed to specific
 *     sockets — a presence change goes to that player's friends and no one else.
 *     There is no social room, no `io.emit`, and no shared channel a client
 *     could listen in on.
 *
 *  2. SOCIAL FAILURES USE `social:error`, never the gameplay `error` event. The
 *     game's `error` handler drives the in-match error banner; a failed friend
 *     request must not be able to reach it.
 *
 *  3. NO POLLING, EITHER DIRECTION. Every update is pushed from the event that
 *     caused it (a socket connecting, a room starting, a graph mutation). The one
 *     timer in the file is the away sweep, which exists because "idle for five
 *     minutes" is the only status with no triggering event, and it diffs before
 *     sending so a quiet server produces zero traffic.
 *
 *  4. RATE LIMITING AND VALIDATION ARE NOT RE-IMPLEMENTED. Handlers register
 *     through the same `on(event, guard(schema, handler))` pipeline every
 *     gameplay event uses.
 *
 * Multi-instance note: presence is per-process (it tracks local sockets), so
 * behind a horizontally-scaled deployment each instance knows its own players.
 * The Redis adapter already shares gameplay rooms; sharing presence would mean
 * moving `presenceManager`'s two maps into Redis, which is a drop-in change to
 * that class alone and needs nothing from this file.
 */

import type { Server, Socket } from 'socket.io';
import type { ZodType } from 'zod';

import { logger } from '../utils/logger';
import { profileManager } from '../profiles/profileManager';
import { presenceManager } from './presenceManager';
import { socialManager, SocialError } from './socialManager';
import { SOCIAL_CONFIG } from '../config/serverConfig';
import type { PresenceStatus, SocialNotification, SocialNotificationKind } from './socialTypes';
import {
  socialHelloSchema,
  socialInviteIdSchema,
  socialPrivacySchema,
  socialSearchSchema,
  socialTargetSchema,
} from '../validation/socialSchemas';

/** The per-connection helpers `index.ts` already builds, handed in so this file
 *  reuses the exact rate-limit + validation pipeline gameplay events use. */
export interface SocialBindings {
  on(event: string, listener: (payload: unknown) => void): void;
  guard<T>(schema: ZodType<T>, handler: (data: T) => void): (payload: unknown) => void;
  /** Reads the connection's current room from the gameplay closure, so a socket
   *  that joined a room before saying hello still gets accurate presence. */
  getRoomCode(): string | null;
}

/** Set once at startup. Held so the lifecycle hooks and the away sweep can emit
 *  without threading `io` through every gameplay call site. */
let ioRef: Server | null = null;
let awaySweep: NodeJS.Timeout | null = null;

// ---------------------------------------------------------------------------
// Emit helpers — all addressed, never broadcast.
// ---------------------------------------------------------------------------

/** Send an event to every live socket of one profile (all their tabs/devices). */
function emitToProfile(profileId: string, event: string, payload: unknown): void {
  if (!ioRef) return;
  for (const socketId of presenceManager.socketsFor(profileId)) {
    ioRef.to(socketId).emit(event, payload);
  }
}

/**
 * Push the authoritative social snapshot to a profile.
 *
 * The client replaces its state wholesale from this, so there is no client-side
 * merge that could drift from the server. It is only ever sent to someone who is
 * online — an offline player gets a fresh snapshot on their next `social:hello`.
 */
function pushSnapshot(profileId: string): void {
  if (!presenceManager.isOnline(profileId)) return;
  emitToProfile(profileId, 'social:snapshot', socialManager.snapshotFor(profileId));
}

/** Push snapshots to everyone a mutation touched (sender + receiver). */
function pushSnapshots(ids: readonly string[]): void {
  for (const id of new Set(ids)) pushSnapshot(id);
}

/** The tiny identity card every notification carries. */
function playerCard(profileId: string): SocialNotification['player'] | null {
  const p = profileManager.getProfile(profileId);
  if (!p) return null;
  return { profileId: p.id, displayName: p.displayName, tag: p.tag, avatarUrl: p.avatarUrl };
}

/** Deliver one notification, if both the recipient is online and the subject
 *  still exists. Silently skipped otherwise — notifications are best-effort by
 *  design; nothing about the graph depends on one being seen. */
function notify(
  toId: string,
  kind: SocialNotificationKind,
  aboutId: string,
  roomCode?: string | null
): void {
  if (!presenceManager.isOnline(toId)) return;
  const player = playerCard(aboutId);
  if (!player) return;
  const payload: SocialNotification = { kind, player, at: Date.now() };
  if (roomCode) payload.roomCode = roomCode;
  emitToProfile(toId, 'social:notification', payload);
}

// ---------------------------------------------------------------------------
// Presence fan-out.
// ---------------------------------------------------------------------------

/**
 * Tell a player's friends what they are doing now.
 *
 * Cost is O(friends), bounded by `SOCIAL_CONFIG.maxFriends`, and only online
 * friends are emitted to — an offline friend learns the current state from their
 * next snapshot rather than from a queue of missed events.
 *
 * The projection is computed ONCE: `viewFor(id, true)` is identical for every
 * recipient because they are all friends, and privacy decisions inside it depend
 * on the subject rather than the viewer.
 *
 * @param force  Send even when the derived status is unchanged. Used after a
 *               room/privacy change, where the status can stay `lobby` while
 *               joinability or the room code changed underneath it.
 */
function broadcastPresence(profileId: string, force = true): void {
  if (!ioRef) return;

  const status = presenceManager.statusOf(profileId);
  const previous = presenceManager.lastBroadcastStatus(profileId);
  if (!force && status === previous) return;
  presenceManager.rememberBroadcast(profileId, status);

  const friendIds = socialManager.friendIdsOf(profileId);
  if (friendIds.length === 0) return;

  const view = presenceManager.viewFor(profileId, true);
  // "Started playing" is a transition, not a state — derived from the diff so a
  // repeated refresh of an in-progress match never re-notifies.
  const startedPlaying = status === 'playing' && previous !== 'playing';

  for (const friendId of friendIds) {
    if (!presenceManager.isOnline(friendId)) continue;
    emitToProfile(friendId, 'social:presence', [view]);
    if (startedPlaying) notify(friendId, 'friend-playing', profileId, view.roomCode);
  }
}

/** Send a player the current presence of all their friends in one message.
 *  Used on hello, so a reconnecting client is instantly accurate. */
function pushFriendPresence(profileId: string): void {
  const friendIds = socialManager.friendIdsOf(profileId);
  if (friendIds.length === 0) return;
  emitToProfile(
    profileId,
    'social:presence',
    friendIds.map((id) => presenceManager.viewFor(id, true))
  );
}

/**
 * A room's state changed in a way that changes what everyone in it is "doing"
 * (match started, match ended, someone left and freed a seat). One call refreshes
 * every member's friends — players and spectators alike.
 */
export function socialRefreshRoom(roomCode: string | null | undefined): void {
  if (!roomCode || !ioRef) return;
  for (const profileId of presenceManager.profilesInRoom(roomCode)) {
    broadcastPresence(profileId);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle hooks called from the gameplay handlers in index.ts.
// Each is a no-op for a socket with no verified profile, so gameplay for a
// profile-less guest is completely unaffected.
// ---------------------------------------------------------------------------

/** A socket entered a room (created or joined). */
export function socialEnterRoom(socketId: string, roomCode: string): void {
  const profileId = presenceManager.profileForSocket(socketId);
  if (!profileId) return;

  const code = roomCode.toUpperCase();
  const wasAlreadyHere = presenceManager.roomOf(profileId) === code;
  // Read membership BEFORE joining so the arriving player isn't in their own list.
  const existingMembers = wasAlreadyHere ? [] : presenceManager.profilesInRoom(code);

  presenceManager.setRoom(profileId, code);

  for (const memberId of existingMembers) {
    if (memberId === profileId) continue;
    if (!socialManager.areFriends(memberId, profileId)) continue;
    notify(memberId, 'friend-joined-room', profileId, code);
  }

  // Everyone in the room changed too — a new arrival can fill the last seat,
  // which flips `joinable` on every member's friend card.
  socialRefreshRoom(code);
  broadcastPresence(profileId);
}

/** A socket left its room but stayed connected. */
export function socialLeaveRoom(socketId: string, roomCode?: string | null): void {
  const profileId = presenceManager.profileForSocket(socketId);
  if (!profileId) return;
  presenceManager.setRoom(profileId, null);
  broadcastPresence(profileId);
  // A freed seat can make the room joinable again for everyone still in it.
  socialRefreshRoom(roomCode ?? null);
}

/**
 * A socket disconnected. MUST be called before any early return in the
 * `disconnect` handler, or a profile whose socket was never in a room would stay
 * online forever.
 */
export function socialDisconnect(socketId: string): void {
  const roomCode = (() => {
    const profileId = presenceManager.profileForSocket(socketId);
    return profileId ? presenceManager.roomOf(profileId) : null;
  })();

  const wentOffline = presenceManager.unbind(socketId);
  if (!wentOffline) return; // another tab is still open — no state change

  // `unbind` already removed the entry, so this projects the offline view.
  broadcastPresence(wentOffline);
  socialRefreshRoom(roomCode);
}

// ---------------------------------------------------------------------------
// Startup: invite expiry delivery + the away sweep.
// ---------------------------------------------------------------------------

/**
 * Wire the process-wide social services. Called once from `start()`.
 * Returns a disposer so shutdown can clear the sweep timer.
 */
export function startSocialServices(io: Server): () => void {
  ioRef = io;

  // An invitation that times out has to close the recipient's popup — otherwise
  // they tap Accept on something the server has already forgotten.
  socialManager.setInviteExpiryHandler((invite) => {
    emitToProfile(invite.toId, 'social:invite-closed', { inviteId: invite.id, reason: 'expired' });
    emitToProfile(invite.fromId, 'social:invite-expired', { inviteId: invite.id, toId: invite.toId });
  });

  if (awaySweep) clearInterval(awaySweep);
  awaySweep = setInterval(() => {
    for (const profileId of presenceManager.onlineProfileIds()) {
      // force=false: only a genuine status change is sent, so an idle server with
      // 500 connected players produces no traffic at all.
      broadcastPresence(profileId, false);
    }
  }, SOCIAL_CONFIG.awaySweepMs);
  awaySweep.unref?.();

  logger.debug('[SOCIAL] Gateway online (away sweep every ' + SOCIAL_CONFIG.awaySweepMs + 'ms)');

  return () => {
    if (awaySweep) clearInterval(awaySweep);
    awaySweep = null;
  };
}

// ---------------------------------------------------------------------------
// Per-connection handlers.
// ---------------------------------------------------------------------------

/**
 * Register every `social:*` handler on one connection.
 *
 * Called from inside `io.on('connection')` after `on`/`guard` exist. Adds no
 * listeners to any gameplay event and mutates nothing the gameplay handlers own.
 */
export function attachSocial(io: Server, socket: Socket, bindings: SocialBindings): void {
  ioRef ??= io;
  const { on, guard, getRoomCode } = bindings;

  /**
   * Report a rejected intent. `code` is a stable machine-readable tag the client
   * can act on; the message is the human copy. Only codes the client genuinely
   * needs to branch on are set — everything else is display-only.
   */
  const fail = (message: string, code?: string): void => {
    socket.emit('social:error', code ? { message, code } : { message });
  };

  /**
   * The profile this socket proved it owns, or null. Identity is established
   * ONCE per connection by `social:hello` (secret-verified) and read from
   * presence thereafter — no social action re-accepts a profileId from the
   * client, so one cannot act as another player by relabeling a payload.
   */
  const meId = (): string | null => presenceManager.profileForSocket(socket.id);

  /**
   * Run a handler with an authenticated identity, translating a rejected intent
   * into `social:error`. `SocialError` messages are written for players and pass
   * through verbatim; anything else is logged and replaced with a generic
   * message so an internal failure never leaks its shape to a client.
   */
  const withMe = (label: string, fn: (profileId: string) => void) => (): void => {
    const profileId = meId();
    if (!profileId) {
      // This socket never completed a handshake — usually a hello that raced the
      // client's localStorage rehydration, or one sent to an instance that has
      // since restarted. `not-bound` tells the client to retry the handshake and
      // replay this action, so a recoverable race stops looking to the player
      // like "you have no profile".
      fail('Set up your profile to use friends.', 'not-bound');
      return;
    }
    presenceManager.touch(profileId);
    try {
      fn(profileId);
    } catch (err: any) {
      if (err instanceof SocialError) {
        fail(err.message);
        return;
      }
      logger.error(`[SOCIAL] ${label} failed for ${profileId}:`, err?.message);
      fail('Something went wrong. Please try again.');
    }
  };

  // ---- Handshake ----------------------------------------------------------

  /**
   * Bind a verified profile to this socket and hand back the full social state.
   *
   * The secret is checked with the same constant-time `profileManager.verify`
   * the REST writes use. An unverified hello binds nothing, so every subsequent
   * social event fails closed.
   *
   * A rejection is reported as `social:hello-failed` with a reason rather than a
   * generic error, because the two reasons need OPPOSITE client behaviour. A
   * profile this server has never heard of is a dead local identity — the usual
   * cause is a redeploy on a host with an ephemeral filesystem (or `STORE=memory`)
   * wiping the profile store while the browser kept its localStorage copy — and
   * retrying it forever can only fail. The client is told so it can clear the
   * dead identity and let the player create a new one, instead of every social
   * action reporting "Set up your profile to use friends." for good.
   *
   * Existence is already public (`GET /api/profiles/:id` answers 404 vs 200, and
   * ids are visible on profile cards), so separating the two leaks nothing new.
   */
  on('social:hello', guard(socialHelloSchema, ({ profileId, profileSecret }) => {
    const profile = profileManager.getProfile(profileId);
    if (!profile) {
      socket.emit('social:hello-failed', { reason: 'unknown-profile' });
      logger.debug(`[SOCIAL] Hello for unknown profile ${profileId} from socket ${socket.id}`);
      return;
    }
    if (!profileManager.verify(profileId, profileSecret)) {
      socket.emit('social:hello-failed', { reason: 'bad-secret' });
      logger.debug(`[SOCIAL] Hello with bad secret for ${profileId} from socket ${socket.id}`);
      return;
    }

    const cameOnline = presenceManager.bind(socket.id, profileId);
    profileManager.touchLastSeen(profileId);

    // A client that joined its room before saying hello (deep link straight into
    // a lobby) still lands with the right status.
    const roomCode = getRoomCode();
    if (roomCode) presenceManager.setRoom(profileId, roomCode);

    socket.emit('social:snapshot', socialManager.snapshotFor(profileId));
    pushFriendPresence(profileId);

    // Re-deliver anything still live that they would otherwise have missed —
    // an invite sent while they were mid-reconnect.
    for (const invite of socialManager.invitesFor(profileId)) {
      const view = socialManager.inviteView(invite, profileId);
      if (view) socket.emit('social:invite', view);
    }

    broadcastPresence(profileId);
    if (cameOnline) {
      for (const friendId of socialManager.friendIdsOf(profileId)) {
        notify(friendId, 'friend-online', profileId);
      }
    }
    logger.debug(`[SOCIAL] ${profile.displayName}#${profile.tag} bound to socket ${socket.id}`);
  }));

  // ---- Discovery ----------------------------------------------------------

  on('social:search', guard(socialSearchSchema, ({ query, limit }) => {
    withMe('search', (profileId) => {
      const results = socialManager.search(profileId, query, limit ?? SOCIAL_CONFIG.searchLimit);
      // The query rides back so a client that fired two searches can discard the
      // stale response instead of flickering between them.
      socket.emit('social:search-results', { query, results });
    })();
  }));

  /** Lazy-load the expensive half of a profile — only when someone opens it. */
  on('social:inspect', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('inspect', (profileId) => {
      socket.emit('social:profile', socialManager.inspect(profileId, targetId));
    })();
  }));

  // ---- Friend graph -------------------------------------------------------

  on('social:friend-request', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('friend-request', (profileId) => {
      const { affected, autoAccepted } = socialManager.sendRequest(profileId, targetId);
      pushSnapshots(affected);
      if (autoAccepted) {
        // Crossed requests resolve into a friendship — both sides are told they
        // gained a friend rather than one being left with a pending request.
        notify(targetId, 'friend-request-accepted', profileId);
        notify(profileId, 'friend-request-accepted', targetId);
        broadcastPresence(profileId);
        broadcastPresence(targetId);
      } else {
        notify(targetId, 'friend-request-received', profileId);
      }
    })();
  }));

  on('social:friend-accept', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('friend-accept', (profileId) => {
      pushSnapshots(socialManager.acceptRequest(profileId, targetId).affected);
      notify(targetId, 'friend-request-accepted', profileId);
      // Each now sees the other's live presence for the first time.
      broadcastPresence(profileId);
      broadcastPresence(targetId);
    })();
  }));

  on('social:friend-decline', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('friend-decline', (profileId) => {
      pushSnapshots(socialManager.declineRequest(profileId, targetId).affected);
    })();
  }));

  on('social:friend-cancel', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('friend-cancel', (profileId) => {
      pushSnapshots(socialManager.cancelRequest(profileId, targetId).affected);
    })();
  }));

  on('social:friend-remove', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('friend-remove', (profileId) => {
      pushSnapshots(socialManager.removeFriend(profileId, targetId).affected);
    })();
  }));

  on('social:block', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('block', (profileId) => {
      pushSnapshots(socialManager.block(profileId, targetId).affected);
    })();
  }));

  on('social:unblock', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('unblock', (profileId) => {
      pushSnapshots(socialManager.unblock(profileId, targetId).affected);
    })();
  }));

  // ---- Invitations --------------------------------------------------------

  on('social:invite', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('invite', (profileId) => {
      // The room comes from the sender's live presence inside createInvite, so
      // the payload naming a room is impossible by construction.
      const view = socialManager.createInvite(profileId, targetId);
      emitToProfile(targetId, 'social:invite', view);
      notify(targetId, 'invite-received', profileId, view.roomCode);
      socket.emit('social:invite-sent', { toId: targetId, expiresAt: view.expiresAt });
    })();
  }));

  /**
   * Accept an invitation. This resolves a DESTINATION and returns it; the client
   * then runs the ordinary join flow, so `roomManager.joinRoom` remains the one
   * and only authority on seats, spectators and reconnection.
   */
  on('social:invite-accept', guard(socialInviteIdSchema, ({ inviteId }) => {
    withMe('invite-accept', (profileId) => {
      const invite = socialManager.getInvite(inviteId);
      const target = socialManager.acceptInvite(profileId, inviteId);
      socket.emit('social:join-target', { ...target, via: 'invite' });
      // Close the toast on the accepter's side — symmetric with decline.
      socket.emit('social:invite-closed', { inviteId, reason: 'accepted' });
      // `toId` rides back so the sender can clear the "Invited" pill on that
      // friend's card without keeping its own invite-id index.
      if (invite) {
        emitToProfile(invite.fromId, 'social:invite-answered', {
          inviteId, toId: invite.toId, accepted: true,
        });
      }
    })();
  }));

  on('social:invite-decline', guard(socialInviteIdSchema, ({ inviteId }) => {
    withMe('invite-decline', (profileId) => {
      const invite = socialManager.declineInvite(profileId, inviteId);
      socket.emit('social:invite-closed', { inviteId, reason: 'declined' });
      emitToProfile(invite.fromId, 'social:invite-answered', {
        inviteId, toId: invite.toId, accepted: false,
      });
      notify(invite.fromId, 'invite-declined', profileId, invite.roomCode);
    })();
  }));

  // ---- Join a friend ------------------------------------------------------

  /** "Take me to my friend's game" — no room code ever typed by the player. */
  on('social:join-friend', guard(socialTargetSchema, ({ profileId: targetId }) => {
    withMe('join-friend', (profileId) => {
      const target = socialManager.joinFriend(profileId, targetId);
      socket.emit('social:join-target', { ...target, via: 'friend' });
    })();
  }));

  // ---- Privacy ------------------------------------------------------------

  on('social:privacy', guard(socialPrivacySchema, ({ profileSecret, privacy }) => {
    withMe('privacy', (profileId) => {
      socialManager.setPrivacy(profileId, profileSecret, privacy);
      socket.emit('social:snapshot', socialManager.snapshotFor(profileId));
      // Visibility and join permission are baked into the presence projection, so
      // friends need the recomputed view immediately.
      broadcastPresence(profileId);
    })();
  }));
}

/** Diagnostics for `/health`. */
export function socialDiagnostics(): { online: number; invites: number } {
  return { online: presenceManager.getOnlineCount(), invites: socialManager.getInviteCount() };
}

export type { PresenceStatus };
