import { randomUUID } from 'crypto';
import { UnoGameState } from '../game/gameState';
import { startGameState } from '../game/actions';
import { getNextActivePlayerId } from '../game/turnManager';
import { calculateRoundPoints, handPoints, DEFAULT_TARGET_SCORE } from '../game/scoring';
import { HouseRules, DEFAULT_HOUSE_RULES, normalizeHouseRules } from '../game/houseRules';
import { logger } from '../utils/logger';
import { RoomStore, MemoryRoomStore } from './roomStore';
import { pickBotName } from '../bots/botNames';
import { profileManager } from '../profiles/profileManager';
import { MatchRecord, MatchPlayerRecord, emptyRoundDelta } from '../profiles/profileTypes';
import { PROFILE_CONFIG } from '../config/serverConfig';

export interface Player {
  id: string; // Socket ID (or a synthetic `bot:` id for server-side bots)
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
}

/** Room discoverability. Public rooms are matched by Quick Play; private rooms
 *  (the default, preserving existing behavior) require an invite link/code. */
export type RoomVisibility = 'public' | 'private';

export interface Spectator {
  id: string; // Socket ID
  name: string;
  secret: string; // Private per-session token. Never broadcast to other clients.
}

/** One completed round's result, kept for the end-of-round summary UI. */
export interface RoundResult {
  round: number;
  winnerName: string;
  pointsAwarded: number;
}

/**
 * Match = a series of rounds played to a target score. Scores are keyed by
 * LOWERCASED player name (the same stable identity used for reconnection), so a
 * player's running total survives disconnects, reseating and server restarts.
 */
export interface MatchState {
  scores: Record<string, number>; // lowercased name -> cumulative points
  targetScore: number;
  round: number;                  // 1-based index of the current/last round
  lastRound: RoundResult | null;  // result of the round that just ended
  matchWinnerName: string | null; // set once someone reaches targetScore
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
  // Epoch ms of room creation; used by matchmaking to prefer older waiting rooms
  // and by cleanup to expire abandoned public rooms.
  createdAt?: number;
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  // Map key: `${roomCode}:${playerName}` -> NodeJS.Timeout
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
   * name + secret and resume. Timers are NOT restored (they re-arm naturally on
   * the next broadcast / grace period).
   */
  public async hydrate(): Promise<void> {
    const rooms = await this.store.loadAll();
    for (const room of rooms) {
      // Backward compatibility: rooms persisted before House Rules existed (or with
      // a partial rule set) are normalized against current defaults on load.
      room.houseRules = normalizeHouseRules(room.houseRules);
      this.rooms.set(room.code.toUpperCase(), room);
    }
    if (rooms.length) {
      logger.info(`[STORE] Rehydrated ${rooms.length} room(s) from persistence.`);
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

  // Create a new room in memory (pre-socket binding)
  public createRoom(visibility: RoomVisibility = 'private'): Room {
    const code = this.generateRoomCode();
    const newRoom: Room = {
      code,
      hostId: '',
      players: [],
      status: 'lobby',
      houseRules: { ...DEFAULT_HOUSE_RULES },
      visibility,
      createdAt: Date.now(),
    };
    this.rooms.set(code, newRoom);
    logger.debug(`[ROOM_CREATED] Code: ${code} (${visibility})`);
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

  // Check if a player name is unique in a room
  public isNameUnique(room: Room, name: string): boolean {
    return !room.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
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
   * Rooms where `playerName` is already taken are skipped so the join can't be
   * rejected as a name collision. Returns null when no room qualifies (the
   * caller creates a fresh public room).
   */
  public findQuickPlayRoom(playerName?: string): Room | null {
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

      if (
        playerName &&
        (room.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase()) ||
          room.spectators?.some((s) => s.name.toLowerCase() === playerName.toLowerCase()))
      ) {
        continue;
      }

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
  ): { playerName: string; isPlayer: boolean } | null {
    const upperCode = roomCode.toUpperCase();
    const room = this.rooms.get(upperCode);
    if (!room) return null;

    const player = room.players.find((p) => p.id === socketId);
    const spectator = room.spectators?.find((s) => s.id === socketId);

    if (!player && !spectator) return null;

    const name = player ? player.name : spectator!.name;
    const isPlayer = !!player;
    const key = `${upperCode}:${name.toLowerCase()}`;

    // Rejoin support can be disabled via house rules — skip the grace period so the
    // seat is freed immediately on disconnect.
    if (room.houseRules && room.houseRules.allowRejoin === false) {
      return null;
    }

    // Cancel existing timer if any (defensive check)
    if (this.disconnectTimers.has(key)) {
      clearTimeout(this.disconnectTimers.get(key));
    }

    logger.debug(`[GRACE_PERIOD_START] Starting 60s disconnect grace period for ${isPlayer ? 'Player' : 'Spectator'} ${name} in Room ${upperCode}`);

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

    return { playerName: name, isPlayer };
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
    profile?: { profileId: string; tag?: string; avatar?: string | null }
  ): { room: Room; player: Player | null; isSpectator: boolean; spectator?: Spectator } {
    const upperCode = code.toUpperCase();
    const room = this.rooms.get(upperCode);

    if (!room) {
      const availableRooms = Array.from(this.rooms.keys()).join(', ');
      const roomCount = this.rooms.size;
      logger.debug(`[ROOM_NOT_FOUND] requested: ${upperCode}, available: ${availableRooms || 'None'}, roomCount: ${roomCount}`);
      throw new Error('Room not found');
    }

    logger.debug(`[ROOM_JOIN_REQUEST] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${upperCode}, Status: ${room.status}`);
    logger.debug(`[ROOM_PLAYER_COUNT] Room: ${upperCode}, Count: ${room.players.length}`);
    // Active-player capacity is host-configurable via house rules (default 6). It
    // is the single source of truth for how many players may hold a seat.
    const { maxPlayers } = this.getCapacityInfo(room);
    logger.debug(`[ROOM_CAPACITY] Room: ${upperCode}, Capacity: ${maxPlayers}`);

    // Cancel any active disconnect timer for this player/spectator
    const timerKey = `${upperCode}:${playerName.toLowerCase()}`;
    if (this.disconnectTimers.has(timerKey)) {
      clearTimeout(this.disconnectTimers.get(timerKey)!);
      this.disconnectTimers.delete(timerKey);
      logger.debug(`[GRACE_PERIOD_CANCEL] Reconnection detected. Cancelled disconnect grace period for ${playerName} in Room ${upperCode}`);
    }

    // Check if a player with this name already exists in the room (Reconnection Case)
    const existingPlayerByName = room.players.find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );

    if (existingPlayerByName) {
      // Identity check: a name-based reconnection is only honoured if the caller
      // proves ownership with the matching per-session secret. This blocks a
      // stranger from stealing a seat (and possibly host) by reusing a name.
      if (!secret || secret !== existingPlayerByName.secret) {
        logger.debug(`[JOIN_REJECTED] Name "${playerName}" is already taken in room ${room.code} (secret mismatch).`);
        throw new Error('That name is already taken in this room. Please choose another.');
      }

      const oldSocketId = existingPlayerByName.id;

      // Update player socket ID
      existingPlayerByName.id = playerSocketId;

      // Refresh the attached persistent-profile identity on reconnect (the player
      // may have renamed/changed avatar between sessions). Cleared if none presented.
      if (profile) {
        existingPlayerByName.profileId = profile.profileId;
        existingPlayerByName.tag = profile.tag;
        existingPlayerByName.avatar = profile.avatar ?? null;
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

      logger.debug(`[PLAYER_RECONNECTED] Rebound name "${playerName}" from socket ${oldSocketId} to ${playerSocketId}`);
      logger.debug(`[PLAYER_ASSIGNED_SEAT] Name: ${playerName} (Reconnected), Socket: ${playerSocketId}, Room: ${room.code}, Seat: ${existingPlayerByName.seatNumber}`);
      logger.debug(`[ROOM_JOIN] Player: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      this.markDirty(room.code);
      return { room, player: existingPlayerByName, isSpectator: false };
    }

    // Check if spectator with same name exists (Spectator Reconnection Case)
    if (room.spectators) {
      const existingSpectatorByName = room.spectators.find(
        (s) => s.name.toLowerCase() === playerName.toLowerCase()
      );
      if (existingSpectatorByName) {
        if (!secret || secret !== existingSpectatorByName.secret) {
          logger.debug(`[JOIN_REJECTED] Spectator name "${playerName}" is taken in room ${room.code} (secret mismatch).`);
          throw new Error('That name is already taken in this room. Please choose another.');
        }
        const oldSocketId = existingSpectatorByName.id;
        existingSpectatorByName.id = playerSocketId;
        logger.debug(`[SPECTATOR_RECONNECTED] Rebound spectator "${playerName}" from socket ${oldSocketId} to ${playerSocketId}`);
        logger.debug(`[ROOM_JOIN] Spectator: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
        this.markDirty(room.code);
        return { room, player: null, isSpectator: true, spectator: existingSpectatorByName };
      }
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
        logger.debug(`[BOT_DISPLACED] ${displaced.name} gave up seat ${displaced.seatNumber} for ${playerName} in room ${room.code}`);
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
      // Reconnection or duplicate checks for spectators
      let spectator = room.spectators.find((s) => s.id === playerSocketId);
      if (!spectator) {
        // Spectator capacity is a house rule too (Max Spectators). When every player
        // seat AND every spectator slot is taken, the room is completely full. Only
        // NEW spectators are gated — a socket already seated above never re-counts.
        if (this.getCapacityInfo(room).spectatorsFull) {
          throw new Error('This room is completely full — all player seats and spectator slots are taken.');
        }
        spectator = { id: playerSocketId, name: playerName, secret: randomUUID() };
        room.spectators.push(spectator);
      }
      logger.debug(`[PLAYER_ASSIGNED_SPECTATOR] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      logger.debug(`[ROOM_JOIN] Spectator: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
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
      name: playerName,
      seatNumber,
      isHost,
      secret: randomUUID(),
      ...(profile
        ? { profileId: profile.profileId, tag: profile.tag, avatar: profile.avatar ?? null }
        : {}),
    };

    room.players.push(newPlayer);
    
    // Sort players by seat number so client lists remain aligned
    room.players.sort((a, b) => a.seatNumber - b.seatNumber);

    logger.debug(`[PLAYER_ASSIGNED_SEAT] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}, Seat: ${seatNumber}`);
    logger.debug(`[ROOM_JOIN] Player: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
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
        const timerKey = `${code.toUpperCase()}:${leftPlayer.name.toLowerCase()}`;
        if (this.disconnectTimers.has(timerKey)) {
          clearTimeout(this.disconnectTimers.get(timerKey)!);
          this.disconnectTimers.delete(timerKey);
        }

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
          const timerKey = `${code.toUpperCase()}:${leftSpectator.name.toLowerCase()}`;
          if (this.disconnectTimers.has(timerKey)) {
            clearTimeout(this.disconnectTimers.get(timerKey)!);
            this.disconnectTimers.delete(timerKey);
          }

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
        matchWinnerName: null,
        matchStartedAt: Date.now(),
      };
      // Seed every current player at 0 so the scoreboard shows everyone.
      room.players.forEach((p) => { room.match!.scores[p.name.toLowerCase()] = 0; });
    } else {
      room.match.round += 1;
      room.match.lastRound = null;
      // Ensure any player who joined between rounds appears on the board.
      room.players.forEach((p) => {
        const key = p.name.toLowerCase();
        if (room.match!.scores[key] === undefined) room.match!.scores[key] = 0;
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
    const key = winnerName.toLowerCase();

    const points = calculateRoundPoints(game.hands, game.winnerId);
    room.match.scores[key] = (room.match.scores[key] ?? 0) + points;

    const result: RoundResult = { round: room.match.round, winnerName, pointsAwarded: points };
    room.match.lastRound = result;

    let matchWon = false;
    if (room.match.scores[key] >= room.match.targetScore) {
      room.match.matchWinnerName = winnerName;
      matchWon = true;
      logger.info(`[MATCH_WON] ${winnerName} reached ${room.match.scores[key]} in room ${code}`);
    }

    // Server-authoritative stat capture. Fold this round (and, if decided, the
    // whole match) into every seated human's persistent profile. Isolated in a
    // try/catch so a profile-layer hiccup can never disrupt gameplay/banking.
    try {
      this.commitStats(room, game, result, matchWon);
    } catch (err: any) {
      logger.error(`[PROFILE_STATS] Failed to commit stats for room ${code}:`, err?.message);
    }

    this.markDirty(code);
    return { result, matchWon };
  }

  /**
   * Fold a just-banked round (and, when the match is decided, the whole match)
   * into each seated human player's persistent profile. Server-authoritative:
   * every counter is derived here from live game/match state, never from clients.
   *
   * Guardrails ignore insignificant games — only rounds with at least
   * PROFILE_CONFIG.minHumansForStats human participants count, and only humans
   * who presented a verified profile are committed (bots and profile-less guests
   * are silently skipped). finalizeRound's idempotency guard means this runs at
   * most once per round, so there is no double-counting across reconnects/retries.
   */
  private commitStats(
    room: Room,
    game: UnoGameState,
    result: RoundResult,
    matchWon: boolean
  ): void {
    const match = room.match;
    if (!match) return;

    // Significance gate: solo-vs-bots practice (fewer than N humans) never counts.
    const humans = room.players.filter((p) => !p.isBot);
    if (humans.length < PROFILE_CONFIG.minHumansForStats) return;

    // Only humans carrying a persistent profile are tracked.
    const tracked = humans.filter((p) => p.profileId);
    if (tracked.length === 0) return;

    // ---- Per-round placement, derived from remaining hand points --------------
    // Winner (empty hand) is forced to 1st; everyone else ranks by ascending
    // remaining points (fewer left = better finish).
    const ranked = room.players
      .filter((p) => game.hands[p.id])
      .map((p) => ({
        id: p.id,
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

    if (!matchWon) return;

    // ---- Match-level commit ---------------------------------------------------
    // Final standings by cumulative score (higher = better; winner hit target).
    const scores = match.scores;
    const standings = [...room.players]
      .map((p) => ({ name: p.name, score: scores[p.name.toLowerCase()] ?? 0 }))
      .sort((a, b) => b.score - a.score);
    const matchPlacement = new Map<string, number>();
    standings.forEach((s, i) => matchPlacement.set(s.name.toLowerCase(), i + 1));

    const winnerName = match.matchWinnerName ?? result.winnerName;
    const winnerScore = scores[winnerName.toLowerCase()] ?? 0;
    const durationMs = match.matchStartedAt ? Math.max(0, Date.now() - match.matchStartedAt) : 0;
    const players: MatchPlayerRecord[] = standings.map((s) => ({
      name: s.name,
      placement: matchPlacement.get(s.name.toLowerCase()) ?? 0,
    }));
    const houseRulesSummary = this.summarizeHouseRules(room.houseRules);

    for (const p of tracked) {
      const lname = p.name.toLowerCase();
      const placement = matchPlacement.get(lname) ?? 0;
      const won = winnerName.toLowerCase() === lname;
      const myScore = scores[lname] ?? 0;
      const record: MatchRecord = {
        date: Date.now(),
        players,
        winnerName,
        placement,
        durationMs,
        rounds: match.round,
        settings: { targetScore: match.targetScore, houseRulesSummary },
      };
      profileManager.applyMatchResult(p.profileId!, {
        won,
        placement,
        record,
        playTimeMs: durationMs,
        lossMargin: won ? null : Math.max(0, winnerScore - myScore),
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

