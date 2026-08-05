/**
 * ============================================================================
 *  PresenceManager — who is online, and what are they doing right now.
 * ============================================================================
 *
 * Presence is derived, never declared. A client cannot tell the server "I am
 * playing"; the server knows because it holds the socket AND owns the room the
 * socket is in. That makes presence exactly as trustworthy as the room state it
 * is read from, and impossible to spoof.
 *
 * Storage is deliberately in-memory only: presence has no meaning across a
 * restart (every socket is gone), so persisting it would only create stale
 * "online" ghosts to clean up. Durable identity stays on the profile;
 * `lastSeenAt` there covers the offline case.
 *
 * One profile may hold SEVERAL sockets (two tabs, phone + desktop). The entry is
 * keyed by profileId and reference-counts its sockets, so closing one tab while
 * another is open does not flap a friend offline and back online.
 *
 * Reads room state through RoomManager but is never read BY it — gameplay has no
 * dependency on the social layer.
 */

import { roomManager } from '../rooms/roomManager';
import { profileManager } from '../profiles/profileManager';
import { PresenceStatus, PresenceView, offlinePresence } from './socialTypes';
import { SOCIAL_CONFIG } from '../config/serverConfig';

interface PresenceEntry {
  /** Live socket ids for this profile (multi-tab / multi-device). */
  sockets: Set<string>;
  /** Room the player is currently in, or null when idle in the menus. */
  roomCode: string | null;
  /** Epoch ms the current status began (drives "online for" / "last seen"). */
  since: number;
  /** Epoch ms of the last meaningful action, for away detection. */
  lastActiveAt: number;
  /** Last status we broadcast, so the gateway can diff and skip no-op sends. */
  broadcastStatus: PresenceStatus;
}

class PresenceManager {
  private byProfile = new Map<string, PresenceEntry>();
  private bySocket = new Map<string, string>();
  /**
   * Reverse index roomCode -> profileIds, maintained alongside `setRoom`.
   *
   * Room membership is tracked HERE rather than read back from `Room` because a
   * room only carries `profileId` on seated players — spectators are identified
   * by socket. Presence knows the profile behind every socket, so this index
   * covers players and spectators uniformly, which is exactly what a "everyone
   * in this room just changed status" refresh needs.
   */
  private byRoom = new Map<string, Set<string>>();

  // ---- Socket lifecycle ----------------------------------------------------

  /**
   * Attach a verified profile to a socket. Returns true when this made the
   * profile newly online (first socket), which is the signal to notify friends.
   */
  public bind(socketId: string, profileId: string): boolean {
    const previous = this.bySocket.get(socketId);
    if (previous && previous !== profileId) this.unbind(socketId);
    this.bySocket.set(socketId, profileId);

    const existing = this.byProfile.get(profileId);
    if (existing) {
      existing.sockets.add(socketId);
      existing.lastActiveAt = Date.now();
      return false;
    }
    const now = Date.now();
    this.byProfile.set(profileId, {
      sockets: new Set([socketId]),
      roomCode: null,
      since: now,
      lastActiveAt: now,
      broadcastStatus: 'online',
    });
    return true;
  }

  /**
   * Detach a socket. Returns the profileId when that was its LAST socket (the
   * profile just went offline), otherwise null.
   */
  public unbind(socketId: string): string | null {
    const profileId = this.bySocket.get(socketId);
    if (!profileId) return null;
    this.bySocket.delete(socketId);

    const entry = this.byProfile.get(profileId);
    if (!entry) return null;
    entry.sockets.delete(socketId);
    if (entry.sockets.size > 0) return null;

    this.byProfile.delete(profileId);
    if (entry.roomCode) this.dropFromRoom(entry.roomCode, profileId);
    // Stamp last-seen so friends see an accurate "3m ago" immediately.
    profileManager.touchLastSeen(profileId);
    return profileId;
  }

  /** The profile bound to a socket, if any. */
  public profileForSocket(socketId: string): string | null {
    return this.bySocket.get(socketId) ?? null;
  }

  /** Every live socket id for a profile (targets for a direct emit). */
  public socketsFor(profileId: string): string[] {
    const entry = this.byProfile.get(profileId);
    return entry ? [...entry.sockets] : [];
  }

  public isOnline(profileId: string): boolean {
    return this.byProfile.has(profileId);
  }

  // ---- Activity ------------------------------------------------------------

  /** Record which room a profile is in (null when they leave). Idempotent. */
  public setRoom(profileId: string, roomCode: string | null): void {
    const entry = this.byProfile.get(profileId);
    if (!entry) return;
    const next = roomCode ? roomCode.toUpperCase() : null;
    if (entry.roomCode === next) {
      entry.lastActiveAt = Date.now();
      return;
    }
    if (entry.roomCode) this.dropFromRoom(entry.roomCode, profileId);
    entry.roomCode = next;
    entry.since = Date.now();
    entry.lastActiveAt = entry.since;
    if (next) {
      const members = this.byRoom.get(next) ?? new Set<string>();
      members.add(profileId);
      this.byRoom.set(next, members);
    }
  }

  /** Remove a profile from the reverse room index, dropping the room when empty. */
  private dropFromRoom(roomCode: string, profileId: string): void {
    const members = this.byRoom.get(roomCode);
    if (!members) return;
    members.delete(profileId);
    if (members.size === 0) this.byRoom.delete(roomCode);
  }

  /** Every online profile currently in a room — players AND spectators. */
  public profilesInRoom(roomCode: string): string[] {
    const members = this.byRoom.get(roomCode.toUpperCase());
    return members ? [...members] : [];
  }

  /** Reset the away clock. Called on any deliberate client action. */
  public touch(profileId: string): void {
    const entry = this.byProfile.get(profileId);
    if (entry) entry.lastActiveAt = Date.now();
  }

  /** The room a profile is currently in, or null. */
  public roomOf(profileId: string): string | null {
    return this.byProfile.get(profileId)?.roomCode ?? null;
  }

  // ---- Derivation ----------------------------------------------------------

  /**
   * The player's true status, computed fresh from the live room. Nothing is
   * cached, so a room starting its match instantly changes every seated
   * player's status without any per-player bookkeeping.
   */
  public statusOf(profileId: string): PresenceStatus {
    const entry = this.byProfile.get(profileId);
    if (!entry) return 'offline';

    if (entry.roomCode) {
      const room = roomManager.getRoom(entry.roomCode);
      if (room) {
        const seated = room.players.some((p) => p.profileId === profileId);
        if (room.status === 'playing') return seated ? 'playing' : 'watching';
        return 'lobby';
      }
      // Room vanished under us (swept / destroyed) — fall through to online.
    }

    return Date.now() - entry.lastActiveAt >= SOCIAL_CONFIG.awayAfterMs ? 'away' : 'online';
  }

  /** Read the status we last told friends about (for diffing). */
  public lastBroadcastStatus(profileId: string): PresenceStatus {
    return this.byProfile.get(profileId)?.broadcastStatus ?? 'offline';
  }

  /** Remember what we just broadcast, so unchanged presence is not re-sent. */
  public rememberBroadcast(profileId: string, status: PresenceStatus): void {
    const entry = this.byProfile.get(profileId);
    if (entry) entry.broadcastStatus = status;
  }

  /**
   * Build the presence a specific VIEWER is allowed to see.
   *
   * Privacy is applied here, at the projection boundary:
   *   - `showOnlineStatus: false` hides live status from NON-friends entirely
   *     (they always see Offline with no last-seen). Friends still see it —
   *     a friends list whose friends all read "offline" is not a feature.
   *   - `allowFriendJoin: false` withholds the room code, so no Join button is
   *     ever offered, even to friends.
   *
   * Joinability mirrors the room layer's own capacity rules by asking
   * `roomManager.getCapacityInfo` — the SAME helper the join gate and the REST
   * pre-check use — so the friend card can never advertise a join the room
   * would refuse.
   */
  public viewFor(subjectId: string, isFriend: boolean): PresenceView {
    const subject = profileManager.getProfile(subjectId);
    const lastSeenAt = subject?.lastSeenAt ?? 0;

    if (subject && subject.privacy.showOnlineStatus === false && !isFriend) {
      return offlinePresence(subjectId, 0);
    }

    const entry = this.byProfile.get(subjectId);
    if (!entry) return offlinePresence(subjectId, lastSeenAt);

    const status = this.statusOf(subjectId);
    const view: PresenceView = {
      profileId: subjectId,
      status,
      roomCode: null,
      arena: null,
      joinAsSpectator: false,
      joinable: false,
      since: entry.since,
      lastSeenAt,
    };

    // The room code is a capability, not a display field: handing it out is what
    // makes Join possible. Only friends get it, and only when allowed.
    const allowJoin = isFriend && subject?.privacy.allowFriendJoin !== false;
    if (!entry.roomCode || !allowJoin) return view;

    const room = roomManager.getRoom(entry.roomCode);
    if (!room) return view;

    const capacity = roomManager.getCapacityInfo(room);
    const seatAvailable =
      room.status === 'lobby' &&
      (!capacity.isFull || room.players.some((p) => p.isBot));
    const spectatingAllowed =
      room.houseRules?.spectatorMode !== false && !capacity.spectatorsFull;

    view.roomCode = room.code;
    view.arena = room.arena ?? null;
    view.joinAsSpectator = !seatAvailable;
    view.joinable = seatAvailable || spectatingAllowed;
    return view;
  }

  /** Every profile currently holding at least one socket. */
  public onlineProfileIds(): string[] {
    return [...this.byProfile.keys()];
  }

  /** Diagnostics. */
  public getOnlineCount(): number {
    return this.byProfile.size;
  }
}

export const presenceManager = new PresenceManager();
