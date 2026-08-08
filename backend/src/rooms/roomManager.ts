import { randomUUID } from 'crypto';
import { UnoGameState } from '../game/gameState';
import { startGameState } from '../game/actions';
import { getNextActivePlayerId } from '../game/turnManager';
import { calculateRoundPoints, handPoints, DEFAULT_TARGET_SCORE } from '../game/scoring';
import { HouseRules, DEFAULT_HOUSE_RULES, normalizeHouseRules } from '../game/houseRules';
import { ArenaId, resolveSelection, resolveArena } from './arenas';
import { logger } from '../utils/logger';
import { RoomStore, MemoryRoomStore } from './roomStore';
import { pickBotName } from '../bots/botNames';
import { profileManager } from '../profiles/profileManager';
import { MatchRecord, MatchPlayerRecord, emptyRoundDelta, sanitizeDisplayName } from '../profiles/profileTypes';
import { PROFILE_CONFIG } from '../config/serverConfig';

export interface Player {
  id: string; // Socket ID (or a synthetic `bot:` id for server-side bots)
  /**
   * Stable SEAT identity, minted server-side when the seat is taken and unchanged
   * for as long as the seat is held — across reconnects, renames and restarts.
   *
   * This is what room-scoped bookkeeping keys on (match scores, disconnect
   * timers): the socket `id` churns on every reconnect, and `name` is a label two
   * players may share, so neither can carry the score. It is NOT a player
   * identity — `profileId` is; a seat handle is meaningless outside its room, and
   * bots and profile-less guests need one too. Safe to broadcast (unlike
   * `secret`, which is also seat-stable but private).
   */
  uid: string;
  name: string;
  seatNumber: number; // 1 to maxPlayers (house rule; default 6)
  isHost: boolean;
  secret: string; // Private per-session token. Never broadcast to other clients.
  // Server-side bot flag. Bots occupy player seats and play through the same
  // rules engine as humans, but have no socket, never host, never spectate,
  // never join voice chat and never chat.
  isBot?: boolean;
  // Persistent-profile identity carried ALONGSIDE the ephemeral socket id, never
  // replacing it. Attached on join when the client presents a verified profile.
  // profileId keys server-authoritative stats; tag/avatar are display data safe
  // to broadcast (the profile's private secret is NEVER stored on the Player).
  profileId?: string;
  tag?: string;
  avatar?: string | null;
  // Cosmetic outfit (skin) key — purely visual, broadcast to all clients so
  // everyone sees the same look. Carried on the profile identity like `avatar`.
  outfit?: string | null;
}

/** Room discoverability. Public rooms are matched by Quick Play; private rooms
 *  (the default, preserving existing behavior) require an invite link/code. */
export type RoomVisibility = 'public' | 'private';

export interface Spectator {
  id: string; // Socket ID
  /** Stable slot identity — the spectator analog of `Player.uid`. */
  uid: string;
  name: string;
  secret: string; // Private per-session token. Never broadcast to other clients.
  /** Verified persistent-profile identity, when one was presented on join. */
  profileId?: string;
}

/** One completed round's result, kept for the end-of-round summary UI. */
export interface RoundResult {
  round: number;
  /** Seat that won the round — the identity half. Optional only for results
   *  persisted before seat uids existed. */
  winnerUid?: string;
  /** The winner's display name at the time. DISPLAY ONLY: two players may share
   *  it, so never match on this to decide who won. */
  winnerName: string;
  pointsAwarded: number;
}

/** One seat's running total in a match. The name rides along so a scoreboard
 *  still reads correctly after that player leaves the room. */
export interface MatchScore {
  /** Display name when the points were last banked. Never an identity. */
  name: string;
  points: number;
  /** The seat holder's permanent Player ID, when they had a profile. */
  playerId?: string | null;
}

/**
 * Match = a series of rounds played to a target score.
 *
 * Scores are keyed by the stable SEAT uid, not by name: two players called
 * "Tanmay" hold two seats and two separate totals, and a player who renames or
 * reconnects keeps the one total they were building. (Scores were name-keyed
 * before duplicate names were allowed; `hydrate` migrates those snapshots.)
 */
export interface MatchState {
  scores: Record<string, MatchScore>; // seat uid -> running total
  targetScore: number;
  round: number;                  // 1-based index of the current/last round
  lastRound: RoundResult | null;  // result of the round that just ended
  /** Seat that won the match — the identity half; set with matchWinnerName. */
  matchWinnerUid?: string | null;
  matchWinnerName: string | null; // display name of the match winner
  // Epoch ms the match began. Used to record match duration for profile stats.
  matchStartedAt?: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  spectators?: Spectator[];
  status: 'lobby' | 'playing';
  game?: UnoGameState;
  match?: MatchState;
  // Host-configured house rules for this lobby. Editable only while status is
  // 'lobby'; snapshotted into the game state (locked) when a round starts.
  houseRules: HouseRules;
  // Discoverability for Quick Play matchmaking. Optional for backward
  // compatibility with persisted rooms — absent means 'private'.
  visibility?: RoomVisibility;
  // Themed 3D world the room is played in. Chosen by the host at creation and
  // editable only while status is 'lobby'; purely presentational (never affects
  // gameplay), it rides `publicRoom` to all players and spectators. Optional for
  // backward compatibility with rooms persisted before arenas existed — absent
  // is treated as the default arena on the client.
  arena?: ArenaId;
  // Epoch ms of room creation; used by matchmaking to prefer older waiting rooms
  // and by cleanup to expire abandoned public rooms.
  createdAt?: number;
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  // Map key: `${roomCode}:${seatUid}` -> NodeJS.Timeout. Keyed on the stable seat
  // uid rather than the player's name, so two same-named players in one room get
  // two independent grace periods instead of clobbering each other's timer.
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  // Durable storage (write-through). Defaults to a no-op memory store so the
  // manager works before a real store is injected (and in unit tests).
  private store: RoomStore = new MemoryRoomStore();
  // Coalesce bursts of synchronous mutations within one handler into a single
  // async write per room, and swallow write errors so persistence can never
  // crash gameplay. Codes queued here are flushed on the next microtask/tick.
  private dirty: Set<string> = new Set();
  private removed: Set<string> = new Set();
  private flushScheduled = false;

  /** Inject the durable store (called once at startup). */
  public setStore(store: RoomStore): void {
    this.store = store;
  }

  /**
   * Rehydrate all persisted rooms into memory on startup. Any game that was in
   * progress when the server stopped is restored; players reconnect with their
   * profile / secret and resume. Timers are NOT restored (they re-arm naturally
   * on the next broadcast / grace period).
   */
  public async hydrate(): Promise<void> {
    const rooms = await this.store.loadAll();
    for (const room of rooms) {
      // Backward compatibility: rooms persisted before House Rules existed (or with
      // a partial rule set) are normalized against current defaults on load.
      room.houseRules = normalizeHouseRules(room.houseRules);
      // Rooms persisted before arenas existed default to the classic world.
      room.arena = resolveArena(room.arena);
      // Seats persisted before seat uids existed get one now, and a name-keyed
      // scoreboard is re-keyed onto them, so an in-progress match survives the
      // upgrade with every running total intact.
      this.backfillSeatIdentity(room);
      this.rooms.set(room.code.toUpperCase(), room);
    }
    if (rooms.length) {
      logger.info(`[STORE] Rehydrated ${rooms.length} room(s) from persistence.`);
    }
  }

  /**
   * Give every seat in a rehydrated room a stable uid and move any legacy,
   * name-keyed scoreboard onto those uids.
   *
   * Legacy scores were `Record<lowercasedName, number>`. Each key is matched back
   * to the seat that holds that name; totals whose player is no longer seated are
   * kept under a synthetic uid so the scoreboard still shows them (the same thing
   * that happened before, when the name itself was the key). Where two seats now
   * share a name only one can inherit the single stored total — unavoidable, since
   * the old format never distinguished them — and the other starts from zero.
   */
  private backfillSeatIdentity(room: Room): void {
    for (const p of room.players) {
      if (!p.uid) p.uid = randomUUID();
    }
    for (const s of room.spectators ?? []) {
      if (!s.uid) s.uid = randomUUID();
    }

    const match = room.match as (MatchState & { scores: Record<string, unknown> }) | undefined;
    if (!match?.scores) return;

    const claimed = new Set<string>();
    const migrated: Record<string, MatchScore> = {};
    for (const [key, value] of Object.entries(match.scores)) {
      // Already migrated: the value is a MatchScore object, not a bare number.
      if (value && typeof value === 'object') {
        migrated[key] = value as MatchScore;
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const seat = room.players.find(
        (p) => p.name.toLowerCase() === key && !claimed.has(p.uid)
      );
      if (seat) claimed.add(seat.uid);
      migrated[seat ? seat.uid : randomUUID()] = {
        name: seat ? seat.name : key,
        points: value,
        playerId: seat?.profileId ?? null,
      };
    }
    match.scores = migrated;

    // The winner was recorded by name only; recover the seat where it is
    // unambiguous, and leave it unset when it is not.
    if (match.matchWinnerName && !match.matchWinnerUid) {
      const winners = room.players.filter(
        (p) => p.name.toLowerCase() === match.matchWinnerName!.toLowerCase()
      );
      if (winners.length === 1) match.matchWinnerUid = winners[0].uid;
    }
    if (match.lastRound && !match.lastRound.winnerUid && match.lastRound.winnerName) {
      const winners = room.players.filter(
        (p) => p.name.toLowerCase() === match.lastRound!.winnerName.toLowerCase()
      );
      if (winners.length === 1) match.lastRound.winnerUid = winners[0].uid;
    }
  }

  /** Mark a room dirty so its latest snapshot is written on the next flush. */
  public markDirty(code: string): void {
    const upper = code.toUpperCase();
    this.removed.delete(upper);
    this.dirty.add(upper);
    this.scheduleFlush();
  }

  private markRemoved(code: string): void {
    const upper = code.toUpperCase();
    this.dirty.delete(upper);
    this.removed.add(upper);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    // queueMicrotask lets a whole synchronous handler finish mutating before we
    // serialize once, rather than writing after every field change.
    queueMicrotask(() => this.flush());
  }

  private async flush(): Promise<void> {
    this.flushScheduled = false;
    const toSave = [...this.dirty];
    const toRemove = [...this.removed];
    this.dirty.clear();
    this.removed.clear();

    await Promise.all([
      ...toSave.map(async (code) => {
        const room = this.rooms.get(code);
        if (!room) return; // deleted before flush
        try {
          await this.store.save(room);
        } catch (err: any) {
          logger.error(`[STORE] Failed to persist room ${code}:`, err?.message);
        }
      }),
      ...toRemove.map(async (code) => {
        try {
          await this.store.remove(code);
        } catch (err: any) {
          logger.error(`[STORE] Failed to remove room ${code}:`, err?.message);
        }
      }),
    ]);
  }

  /**
   * Flush any pending writes and close the store. Called on graceful shutdown so
   * the last few mutations aren't lost when a container receives SIGTERM.
   */
  public async shutdown(): Promise<void> {
    await this.flush();
    if (this.store.close) {
      try {
        await this.store.close();
      } catch (err: any) {
        logger.error('[STORE] Error closing store on shutdown:', err?.message);
      }
    }
  }

  // Helper to generate a unique 6-digit room code
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  // Create a new room in memory (pre-socket binding). `arena` is the host's
  // themed-world selection; `'random'` (or any unknown value) is resolved to a
  // concrete id HERE, once, so every client that later receives the room agrees.
  public createRoom(visibility: RoomVisibility = 'private', arena?: string): Room {
    const code = this.generateRoomCode();
    const resolvedArena = resolveSelection(arena);
    const newRoom: Room = {
      code,
      hostId: '',
      players: [],
      status: 'lobby',
      houseRules: { ...DEFAULT_HOUSE_RULES },
      visibility,
      arena: resolvedArena,
      createdAt: Date.now(),
    };
    this.rooms.set(code, newRoom);
    logger.debug(`[ROOM_CREATED] Code: ${code} (${visibility}, arena: ${resolvedArena})`);
    this.markDirty(code);
    return newRoom;
  }

  // Get a room by its code
  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  // ---- Sanitization helpers -------------------------------------------------
  // Player/Spectator objects carry a private `secret`. It must NEVER be sent to
  // any client other than its owner. Use these before broadcasting.

  public publicPlayer(p: Player): Omit<Player, 'secret'> {
    const { secret, ...rest } = p;
    return rest;
  }

  /**
   * Lobby-safe view of a room.
   *
   * Strips every private field before the object crosses the wire:
   *  - each Player/Spectator `secret` (per-session reconnect token), and
   *  - the entire `game` state.
   *
   * Dropping `game` matters for correctness, not just bandwidth: UnoGameState
   * carries `hands` (every player's REAL cards) and `deck` (the full ordered
   * draw pile). Because `lobby-updated` / `game-started` / `game-stopped` are
   * room-wide broadcasts, spreading `...room` verbatim handed every client its
   * opponents' hands and the deck order — bypassing the face-down masking that
   * broadcastGameState is careful to apply. Authoritative game state reaches
   * clients ONLY via broadcastGameState, which masks per recipient.
   */
  public publicRoom(room: Room): Room {
    const { game, ...rest } = room;
    return {
      ...rest,
      players: room.players.map((p) => this.publicPlayer(p) as Player),
      spectators: room.spectators?.map((s) => {
        const { secret, ...specRest } = s;
        return specRest as Spectator;
      }),
    };
  }

  // Expose active room lists for diagnostic logs
  public getAvailableRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  // ---- Bots -----------------------------------------------------------------

  /** Seated human players (bots excluded). */
  public humanPlayers(room: Room): Player[] {
    return room.players.filter((p) => !p.isBot);
  }

  /**
   * Add server-side bot players to a lobby (host only, lobby only). Bots occupy
   * regular player seats (never spectator slots), get a unique bot name from the
   * predefined pool and a synthetic non-socket id. `count` is clamped to the
   * free seats; pass Infinity (or any large number) to fill the table.
   */
  public addBots(code: string, hostSocketId: string, count: number): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.hostId !== hostSocketId) {
      throw new Error('Only the host can add bots');
    }
    if (room.status !== 'lobby') {
      throw new Error('Bots can only be added before the game starts');
    }

    const { maxPlayers } = this.getCapacityInfo(room);
    const freeSeats = maxPlayers - room.players.length;
    const toAdd = Math.min(Math.max(0, Math.floor(count)), freeSeats);
    if (toAdd <= 0) {
      throw new Error('No free seats available for bots');
    }

    for (let i = 0; i < toAdd; i++) {
      const occupiedSeats = new Set(room.players.map((p) => p.seatNumber));
      let seatNumber = 1;
      for (let s = 1; s <= maxPlayers; s++) {
        if (!occupiedSeats.has(s)) { seatNumber = s; break; }
      }

      const takenNames = [
        ...room.players.map((p) => p.name),
        ...(room.spectators?.map((s) => s.name) ?? []),
      ];
      const bot: Player = {
        id: `bot:${randomUUID()}`,
        uid: randomUUID(),
        name: pickBotName(takenNames),
        seatNumber,
        isHost: false,
        secret: randomUUID(),
        isBot: true,
      };
      room.players.push(bot);
      logger.debug(`[BOT_ADDED] ${bot.name} (${bot.id}) seated at ${seatNumber} in room ${room.code}`);
    }

    room.players.sort((a, b) => a.seatNumber - b.seatNumber);
    this.markDirty(room.code);
    return room;
  }

  /** Remove a specific bot from a lobby (host only, lobby only). */
  public removeBot(code: string, hostSocketId: string, botId: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.hostId !== hostSocketId) {
      throw new Error('Only the host can remove bots');
    }
    if (room.status !== 'lobby') {
      throw new Error('Bots can only be removed before the game starts');
    }
    const idx = room.players.findIndex((p) => p.id === botId && p.isBot);
    if (idx === -1) {
      throw new Error('Bot not found in this room');
    }
    const [bot] = room.players.splice(idx, 1);
    logger.debug(`[BOT_REMOVED] ${bot.name} (${bot.id}) removed from room ${room.code}`);
    this.markDirty(room.code);
    return room;
  }

  // ---- Quick Play matchmaking -----------------------------------------------

  /**
   * Find the best public room for a Quick Play request. Preference order:
   *   - lobby rooms (game not started) with at least one human waiting
   *   - a free seat, or a bot seat that can be handed to the human
   *   - most humans already waiting first (fill tables faster), then oldest
   * Returns null when no room qualifies (the caller creates a fresh public room).
   *
   * A room is NEVER skipped because someone there shares the requesting player's
   * name — names are labels, and a table with a "Tanmay" at it is a perfectly
   * good table for another Tanmay. Seats are told apart by identity, not spelling.
   */
  public findQuickPlayRoom(): Room | null {
    const candidates: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.visibility !== 'public') continue;
      if (room.status !== 'lobby') continue;

      const humans = this.humanPlayers(room);
      // Spectator-only / abandoned shells are never matchmaking targets.
      if (humans.length === 0) continue;

      const { maxPlayers } = this.getCapacityInfo(room);
      if (humans.length >= maxPlayers) continue; // full of humans

      const hasFreeSeat = room.players.length < maxPlayers;
      const hasReplaceableBot = room.players.some((p) => p.isBot);
      if (!hasFreeSeat && !hasReplaceableBot) continue;

      candidates.push(room);
    }

    candidates.sort((a, b) => {
      const humansDiff = this.humanPlayers(b).length - this.humanPlayers(a).length;
      if (humansDiff !== 0) return humansDiff;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
    return candidates[0] ?? null;
  }

  /** A room has no live human presence when it holds neither a human player nor
   *  a spectator. (Bots never count as presence — a bots-only shell is dead.) */
  private hasNoMembers(room: Room): boolean {
    return this.humanPlayers(room).length === 0 && (room.spectators?.length ?? 0) === 0;
  }

  /** True once this room's match has been won (finished). */
  private isFinished(room: Room): boolean {
    return !!room.match?.matchWinnerName;
  }

  /**
   * Delete rooms that were created but never (or no longer) have any human
   * member — e.g. a REST-created room whose creator never connected. Run
   * periodically; returns the number of rooms removed. Retained for backward
   * compatibility; `sweepIdleRooms` is the fuller lifecycle-aware sweeper.
   */
  public sweepAbandonedRooms(maxAgeMs: number = 10 * 60_000): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, room] of this.rooms.entries()) {
      if (!this.hasNoMembers(room)) continue;
      const age = now - (room.createdAt ?? now);
      if (age < maxAgeMs) continue;
      logger.debug(`[ROOM_SWEPT] Abandoned room ${code} removed (age ${Math.round(age / 1000)}s).`);
      this.rooms.delete(code);
      this.markRemoved(code);
      removed++;
    }
    return removed;
  }

  /**
   * Lifecycle-aware idle-room garbage collector. Removes rooms that no longer
   * serve anyone, on a per-category retention policy, and NEVER touches a room
   * with an active human player or spectator (so an in-progress game is safe):
   *
   *   - member-less + finished match      -> removed after `finishedTtlMs`
   *   - member-less (empty / never joined /
   *     expired invite / abandoned public) -> removed after `emptyTtlMs`
   *
   * Deleting a room also removes its persisted snapshot (file/redis) via
   * markRemoved -> store.remove. Returns a per-category tally for logging.
   */
  public sweepIdleRooms(opts: { emptyTtlMs: number; finishedTtlMs: number }): {
    empty: number;
    finished: number;
    total: number;
  } {
    const now = Date.now();
    let empty = 0;
    let finished = 0;

    for (const [code, room] of this.rooms.entries()) {
      // Any live human presence (player or spectator) makes the room active —
      // never reclaim it, regardless of game/match state.
      if (!this.hasNoMembers(room)) continue;

      const age = now - (room.createdAt ?? now);
      const finishedRoom = this.isFinished(room);
      const ttl = finishedRoom ? opts.finishedTtlMs : opts.emptyTtlMs;
      if (age < ttl) continue;

      const reason = finishedRoom ? 'finished' : 'idle/abandoned';
      logger.debug(`[ROOM_GC] Removed ${reason} room ${code} (age ${Math.round(age / 1000)}s, no members).`);
      this.rooms.delete(code);
      this.markRemoved(code); // also deletes the persisted snapshot
      if (finishedRoom) finished++;
      else empty++;
    }

    const total = empty + finished;
    if (total > 0) {
      logger.info(`[ROOM_GC] Swept ${total} room(s): ${empty} idle/abandoned, ${finished} finished.`);
    }
    return { empty, finished, total };
  }

  /**
   * Capacity summary for a room — the SAME numbers the join gate enforces, so
   * the REST pre-check and any UI read from one place and can never drift from
   * the authoritative decision in joinRoom. Only active players count toward
   * player capacity; spectators have their own host-configurable limit.
   */
  public getCapacityInfo(room: Room): {
    maxPlayers: number;
    playerCount: number;
    spectatorCount: number;
    maxSpectators: number;
    isFull: boolean;
    spectatorsFull: boolean;
  } {
    const maxPlayers = room.houseRules?.maxPlayers ?? DEFAULT_HOUSE_RULES.maxPlayers;
    const maxSpectators = room.houseRules?.maxSpectators ?? DEFAULT_HOUSE_RULES.maxSpectators;
    const playerCount = room.players.length;
    const spectatorCount = room.spectators?.length ?? 0;
    return {
      maxPlayers,
      playerCount,
      spectatorCount,
      maxSpectators,
      isFull: playerCount >= maxPlayers,
      spectatorsFull: spectatorCount >= maxSpectators,
    };
  }

  // Start disconnect grace period for player or spectator (60 seconds)
  public startDisconnectGracePeriod(
    socketId: string,
    roomCode: string,
    onExpired: (result: { room: Room | null; leftPlayer: Player | null; leftSpectator: Spectator | null; gameStopped: boolean }) => void
  ): { playerName: string; uid: string; isPlayer: boolean } | null {
    const upperCode = roomCode.toUpperCase();
    const room = this.rooms.get(upperCode);
    if (!room) return null;

    const player = room.players.find((p) => p.id === socketId);
    const spectator = room.spectators?.find((s) => s.id === socketId);

    if (!player && !spectator) return null;

    const member = player ?? spectator!;
    const name = member.name;
    const isPlayer = !!player;
    // Keyed by seat uid: with duplicate names allowed, a name-keyed timer would
    // let one player's disconnect cancel their namesake's grace period.
    const key = `${upperCode}:${member.uid}`;

    // Rejoin support can be disabled via house rules — skip the grace period so the
    // seat is freed immediately on disconnect.
    if (room.houseRules && room.houseRules.allowRejoin === false) {
      return null;
    }

    // Cancel existing timer if any (defensive check)
    if (this.disconnectTimers.has(key)) {
      clearTimeout(this.disconnectTimers.get(key));
    }

    logger.debug(`[GRACE_PERIOD_START] Starting 60s disconnect grace period for ${isPlayer ? 'Player' : 'Spectator'} ${name} (seat ${member.uid}) in Room ${upperCode}`);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      logger.debug(`[GRACE_PERIOD_EXPIRED] Disconnect grace period expired for ${name} in Room ${upperCode}`);
      // Actually remove the player/spectator now
      const result = this.leaveRoom(socketId);
      if (result) {
        onExpired(result);
      } else {
        onExpired({ room: null, leftPlayer: null, leftSpectator: null, gameStopped: false });
      }
    }, 60000);

    this.disconnectTimers.set(key, timer);

    return { playerName: name, uid: member.uid, isPlayer };
  }

  /** Cancel a seat's pending disconnect timer, if one is armed. */
  private cancelDisconnectTimer(roomCode: string, uid: string): boolean {
    const key = `${roomCode.toUpperCase()}:${uid}`;
    const timer = this.disconnectTimers.get(key);
    if (!timer) return false;
    clearTimeout(timer);
    this.disconnectTimers.delete(key);
    return true;
  }

  /**
   * Find the seat a returning member already holds, by IDENTITY.
   *
   * Two things can prove you are the person who left, in priority order:
   *
   *   1. A verified Player ID. The socket layer has already checked the profile
   *      secret before handing it here, so this is a genuine identity claim and
   *      survives a rename between sessions.
   *   2. The per-seat `secret` issued when the seat was taken. This covers guests
   *      with no profile; the secret is private to the seat's owner, so holding
   *      it is proof of ownership.
   *
   * The display name is NOT one of them, and is never even consulted. It used to
   * be the primary key, which is exactly what made two players called "Tanmay"
   * collide: the second was told the name was taken, or worse, handed the first
   * one's seat. Someone with neither proof is simply a new player, and gets a
   * new seat next to their namesake.
   */
  private findReturningMember(
    room: Room,
    secret?: string,
    profileId?: string
  ): { player?: Player; spectator?: Spectator } {
    if (profileId) {
      const player = room.players.find((p) => !p.isBot && p.profileId === profileId);
      if (player) return { player };
      const spectator = room.spectators?.find((s) => s.profileId === profileId);
      if (spectator) return { spectator };
    }
    if (secret) {
      const player = room.players.find((p) => !p.isBot && p.secret === secret);
      if (player) return { player };
      const spectator = room.spectators?.find((s) => s.secret === secret);
      if (spectator) return { spectator };
    }
    return {};
  }

  // Join an existing room via Socket connection
  public joinRoom(
    code: string,
    playerName: string,
    playerSocketId: string,
    secret?: string,
    // Verified persistent-profile identity, attached to the seated Player when the
    // client presented a profile whose secret checked out (verification happens in
    // the socket/REST layer — this method trusts what it is handed). Never carries
    // the profile's private secret.
    profile?: { profileId: string; tag?: string; avatar?: string | null; outfit?: string | null }
  ): { room: Room; player: Player | null; isSpectator: boolean; spectator?: Spectator } {
    const upperCode = code.toUpperCase();
    const room = this.rooms.get(upperCode);

    if (!room) {
      const availableRooms = Array.from(this.rooms.keys()).join(', ');
      const roomCount = this.rooms.size;
      logger.debug(`[ROOM_NOT_FOUND] requested: ${upperCode}, available: ${availableRooms || 'None'}, roomCount: ${roomCount}`);
      throw new Error('Room not found');
    }

    // Display name only — never used to find, match or reject a seat below.
    const displayName = sanitizeDisplayName(playerName) || 'Player';

    logger.debug(`[ROOM_JOIN_REQUEST] Name: ${displayName}, Player: ${profile?.profileId ?? 'guest'}, Socket: ${playerSocketId}, Room: ${upperCode}, Status: ${room.status}`);
    logger.debug(`[ROOM_PLAYER_COUNT] Room: ${upperCode}, Count: ${room.players.length}`);
    // Active-player capacity is host-configurable via house rules (default 6). It
    // is the single source of truth for how many players may hold a seat.
    const { maxPlayers } = this.getCapacityInfo(room);
    logger.debug(`[ROOM_CAPACITY] Room: ${upperCode}, Capacity: ${maxPlayers}`);

    // Reconnection, resolved by identity (Player ID, then per-seat secret).
    const returning = this.findReturningMember(room, secret, profile?.profileId);
    const existingPlayer = returning.player;

    if (existingPlayer) {
      // Cancel this seat's disconnect timer — they made it back in time.
      if (this.cancelDisconnectTimer(upperCode, existingPlayer.uid)) {
        logger.debug(`[GRACE_PERIOD_CANCEL] Reconnection detected. Cancelled disconnect grace period for ${displayName} in Room ${upperCode}`);
      }

      const oldSocketId = existingPlayer.id;

      // Update player socket ID
      existingPlayer.id = playerSocketId;

      // The name is display data, so it simply follows the player: someone who
      // renamed between sessions shows up under the new name, in the same seat,
      // with the same score.
      existingPlayer.name = displayName;

      // Refresh the attached persistent-profile identity on reconnect (the player
      // may have changed avatar/outfit between sessions). The Player ID itself is
      // never rewritten to a different one here — a seat is reclaimed by the
      // identity that already holds it.
      if (profile) {
        existingPlayer.profileId = profile.profileId;
        existingPlayer.tag = profile.tag;
        existingPlayer.avatar = profile.avatar ?? null;
        existingPlayer.outfit = profile.outfit ?? null;
      }

      // Keep the scoreboard's display copy of the name in step with the rename.
      const score = room.match?.scores[existingPlayer.uid];
      if (score) {
        score.name = displayName;
        score.playerId = existingPlayer.profileId ?? null;
      }

      // Update host ID if applicable
      if (room.hostId === oldSocketId) {
        room.hostId = playerSocketId;
      }

      // Rebind active game state properties
      if (room.game) {
        const game = room.game;
        
        if (oldSocketId !== playerSocketId) {
          if (game.hands[oldSocketId]) {
            game.hands[playerSocketId] = game.hands[oldSocketId];
            delete game.hands[oldSocketId];
          }
          
          if (game.currentPlayerId === oldSocketId) {
            game.currentPlayerId = playerSocketId;
          }

          if (game.colorChooserId === oldSocketId) {
            game.colorChooserId = playerSocketId;
          }

          if (game.winnerId === oldSocketId) {
            game.winnerId = playerSocketId;
          }

          if (game.unoCalled[oldSocketId] !== undefined) {
            game.unoCalled[playerSocketId] = game.unoCalled[oldSocketId];
            delete game.unoCalled[oldSocketId];
          }

          // Carry over the reconnecting player's accumulated round stats so a
          // mid-round disconnect never orphans (or double-counts) their capture.
          if (game.roundStats && game.roundStats[oldSocketId]) {
            game.roundStats[playerSocketId] = game.roundStats[oldSocketId];
            delete game.roundStats[oldSocketId];
          }

          // Remap lastAction playerId if it references the old socket
          if (game.lastAction && game.lastAction.playerId === oldSocketId) {
            game.lastAction.playerId = playerSocketId;
          }
        }
      }

      logger.debug(`[PLAYER_RECONNECTED] Rebound seat ${existingPlayer.uid} ("${displayName}") from socket ${oldSocketId} to ${playerSocketId}`);
      logger.debug(`[PLAYER_ASSIGNED_SEAT] Name: ${displayName} (Reconnected), Socket: ${playerSocketId}, Room: ${room.code}, Seat: ${existingPlayer.seatNumber}`);
      logger.debug(`[ROOM_JOIN] Player: ${displayName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      this.markDirty(room.code);
      return { room, player: existingPlayer, isSpectator: false };
    }

    // Spectator reconnection — same identity rules as a seated player.
    const existingSpectator = returning.spectator;
    if (existingSpectator) {
      this.cancelDisconnectTimer(upperCode, existingSpectator.uid);
      const oldSocketId = existingSpectator.id;
      existingSpectator.id = playerSocketId;
      existingSpectator.name = displayName;
      if (profile) existingSpectator.profileId = profile.profileId;
      logger.debug(`[SPECTATOR_RECONNECTED] Rebound spectator slot ${existingSpectator.uid} ("${displayName}") from socket ${oldSocketId} to ${playerSocketId}`);
      logger.debug(`[ROOM_JOIN] Spectator: ${displayName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      this.markDirty(room.code);
      return { room, player: null, isSpectator: true, spectator: existingSpectator };
    }

    // Spectator Check: overflow past the active-player capacity joins as a spectator.
    // This gate is authoritative: because Node runs handlers on a single thread, two
    // sockets can never pass this check "simultaneously" — the array push below is
    // committed before the next join is processed, so capacity can't be exceeded.
    let shouldSpectate = this.getCapacityInfo(room).isFull;

    // Bot displacement: while the game hasn't started, a full table that still
    // contains bots always makes room for a real player — one bot leaves and the
    // human takes its seat. The configured player limit is never exceeded.
    if (shouldSpectate && room.status === 'lobby') {
      const botIndex = room.players.findIndex((p) => p.isBot);
      if (botIndex !== -1) {
        const [displaced] = room.players.splice(botIndex, 1);
        logger.debug(`[BOT_DISPLACED] ${displaced.name} gave up seat ${displaced.seatNumber} for ${displayName} in room ${room.code}`);
        shouldSpectate = false;
      }
    }

    if (shouldSpectate) {
      // Spectator mode can be disabled via house rules — reject instead of seating.
      if (room.houseRules && room.houseRules.spectatorMode === false) {
        throw new Error('This table is full and spectating is disabled.');
      }
      if (!room.spectators) {
        room.spectators = [];
      }
      // Same socket re-announcing itself keeps its slot; anyone else is new.
      let spectator = room.spectators.find((s) => s.id === playerSocketId);
      if (!spectator) {
        // Spectator capacity is a house rule too (Max Spectators). When every player
        // seat AND every spectator slot is taken, the room is completely full. Only
        // NEW spectators are gated — a socket already seated above never re-counts.
        if (this.getCapacityInfo(room).spectatorsFull) {
          throw new Error('This room is completely full — all player seats and spectator slots are taken.');
        }
        spectator = {
          id: playerSocketId,
          uid: randomUUID(),
          name: displayName,
          secret: randomUUID(),
          ...(profile ? { profileId: profile.profileId } : {}),
        };
        room.spectators.push(spectator);
      }
      logger.debug(`[PLAYER_ASSIGNED_SPECTATOR] Name: ${displayName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      logger.debug(`[ROOM_JOIN] Spectator: ${displayName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      this.markDirty(room.code);
      return { room, player: null, isSpectator: true, spectator };
    }

    // Stable Seating System: Find the lowest vacant seat number between 1 and maxPlayers
    const occupiedSeats = new Set(room.players.map((p) => p.seatNumber));
    let seatNumber = 1;
    for (let i = 1; i <= maxPlayers; i++) {
      if (!occupiedSeats.has(i)) {
        seatNumber = i;
        break;
      }
    }

    // If this is the first player joining, they are the host
    const isHost = room.players.length === 0;
    if (isHost) {
      room.hostId = playerSocketId;
    }

    const newPlayer: Player = {
      id: playerSocketId,
      uid: randomUUID(),
      name: displayName,
      seatNumber,
      isHost,
      secret: randomUUID(),
      ...(profile
        ? { profileId: profile.profileId, tag: profile.tag, avatar: profile.avatar ?? null, outfit: profile.outfit ?? null }
        : {}),
    };

    room.players.push(newPlayer);

    // Sort players by seat number so client lists remain aligned
    room.players.sort((a, b) => a.seatNumber - b.seatNumber);

    // Joining mid-match puts you on the scoreboard at zero rather than leaving a
    // hole, and does it under your own seat even if a namesake is already listed.
    if (room.match && room.match.scores[newPlayer.uid] === undefined) {
      room.match.scores[newPlayer.uid] = {
        name: newPlayer.name,
        points: 0,
        playerId: newPlayer.profileId ?? null,
      };
    }

    logger.debug(`[PLAYER_ASSIGNED_SEAT] Name: ${displayName}, Socket: ${playerSocketId}, Room: ${room.code}, Seat: ${seatNumber}`);
    logger.debug(`[ROOM_JOIN] Player: ${displayName}, Socket: ${playerSocketId}, Room: ${room.code}`);
    this.markDirty(room.code);
    return { room, player: newPlayer, isSpectator: false };
  }

  // Remove player/spectator from whatever room they are in
  public leaveRoom(playerSocketId: string): { room: Room | null; leftPlayer: Player | null; leftSpectator: Spectator | null; gameStopped: boolean } | null {
    for (const [code, room] of this.rooms.entries()) {
      // Check players list
      const playerIndex = room.players.findIndex((p) => p.id === playerSocketId);

      if (playerIndex !== -1) {
        const [leftPlayer] = room.players.splice(playerIndex, 1);
        let gameStopped = false;

        // Cancel any active disconnect grace period timer for safety
        this.cancelDisconnectTimer(code, leftPlayer.uid);

        logger.debug(`[ROOM_LEAVE] Player: ${leftPlayer.name}, Socket: ${playerSocketId}, Room: ${code}`);

        // Bots never play on without a human at the table: once the last human
        // player leaves, every bot leaves with them (the room below is then
        // either handed to spectators or deleted outright).
        if (this.humanPlayers(room).length === 0 && room.players.length > 0) {
          logger.debug(`[BOTS_CLEARED] Last human left room ${code} — removing ${room.players.length} bot(s).`);
          room.players = [];
          if (room.game) {
            room.game = undefined;
            room.status = 'lobby';
            gameStopped = true;
          }
        }

        // Clean up game state if a game is active
        if (room.game && room.players.length >= 2) {
          // Enough players remain — keep the game going.
          const game = room.game;

          // Remove the player's hand
          delete game.hands[playerSocketId];
          delete game.unoCalled[playerSocketId];

          // If the leaving player owed the table a wild-color choice, that
          // choice can never arrive — return the game to normal play (the turn
          // handoff below decides who acts next).
          if (game.colorChooserId === playerSocketId) {
            game.colorChooserId = null;
            game.status = 'playing';
          }

          // Same for a pending Seven-O swap-target choice.
          if (game.swapChooserId === playerSocketId) {
            game.swapChooserId = null;
            game.status = 'playing';
          }

          // A Wild Draw Four played by the leaver can no longer be challenged —
          // their hand (the evidence, and the target of any penalty) is gone.
          // The accumulated draw stack itself still stands.
          if (game.wildFourPlayerId === playerSocketId) {
            game.wildFourPlayerId = null;
            game.wildFourWasBluff = null;
            game.challengeableById = null;
          }

          // If it was the leaving player's turn, hand it to the player who is
          // genuinely next in turn order — anchored on the seat the leaver held
          // and following the current play direction (so an active Reverse is
          // honored), skipping seats that no longer hold cards. Never assigned
          // by array position.
          if (game.currentPlayerId === playerSocketId) {
            // The leaver's private draw-then-play decision leaves with them.
            game.drawnCardId = null;
            const nextId = getNextActivePlayerId(game, room.players, leftPlayer.seatNumber);
            if (nextId) {
              // The right to challenge a pending +4 follows the draw stack to
              // the player who now faces it.
              if (game.challengeableById === playerSocketId) {
                game.challengeableById = nextId;
              }
              game.currentPlayerId = nextId;
              const next = room.players.find((p) => p.id === nextId);
              logger.debug(`[TURN_ADVANCED_ON_LEAVE] Next Player: ${next?.name} (${nextId})`);
            }
          } else if (game.challengeableById === playerSocketId) {
            // Defensive: a challenge window can't outlive its owner.
            game.challengeableById = null;
          }
        } else if (room.game) {
          // Fewer than 2 players remain — stop the game, reset the table back to
          // the lobby. A fresh game must be started from scratch once enough
          // players have re-joined.
          room.game = undefined;
          room.status = 'lobby';
          gameStopped = true;
          logger.debug(`[GAME_STOPPED] Room ${code} dropped below 2 players. Game reset to lobby.`);
        }

        // If the player was the host and there are other players, elect a new
        // host. Only humans can host — bots have no socket to act through.
        const nextHumanHost = this.humanPlayers(room)[0];
        if (leftPlayer.isHost && nextHumanHost) {
          nextHumanHost.isHost = true;
          room.hostId = nextHumanHost.id;
        }

        // The last remaining human always becomes the host (e.g. when a game is stopped).
        if (nextHumanHost && !room.players.some((p) => p.isHost)) {
          nextHumanHost.isHost = true;
          room.hostId = nextHumanHost.id;
          logger.debug(`[HOST_ASSIGNED] ${nextHumanHost.name} is now the host of room ${code}`);
        }

        // If room is empty, delete it
        if (room.players.length === 0 && (!room.spectators || room.spectators.length === 0)) {
          logger.debug(`[ROOM_DELETED] Code: ${code}`);
          this.rooms.delete(code);
          this.markRemoved(code);
          return { room: null, leftPlayer, leftSpectator: null, gameStopped };
        }

        // Keep players sorted by seat number
        room.players.sort((a, b) => a.seatNumber - b.seatNumber);

        this.markDirty(code);
        return { room, leftPlayer, leftSpectator: null, gameStopped };
      }

      // Check spectators list
      if (room.spectators) {
        const specIndex = room.spectators.findIndex((s) => s.id === playerSocketId);
        if (specIndex !== -1) {
          const [leftSpectator] = room.spectators.splice(specIndex, 1);

          // Cancel any active disconnect grace period timer for safety
          this.cancelDisconnectTimer(code, leftSpectator.uid);

          logger.debug(`[ROOM_LEAVE] Spectator: ${leftSpectator.name}, Socket: ${playerSocketId}, Room: ${code}`);

          if (room.players.length === 0 && room.spectators.length === 0) {
            logger.debug(`[ROOM_DELETED] Code: ${code}`);
            this.rooms.delete(code);
            this.markRemoved(code);
            return { room: null, leftPlayer: null, leftSpectator, gameStopped: false };
          }

          this.markDirty(code);
          return { room, leftPlayer: null, leftSpectator, gameStopped: false };
        }
      }
    }
    return null;
  }

  /**
   * Update a room's house rules. Host-only, and only while the room is in the
   * lobby — once a game is in progress the rules are locked. The incoming partial
   * is merged onto the existing rules and normalized (dependencies enforced,
   * numbers clamped), so a client can send just the fields it changed.
   */
  public updateHouseRules(code: string, hostSocketId: string, partial: Partial<HouseRules>): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.hostId !== hostSocketId) {
      throw new Error('Only the host can change the house rules');
    }
    if (room.status !== 'lobby') {
      throw new Error('House rules are locked once the game has started');
    }

    room.houseRules = normalizeHouseRules({ ...room.houseRules, ...partial });
    this.markDirty(code);
    return room;
  }

  /**
   * Change the room's themed arena (host only, lobby only). Purely cosmetic; the
   * `random` selection resolves to a concrete id here so all clients agree.
   * Locked once the game is playing so the world can't change mid-match.
   */
  public updateArena(code: string, hostSocketId: string, arena: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.hostId !== hostSocketId) {
      throw new Error('Only the host can change the arena');
    }
    if (room.status !== 'lobby') {
      throw new Error('The arena is locked once the game has started');
    }

    room.arena = resolveSelection(arena);
    this.markDirty(code);
    return room;
  }

  // Set room game status to playing. Starts either a brand-new match (first play,
  // or after a previous match was won) or the next round of the ongoing match.
  // `fillWithBots` (host opt-in) tops the table up with bots before dealing, so a
  // solo player can start immediately.
  public startGame(code: string, hostSocketId: string, fillWithBots: boolean = false): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.hostId !== hostSocketId) {
      throw new Error('Only the host can start the game');
    }

    if (fillWithBots && room.status === 'lobby') {
      const { maxPlayers } = this.getCapacityInfo(room);
      if (room.players.length < maxPlayers) {
        this.addBots(code, hostSocketId, maxPlayers - room.players.length);
      }
    }

    // A game needs at least 2 participants — human or bot. A solo host can meet
    // this by adding bots (or passing fillWithBots).
    if (room.players.length < 2) {
      throw new Error('At least 2 players are required — invite a friend or add bots');
    }

    // Lock in the current house rules for this game.
    const rules = normalizeHouseRules(room.houseRules);
    room.houseRules = rules;

    // Begin a fresh match if there is none yet or the previous one was already
    // won; otherwise this is the next round and scores carry over.
    if (!room.match || room.match.matchWinnerName) {
      room.match = {
        scores: {},
        targetScore: rules.targetScore ?? DEFAULT_TARGET_SCORE,
        round: 1,
        lastRound: null,
        matchWinnerUid: null,
        matchWinnerName: null,
        matchStartedAt: Date.now(),
      };
      // Seed every current seat at 0 so the scoreboard shows everyone. Seat-keyed,
      // so same-named players get one row each.
      room.players.forEach((p) => {
        room.match!.scores[p.uid] = { name: p.name, points: 0, playerId: p.profileId ?? null };
      });
    } else {
      room.match.round += 1;
      room.match.lastRound = null;
      // Ensure any player who joined between rounds appears on the board.
      room.players.forEach((p) => {
        if (room.match!.scores[p.uid] === undefined) {
          room.match!.scores[p.uid] = { name: p.name, points: 0, playerId: p.profileId ?? null };
        }
      });
    }

    room.status = 'playing';
    room.game = startGameState(room.players, rules);
    this.markDirty(code);
    return room;
  }

  /**
   * Bank the just-ended round's points onto the match scoreboard. Call this once,
   * right after the game engine sets status='ended' with a winnerId. Returns the
   * round result (winner + points) plus whether the match is now won.
   */
  public finalizeRound(code: string): { result: RoundResult; matchWon: boolean } | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || !room.game || !room.match) return null;
    const game = room.game;
    if (game.status !== 'ended' || !game.winnerId) return null;
    // Idempotency guard: don't double-count if called twice for the same round.
    if (room.match.lastRound && room.match.lastRound.round === room.match.round) {
      return { result: room.match.lastRound, matchWon: !!room.match.matchWinnerName };
    }

    const winner = room.players.find((p) => p.id === game.winnerId);
    const winnerName = winner ? winner.name : 'Unknown';
    // Points are banked onto the WINNING SEAT, never onto a name — with duplicate
    // names allowed, crediting "tanmay" could otherwise pay the wrong player.
    // A winner who somehow has no seat (left mid-finalization) gets a throwaway
    // key so the round still balances instead of writing to `undefined`.
    const key = winner ? winner.uid : `absent:${game.winnerId}`;

    const points = calculateRoundPoints(game.hands, game.winnerId);
    const entry = room.match.scores[key] ?? {
      name: winnerName,
      points: 0,
      playerId: winner?.profileId ?? null,
    };
    entry.points += points;
    entry.name = winnerName;
    if (winner?.profileId) entry.playerId = winner.profileId;
    room.match.scores[key] = entry;

    const result: RoundResult = {
      round: room.match.round,
      winnerUid: winner?.uid,
      winnerName,
      pointsAwarded: points,
    };
    room.match.lastRound = result;

    let matchWon = false;
    if (entry.points >= room.match.targetScore) {
      room.match.matchWinnerUid = winner?.uid ?? null;
      room.match.matchWinnerName = winnerName;
      matchWon = true;
      logger.info(`[MATCH_WON] ${winnerName} reached ${entry.points} in room ${code}`);
    }

    // Server-authoritative stat capture. Fold this round into every seated
    // human's persistent profile — a completed round counts both as a round and
    // as a match (see commitStats). Isolated in a try/catch so a profile-layer
    // hiccup can never disrupt gameplay/banking.
    try {
      this.commitStats(room, game, result);
    } catch (err: any) {
      logger.error(`[PROFILE_STATS] Failed to commit stats for room ${code}:`, err?.message);
    }

    this.markDirty(code);
    return { result, matchWon };
  }

  /**
   * Fold a just-banked round into each seated human player's persistent profile.
   * Server-authoritative: every counter is derived here from live game/match
   * state, never from clients.
   *
   * A completed ROUND is the unit of record. It is committed twice: once through
   * applyRoundResult (round counters, points, per-round action deltas) and once
   * through applyMatchResult (matches played/won, streaks, play time, and a
   * match-history entry). Reaching the match target score is a scoreboard
   * milestone only — it does NOT produce an extra record, so nothing is ever
   * double-counted and no stats are withheld from players who leave, or from
   * matches that are abandoned before anyone reaches the target.
   *
   * Guardrails ignore insignificant games — only rounds with at least
   * PROFILE_CONFIG.minHumansForStats human participants count, and only humans
   * who presented a verified profile are committed (bots and profile-less guests
   * are silently skipped). finalizeRound's idempotency guard means this runs at
   * most once per round, so there is no double-counting across reconnects/retries.
   */
  private commitStats(room: Room, game: UnoGameState, result: RoundResult): void {
    const match = room.match;
    if (!match) return;

    // Significance gate: solo-vs-bots practice (fewer than N humans) never counts.
    const humans = room.players.filter((p) => !p.isBot);
    if (humans.length < PROFILE_CONFIG.minHumansForStats) return;

    // Only humans carrying a persistent profile are tracked.
    const tracked = humans.filter((p) => p.profileId);
    if (tracked.length === 0) return;

    // ---- Placement, derived from remaining hand points ------------------------
    // Winner (empty hand) is forced to 1st; everyone else ranks by ascending
    // remaining points (fewer left = better finish). This single ordering serves
    // both the round commit and the round-as-match history record.
    const ranked = room.players
      .filter((p) => game.hands[p.id])
      .map((p) => ({
        id: p.id,
        name: p.name,
        playerId: p.profileId ?? null,
        pts: p.id === game.winnerId ? -1 : handPoints(game.hands[p.id]),
      }))
      .sort((a, b) => a.pts - b.pts);
    const roundPlacement = new Map<string, number>();
    ranked.forEach((r, i) => roundPlacement.set(r.id, i + 1));

    for (const p of tracked) {
      const won = p.id === game.winnerId;
      profileManager.applyRoundResult(p.profileId!, {
        delta: (game.roundStats && game.roundStats[p.id]) || emptyRoundDelta(),
        won,
        placement: roundPlacement.get(p.id) ?? 0,
        // Only the round winner banks points in UNO scoring.
        points: won ? result.pointsAwarded : 0,
      });
    }

    // ---- Round-as-match commit ------------------------------------------------
    // Everything below describes THIS round: its winner, its standings, its
    // wall-clock length. `rounds: 1` because one record covers exactly one round.
    const winnerName = result.winnerName;
    const winnerId = room.players.find((p) => p.id === game.winnerId)?.profileId ?? null;
    const durationMs = game.startedAt ? Math.max(0, Date.now() - game.startedAt) : 0;
    const players: MatchPlayerRecord[] = ranked.map((r) => ({
      name: r.name,
      placement: roundPlacement.get(r.id) ?? 0,
      // Stamped so a history line still identifies WHO it was after a rename, and
      // so two same-named opponents in one match stay distinguishable.
      playerId: r.playerId,
    }));
    const houseRulesSummary = this.summarizeHouseRules(room.houseRules);
    const finishedAt = Date.now();

    for (const p of tracked) {
      const won = p.id === game.winnerId;
      const placement = roundPlacement.get(p.id) ?? 0;
      const record: MatchRecord = {
        date: finishedAt,
        // Cloned per profile: each record is persisted independently.
        players: players.map((s) => ({ ...s })),
        winnerName,
        winnerId,
        placement,
        durationMs,
        rounds: 1,
        // Recorded for display/derivation only ("favorite arena" on the profile);
        // never read back by the game engine.
        arena: room.arena ?? null,
        settings: { targetScore: match.targetScore, houseRulesSummary },
      };
      profileManager.applyMatchResult(p.profileId!, {
        won,
        placement,
        record,
        playTimeMs: durationMs,
        // The round winner banks every remaining card's value, so a loser's
        // margin behind them is exactly the points awarded this round.
        lossMargin: won ? null : result.pointsAwarded,
      });
    }
  }

  /** Short, human-readable summary of the notable house rules in effect, stored
   *  on each match-history record for the profile UI. */
  private summarizeHouseRules(rules: HouseRules): string {
    if (!rules) return 'Classic';
    const flags: string[] = [];
    if (rules.stacking) flags.push('Stacking');
    if (rules.jumpIn) flags.push('Jump-In');
    if (rules.sevenSwap || rules.zeroRotate) flags.push('Seven-O');
    if (rules.drawUntilPlayable) flags.push('Draw to Match');
    if (rules.challengeWildDrawFour) flags.push('Challenges');
    if (rules.forcePlayDrawnCard) flags.push('Force Play');
    return flags.length ? flags.join(', ') : 'Classic';
  }
}

export const roomManager = new RoomManager();

