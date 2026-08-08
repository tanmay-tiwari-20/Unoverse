/**
 * ============================================================================
 *  SocialManager — server-authoritative friend graph, projections, invitations.
 * ============================================================================
 *
 * The single authority for every social mutation. Clients express INTENT
 * ("befriend this id", "invite this friend"); this module decides whether that
 * intent is legal and what the resulting graph looks like. Nothing about the
 * graph is ever accepted from a client, exactly as stats are not.
 *
 * Persistence is free: the graph lives on `Profile.social`, so a mutation is
 * two field writes plus `profileManager.markDirty()`, and the existing
 * write-through flush (memory / file / redis) carries it to disk. There is no
 * second store to keep consistent.
 *
 * Every mutation writes BOTH endpoints inside one synchronous call, so the graph
 * can never be observed half-applied — a request is either pending on both
 * sides or on neither.
 *
 * Structure mirrors RoomManager / ProfileManager (a singleton exported at the
 * bottom) so this module reads like the rest of the codebase.
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { profileManager } from '../profiles/profileManager';
import { roomManager } from '../rooms/roomManager';
import { presenceManager } from './presenceManager';
import { SOCIAL_CONFIG } from '../config/serverConfig';
import type { Profile, PrivacySettings } from '../profiles/profileTypes';
import { winRate } from '../profiles/profileTypes';
import {
  FriendSummary,
  GameInvite,
  InspectedProfile,
  InviteView,
  PlayerSummary,
  RelationshipState,
  RequestSummary,
  SearchResult,
  SocialSnapshot,
} from './socialTypes';

/** Thrown for every rejected social intent. The message is user-facing, so it is
 *  written for a player rather than an operator. */
export class SocialError extends Error {}

/** The set of profile ids a mutation touched, so the gateway knows exactly whose
 *  clients need a fresh snapshot. Keeps push traffic proportional to the change
 *  rather than broadcasting to everyone. */
export interface MutationResult {
  affected: string[];
}

class SocialManager {
  /** Live invitations by id. Runtime-only — an invite is meaningless after a
   *  restart because the room and both sockets are gone. */
  private invites = new Map<string, GameInvite>();
  /** invite id -> expiry timer, so a resolved invite cancels its own timeout. */
  private inviteTimers = new Map<string, NodeJS.Timeout>();
  /** Callback the gateway installs to deliver an expiry to the recipient. */
  private onInviteExpired: ((invite: GameInvite) => void) | null = null;

  // =========================================================================
  //  Graph reads
  // =========================================================================

  private require(id: string): Profile {
    const p = profileManager.getProfile(id);
    if (!p) throw new SocialError('That player no longer exists.');
    return p;
  }

  /**
   * Canonical Player ID for a caller-supplied reference.
   *
   * A client that has not refreshed since the Player ID migration may still hold
   * a legacy id, and `getProfile()` accepts it. But every id we STORE in an edge
   * or COMPARE against a stored one has to be the profile's own permanent Player
   * ID, or the same person ends up on both sides of the graph under two names.
   * Unknown references pass through untouched so the caller's own existence guard
   * still produces its message.
   */
  private canon(ref: string): string {
    return profileManager.resolveId(ref) ?? ref;
  }

  public areFriends(a: string, b: string): boolean {
    const pa = profileManager.getProfile(a);
    const bId = this.canon(b);
    return !!pa && pa.social.friends.some((f) => f.id === bId);
  }

  /** Ids of everyone this profile is friends with. The fan-out set for a
   *  presence broadcast — bounded by `SOCIAL_CONFIG.maxFriends`. */
  public friendIdsOf(profileId: string): string[] {
    const p = profileManager.getProfile(profileId);
    return p ? p.social.friends.map((f) => f.id) : [];
  }

  public hasBlocked(ownerId: string, otherId: string): boolean {
    const p = profileManager.getProfile(ownerId);
    return !!p && p.social.blocked.includes(this.canon(otherId));
  }

  /** How `viewerId` is related to `subjectId`. Block state wins over everything
   *  else so a blocked pair can never be offered a friend action. */
  public relationship(viewerId: string | null, subjectId: string): RelationshipState {
    if (!viewerId) return 'none';
    const viewer = profileManager.getProfile(viewerId);
    if (!viewer) return 'none';
    // Compare canonical ids: a viewer holding a legacy id for themselves is still
    // themselves, and must not be offered a friend button pointing at their own
    // profile.
    const subject = this.canon(subjectId);
    if (viewer.id === subject) return 'self';
    if (viewer.social.blocked.includes(subject)) return 'blocked';
    if (this.hasBlocked(subject, viewer.id)) return 'blocked-by';
    if (viewer.social.friends.some((f) => f.id === subject)) return 'friends';
    if (viewer.social.outgoing.some((r) => r.id === subject)) return 'request-sent';
    if (viewer.social.incoming.some((r) => r.id === subject)) return 'request-received';
    return 'none';
  }

  /**
   * Whether `viewerId` may send `subjectId` a friend request right now.
   * Centralized so the button state the client renders and the gate the mutation
   * enforces are literally the same predicate — the UI can never offer an action
   * the server would refuse.
   */
  public canSendRequest(viewerId: string | null, subjectId: string): boolean {
    if (!viewerId) return false;
    const viewer = profileManager.getProfile(viewerId);
    const subject = profileManager.getProfile(subjectId);
    if (!viewer || !subject || viewer.id === subject.id) return false;
    const rel = this.relationship(viewer.id, subject.id);
    if (rel !== 'none') return false;

    switch (subject.privacy.friendRequests) {
      case 'nobody':
        return false;
      case 'friends-of-friends':
        // One shared friend is enough. Both lists are small and in memory, so
        // this is a set intersection, not a graph traversal.
        return this.hasMutualFriend(viewerId, subjectId);
      default:
        return true;
    }
  }

  private hasMutualFriend(a: string, b: string): boolean {
    const pa = profileManager.getProfile(a);
    const pb = profileManager.getProfile(b);
    if (!pa || !pb) return false;
    const mine = new Set(pa.social.friends.map((f) => f.id));
    return pb.social.friends.some((f) => mine.has(f.id));
  }

  // =========================================================================
  //  Projections (what crosses the wire)
  // =========================================================================

  /**
   * Compact identity card for one player, as seen BY a viewer. The viewer
   * matters because privacy hides the outfit and live presence from
   * non-friends.
   */
  public summaryOf(subjectId: string, viewerId: string | null): PlayerSummary | null {
    const subject = profileManager.getProfile(subjectId);
    if (!subject) return null;
    const viewer = viewerId ? this.canon(viewerId) : null;
    const isFriend = !!viewer && (viewer === subject.id || this.areFriends(viewer, subject.id));
    const showOutfit = subject.privacy.showOutfit !== false || isFriend;
    return {
      profileId: subject.id,
      displayName: subject.displayName,
      tag: subject.tag,
      avatarUrl: subject.avatarUrl,
      outfit: showOutfit ? subject.outfit : null,
      presence: presenceManager.viewFor(subject.id, isFriend),
    };
  }

  /**
   * The viewer's whole social state. Rebuilt from the graph on demand rather
   * than cached — the inputs (names, avatars, presence) change independently of
   * the graph, and a cache would be one more thing that can go stale.
   */
  public snapshotFor(viewerId: string): SocialSnapshot {
    const me = this.require(viewerId);

    const friends: FriendSummary[] = [];
    for (const link of me.social.friends) {
      const s = this.summaryOf(link.id, me.id);
      if (s) friends.push({ ...s, since: link.since });
    }
    // Online first, then by status weight, then alphabetical — the ordering a
    // player actually wants: who can I play with right now?
    const weight: Record<string, number> = { playing: 0, lobby: 1, watching: 2, online: 3, away: 4, offline: 5 };
    friends.sort(
      (a, b) =>
        (weight[a.presence.status] ?? 9) - (weight[b.presence.status] ?? 9) ||
        a.displayName.localeCompare(b.displayName)
    );

    const mapRequests = (list: { id: string; at: number }[]): RequestSummary[] => {
      const out: RequestSummary[] = [];
      for (const r of list) {
        const s = this.summaryOf(r.id, me.id);
        if (s) out.push({ ...s, at: r.at });
      }
      return out.sort((a, b) => b.at - a.at); // newest first
    };

    const blocked: PlayerSummary[] = [];
    for (const id of me.social.blocked) {
      const s = this.summaryOf(id, me.id);
      if (s) blocked.push(s);
    }

    return {
      friends,
      incoming: mapRequests(me.social.incoming),
      outgoing: mapRequests(me.social.outgoing),
      blocked,
      privacy: me.privacy,
    };
  }

  /**
   * Detailed profile view for the inspect modal, with the SUBJECT's privacy
   * applied server-side. Withheld fields are reported in `hidden` so the client
   * can say "hidden" instead of rendering a misleading zero.
   */
  public inspect(viewerId: string | null, subjectId: string): InspectedProfile {
    const subject = this.require(subjectId);
    const viewer = viewerId ? this.canon(viewerId) : null;
    const isSelf = viewer === subject.id;
    const isFriend = isSelf || (!!viewer && this.areFriends(viewer, subject.id));
    const privacy = subject.privacy;

    // Self and friends always see everything; privacy gates non-friends only.
    const hideHistory = !isFriend && privacy.showMatchHistory === false;
    const hideOutfit = !isFriend && privacy.showOutfit === false;
    const hideOnline = !isFriend && privacy.showOnlineStatus === false;

    const recentMatches = hideHistory ? [] : subject.recentMatches;

    return {
      profileId: subject.id,
      displayName: subject.displayName,
      tag: subject.tag,
      avatarUrl: subject.avatarUrl,
      outfit: hideOutfit ? null : subject.outfit,
      createdAt: subject.createdAt,
      lastSeenAt: subject.lastSeenAt,
      totalPlayTimeMs: subject.totalPlayTimeMs,
      stats: subject.stats,
      winRate: winRate(subject.stats),
      friendCount: subject.social.friends.length,
      recentMatches,
      favoriteArena: this.favoriteArena(recentMatches),
      presence: presenceManager.viewFor(subject.id, isFriend),
      relationship: this.relationship(viewer, subject.id),
      canSendRequest: this.canSendRequest(viewer, subject.id),
      hidden: { matchHistory: hideHistory, outfit: hideOutfit, onlineStatus: hideOnline },
    };
  }

  /** Most-played arena across the records the viewer can see. Null when history
   *  is empty or predates arena recording. */
  private favoriteArena(matches: { arena?: string | null }[]): string | null {
    const counts = new Map<string, number>();
    for (const m of matches) {
      if (!m.arena) continue;
      counts.set(m.arena, (counts.get(m.arena) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [arena, count] of counts) {
      if (count > bestCount) {
        best = arena;
        bestCount = count;
      }
    }
    return best;
  }

  /**
   * Search players by username, `Name#TAG`, bare tag, or Player ID. Results
   * carry the viewer's relationship so a result row renders its correct action
   * without a follow-up round trip.
   *
   * Players who have blocked the viewer (or whom the viewer has blocked) are
   * omitted entirely — search must not be a way to observe someone who has
   * opted out of you.
   */
  public search(viewerId: string | null, query: string, limit = SOCIAL_CONFIG.searchLimit): SearchResult[] {
    const hits = profileManager.searchProfiles(query, limit + 5);
    const viewer = viewerId ? this.canon(viewerId) : null;
    const out: SearchResult[] = [];
    for (const p of hits) {
      if (viewer && p.id !== viewer) {
        if (this.hasBlocked(p.id, viewer) || this.hasBlocked(viewer, p.id)) continue;
      }
      const summary = this.summaryOf(p.id, viewer);
      if (!summary) continue;
      out.push({ ...summary, relationship: this.relationship(viewer, p.id) });
      if (out.length >= limit) break;
    }
    return out;
  }

  // =========================================================================
  //  Graph mutations
  // =========================================================================

  private save(...profiles: Profile[]): void {
    const now = Date.now();
    for (const p of profiles) {
      p.updatedAt = now;
      profileManager.markDirty(p.id);
    }
  }

  /**
   * Send a friend request. Idempotent-by-rejection: a duplicate request, a
   * self-request, or a request to an existing friend is refused with a message
   * rather than silently creating a second edge.
   *
   * If the target already sent US a request, this becomes an ACCEPT — the
   * natural behavior when two people add each other at the same time, and the
   * only way to avoid a pair of crossed pending requests that neither can
   * resolve.
   */
  public sendRequest(fromId: string, toId: string): MutationResult & { autoAccepted: boolean } {
    const from = this.require(fromId);
    const to = this.require(toId);
    // From here down, only the profiles' own Player IDs are used. The caller's
    // strings may be legacy aliases, and an edge written from one of those would
    // never match the edge written from the other side.
    if (from.id === to.id) throw new SocialError('You cannot add yourself as a friend.');

    if (from.social.blocked.includes(to.id)) {
      throw new SocialError('You have blocked this player. Unblock them first.');
    }
    if (to.social.blocked.includes(from.id)) {
      // Deliberately vague: confirming a block would leak it to the blocked user.
      throw new SocialError('This player is not accepting friend requests.');
    }
    if (from.social.friends.some((f) => f.id === to.id)) {
      throw new SocialError('You are already friends with this player.');
    }
    if (from.social.outgoing.some((r) => r.id === to.id)) {
      throw new SocialError('You already have a pending request to this player.');
    }

    // Crossed requests resolve into a friendship rather than a deadlock.
    if (from.social.incoming.some((r) => r.id === to.id)) {
      const result = this.acceptRequest(from.id, to.id);
      return { ...result, autoAccepted: true };
    }

    if (to.privacy.friendRequests === 'nobody') {
      throw new SocialError('This player is not accepting friend requests.');
    }
    if (to.privacy.friendRequests === 'friends-of-friends' && !this.hasMutualFriend(from.id, to.id)) {
      throw new SocialError('This player only accepts requests from friends of friends.');
    }
    if (from.social.outgoing.length >= SOCIAL_CONFIG.maxOutgoingRequests) {
      throw new SocialError('You have too many pending friend requests. Cancel a few first.');
    }
    if (from.social.friends.length >= SOCIAL_CONFIG.maxFriends) {
      throw new SocialError('Your friends list is full.');
    }

    const at = Date.now();
    from.social.outgoing.push({ id: to.id, at });
    to.social.incoming.push({ id: from.id, at });
    // Bound the receiver's inbox: the oldest pending request is dropped (and its
    // matching outgoing edge with it) so neither side keeps a dangling half-edge.
    while (to.social.incoming.length > SOCIAL_CONFIG.maxIncomingRequests) {
      const dropped = to.social.incoming.shift()!;
      const sender = profileManager.getProfile(dropped.id);
      if (sender) {
        sender.social.outgoing = sender.social.outgoing.filter((r) => r.id !== to.id);
        this.save(sender);
      }
    }

    this.save(from, to);
    logger.debug(`[SOCIAL] Friend request ${from.displayName} #${from.id} -> ${to.displayName} #${to.id}`);
    return { affected: [from.id, to.id], autoAccepted: false };
  }

  /** Accept a pending incoming request. Creates the mutual friendship and clears
   *  the pending edges on both sides. */
  public acceptRequest(meId: string, otherId: string): MutationResult {
    const me = this.require(meId);
    const other = this.require(otherId);

    if (!me.social.incoming.some((r) => r.id === other.id)) {
      throw new SocialError('That friend request is no longer available.');
    }
    if (me.social.friends.length >= SOCIAL_CONFIG.maxFriends) {
      throw new SocialError('Your friends list is full.');
    }
    if (other.social.friends.length >= SOCIAL_CONFIG.maxFriends) {
      throw new SocialError("That player's friends list is full.");
    }

    this.clearPending(me, other);

    const since = Date.now();
    if (!me.social.friends.some((f) => f.id === other.id)) me.social.friends.push({ id: other.id, since });
    if (!other.social.friends.some((f) => f.id === me.id)) other.social.friends.push({ id: me.id, since });

    this.save(me, other);
    logger.debug(`[SOCIAL] Friendship formed: ${me.displayName} #${me.id} <-> ${other.displayName} #${other.id}`);
    return { affected: [me.id, other.id] };
  }

  /** Decline an incoming request (recipient side). */
  public declineRequest(meId: string, otherId: string): MutationResult {
    const me = this.require(meId);
    const other = this.require(otherId);
    if (!me.social.incoming.some((r) => r.id === other.id)) {
      throw new SocialError('That friend request is no longer available.');
    }
    this.clearPending(me, other);
    this.save(me, other);
    return { affected: [me.id, other.id] };
  }

  /** Cancel an outgoing request (sender side). */
  public cancelRequest(meId: string, otherId: string): MutationResult {
    const me = this.require(meId);
    const other = this.require(otherId);
    if (!me.social.outgoing.some((r) => r.id === other.id)) {
      throw new SocialError('That request has already been resolved.');
    }
    this.clearPending(me, other);
    this.save(me, other);
    return { affected: [me.id, other.id] };
  }

  /** Remove an established friendship (both directions). */
  public removeFriend(meId: string, otherId: string): MutationResult {
    const me = this.require(meId);
    const other = this.require(otherId);
    if (!me.social.friends.some((f) => f.id === other.id)) {
      throw new SocialError('You are not friends with this player.');
    }
    me.social.friends = me.social.friends.filter((f) => f.id !== other.id);
    other.social.friends = other.social.friends.filter((f) => f.id !== me.id);
    this.save(me, other);
    logger.debug(`[SOCIAL] Friendship removed: ${me.displayName} #${me.id} -x- ${other.displayName} #${other.id}`);
    return { affected: [me.id, other.id] };
  }

  /**
   * Block a player: severs any friendship, drops pending requests in BOTH
   * directions, and records the block. Every gate above already consults
   * `blocked`, so this one method is the whole enforcement story.
   */
  public block(meId: string, otherId: string): MutationResult {
    const me = this.require(meId);
    const other = this.require(otherId);
    if (me.id === other.id) throw new SocialError('You cannot block yourself.');

    me.social.friends = me.social.friends.filter((f) => f.id !== other.id);
    other.social.friends = other.social.friends.filter((f) => f.id !== me.id);
    this.clearPending(me, other);
    this.clearPending(other, me);
    if (!me.social.blocked.includes(other.id)) me.social.blocked.push(other.id);

    // Any live invitation between the pair is void the moment a block lands.
    this.dropInvitesBetween(me.id, other.id);

    this.save(me, other);
    return { affected: [me.id, other.id] };
  }

  public unblock(meId: string, otherId: string): MutationResult {
    const me = this.require(meId);
    const other = this.canon(otherId);
    if (!me.social.blocked.includes(other)) return { affected: [me.id] };
    me.social.blocked = me.social.blocked.filter((id) => id !== other);
    this.save(me);
    return { affected: [me.id, other] };
  }

  /** Drop the pending request edges between two profiles, in both directions.
   *  Mutates in place; the caller persists. */
  private clearPending(a: Profile, b: Profile): void {
    a.social.incoming = a.social.incoming.filter((r) => r.id !== b.id);
    a.social.outgoing = a.social.outgoing.filter((r) => r.id !== b.id);
    b.social.incoming = b.social.incoming.filter((r) => r.id !== a.id);
    b.social.outgoing = b.social.outgoing.filter((r) => r.id !== a.id);
  }

  /** Update privacy (secret-authenticated at the socket boundary). */
  public setPrivacy(meId: string, secret: string, patch: Partial<PrivacySettings>): PrivacySettings {
    return profileManager.setPrivacy(meId, secret, patch);
  }

  // =========================================================================
  //  Invitations
  // =========================================================================

  /** Install the expiry callback (the gateway owns delivery). */
  public setInviteExpiryHandler(fn: (invite: GameInvite) => void): void {
    this.onInviteExpired = fn;
  }

  /**
   * Invite a friend to the room the sender is currently in.
   *
   * The room code is taken from PRESENCE, not from the client payload — a client
   * cannot invite someone into a room it is not actually in.
   */
  public createInvite(fromId: string, toId: string): InviteView {
    const from = this.require(fromId);
    const to = this.require(toId);
    if (from.id === to.id) throw new SocialError('You cannot invite yourself.');

    if (!this.areFriends(from.id, to.id)) {
      throw new SocialError('You can only invite friends.');
    }
    if (this.hasBlocked(to.id, from.id) || this.hasBlocked(from.id, to.id)) {
      throw new SocialError('You cannot invite this player.');
    }
    if (!presenceManager.isOnline(to.id)) {
      throw new SocialError('That friend is offline right now.');
    }

    const roomCode = presenceManager.roomOf(from.id);
    if (!roomCode) throw new SocialError('You need to be in a room before you can invite someone.');
    const room = roomManager.getRoom(roomCode);
    if (!room) throw new SocialError('Your room no longer exists.');

    const mine = [...this.invites.values()].filter((i) => i.fromId === from.id);
    if (mine.length >= SOCIAL_CONFIG.maxOutgoingInvites) {
      throw new SocialError('You have too many pending invites. Wait for them to expire.');
    }
    // One live invite per (sender, recipient, room) — re-inviting refreshes the
    // existing one instead of stacking duplicate popups on the recipient.
    for (const existing of mine) {
      if (existing.toId === to.id && existing.roomCode === room.code) {
        this.cancelInvite(existing.id);
        break;
      }
    }

    const now = Date.now();
    const invite: GameInvite = {
      id: randomUUID(),
      fromId: from.id,
      toId: to.id,
      roomCode: room.code,
      createdAt: now,
      expiresAt: now + SOCIAL_CONFIG.inviteTtlMs,
    };
    this.invites.set(invite.id, invite);
    const timer = setTimeout(() => {
      this.invites.delete(invite.id);
      this.inviteTimers.delete(invite.id);
      this.onInviteExpired?.(invite);
    }, SOCIAL_CONFIG.inviteTtlMs);
    timer.unref?.();
    this.inviteTimers.set(invite.id, timer);

    logger.debug(`[SOCIAL] Invite ${from.displayName} #${from.id} -> #${to.id} for room ${room.code}`);
    return this.inviteView(invite, to.id)!;
  }

  /** Resolve an invite into the shape the recipient renders. */
  public inviteView(invite: GameInvite, viewerId: string): InviteView | null {
    const from = this.summaryOf(invite.fromId, viewerId);
    if (!from) return null;
    const room = roomManager.getRoom(invite.roomCode);
    return {
      id: invite.id,
      from,
      roomCode: invite.roomCode,
      arena: room?.arena ?? null,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
    };
  }

  public getInvite(id: string): GameInvite | undefined {
    return this.invites.get(id);
  }

  /** Remove an invite and cancel its expiry timer. */
  public cancelInvite(id: string): GameInvite | undefined {
    const invite = this.invites.get(id);
    if (!invite) return undefined;
    this.invites.delete(id);
    const timer = this.inviteTimers.get(id);
    if (timer) clearTimeout(timer);
    this.inviteTimers.delete(id);
    return invite;
  }

  /** Void every live invite between two players (used when a block lands). */
  private dropInvitesBetween(a: string, b: string): void {
    for (const invite of [...this.invites.values()]) {
      const between =
        (invite.fromId === a && invite.toId === b) || (invite.fromId === b && invite.toId === a);
      if (between) this.cancelInvite(invite.id);
    }
  }

  /** Every live invite addressed to a player (re-sent when they reconnect). */
  public invitesFor(toId: string): GameInvite[] {
    const me = this.canon(toId);
    return [...this.invites.values()].filter((i) => i.toId === me);
  }

  /**
   * Accept an invitation: validate it still belongs to this player and that its
   * room can still take them, then hand back the join target.
   *
   * This does NOT join the room. It resolves a destination; the client then runs
   * the ordinary join flow, so the socket join gate stays the one and only
   * authority on seats, spectators and reconnection.
   */
  public acceptInvite(meId: string, inviteId: string): { roomCode: string; asSpectator: boolean } {
    const me = this.canon(meId);
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== me) {
      throw new SocialError('That invite has expired.');
    }
    this.cancelInvite(inviteId);
    return this.resolveJoinTarget(me, invite.roomCode);
  }

  /** Decline an invitation. Returns the sender so they can be told. */
  public declineInvite(meId: string, inviteId: string): GameInvite {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== this.canon(meId)) {
      throw new SocialError('That invite has expired.');
    }
    this.cancelInvite(inviteId);
    return invite;
  }

  // =========================================================================
  //  Join a friend
  // =========================================================================

  /**
   * Resolve "take me to my friend's game" into a room code — no room code ever
   * typed, and no privacy bypassed.
   *
   * Capacity is evaluated with `roomManager.getCapacityInfo`, the SAME helper
   * the socket join gate and the REST pre-check use, and the refusal messages
   * are the room layer's own. This is deliberately a *pre-check that mirrors*
   * the join gate rather than a second implementation of it: the authoritative
   * decision still happens in `roomManager.joinRoom` when the client actually
   * joins, so the two can disagree only by the client being told "no" a moment
   * early — never by it being let in when it should not be.
   */
  public resolveJoinTarget(meId: string, roomCode: string): { roomCode: string; asSpectator: boolean } {
    const room = roomManager.getRoom(roomCode);
    if (!room) throw new SocialError('That room no longer exists.');

    const me = this.canon(meId);
    const capacity = roomManager.getCapacityInfo(room);
    // A lobby still holding bots has a seat: joinRoom hands a bot's seat to an
    // arriving human, so don't tell them they'll be a spectator.
    const botSeatAvailable = room.status === 'lobby' && room.players.some((p) => p.isBot);
    const seatAvailable = room.status === 'lobby' && (!capacity.isFull || botSeatAvailable);

    // Already seated in this room under this profile — a rejoin, always allowed.
    // Matched on Player ID, never on name: two players called "Tanmay" in one
    // room are two different people and only one of them is us.
    const alreadyIn =
      room.players.some((p) => !!p.profileId && p.profileId === me) ||
      presenceManager.roomOf(me) === room.code;
    if (alreadyIn) return { roomCode: room.code, asSpectator: false };

    if (seatAvailable) return { roomCode: room.code, asSpectator: false };

    // No seat: the match is running, or every seat is taken. Spectating is the
    // fallback — subject to the host's own rules, quoted verbatim.
    if (room.houseRules?.spectatorMode === false) {
      throw new SocialError('This table is full and spectating is disabled.');
    }
    if (capacity.spectatorsFull) {
      throw new SocialError('This room is completely full — all player seats and spectator slots are taken.');
    }
    return { roomCode: room.code, asSpectator: true };
  }

  /** "Join my friend" by profile id — friendship + privacy checked, then the
   *  same capacity resolution as an invite. */
  public joinFriend(meId: string, friendId: string): { roomCode: string; asSpectator: boolean } {
    const me = this.canon(meId);
    const friend = this.require(friendId);
    if (me === friend.id) throw new SocialError('You cannot join yourself.');
    if (!this.areFriends(me, friend.id)) throw new SocialError('You can only join friends.');

    if (friend.privacy.allowFriendJoin === false) {
      throw new SocialError('This player does not allow friends to join their games.');
    }
    if (this.hasBlocked(friend.id, me)) throw new SocialError('You cannot join this player.');

    const roomCode = presenceManager.roomOf(friend.id);
    if (!roomCode) throw new SocialError('That friend is not in a game right now.');
    return this.resolveJoinTarget(me, roomCode);
  }

  // =========================================================================
  //  Diagnostics
  // =========================================================================

  public getInviteCount(): number {
    return this.invites.size;
  }
}

export const socialManager = new SocialManager();
