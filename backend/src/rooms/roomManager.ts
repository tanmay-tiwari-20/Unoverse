import { randomUUID } from 'crypto';
import { UnoGameState } from '../game/gameState';
import { startGameState } from '../game/actions';
import { getNextPlayerIndex } from '../game/turnManager';
import { logger } from '../utils/logger';
import { RoomStore, MemoryRoomStore } from './roomStore';

export interface Player {
  id: string; // Socket ID
  name: string;
  seatNumber: number; // 1 to 6
  isHost: boolean;
  secret: string; // Private per-session token. Never broadcast to other clients.
}

export interface Spectator {
  id: string; // Socket ID
  name: string;
  secret: string; // Private per-session token. Never broadcast to other clients.
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  spectators?: Spectator[];
  status: 'lobby' | 'playing';
  game?: UnoGameState;
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
  public createRoom(): Room {
    const code = this.generateRoomCode();
    const newRoom: Room = {
      code,
      hostId: '',
      players: [],
      status: 'lobby',
    };
    this.rooms.set(code, newRoom);
    logger.debug(`[ROOM_CREATED] Code: ${code}`);
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

  public publicRoom(room: Room): Room {
    return {
      ...room,
      players: room.players.map((p) => this.publicPlayer(p) as Player),
      spectators: room.spectators?.map((s) => {
        const { secret, ...rest } = s;
        return rest as Spectator;
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
    secret?: string
  ): { room: Room; player: Player | null; isSpectator: boolean } {
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
    logger.debug(`[ROOM_CAPACITY] Room: ${upperCode}, Capacity: 6`);

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
        return { room, player: null, isSpectator: true };
      }
    }

    // Spectator Check: Only if the room has 6 or more seated players
    const shouldSpectate = room.players.length >= 6;

    if (shouldSpectate) {
      if (!room.spectators) {
        room.spectators = [];
      }
      // Reconnection or duplicate checks for spectators
      let spectator = room.spectators.find((s) => s.id === playerSocketId);
      if (!spectator) {
        spectator = { id: playerSocketId, name: playerName, secret: randomUUID() };
        room.spectators.push(spectator);
      }
      logger.debug(`[PLAYER_ASSIGNED_SPECTATOR] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      logger.debug(`[ROOM_JOIN] Spectator: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
      this.markDirty(room.code);
      return { room, player: null, isSpectator: true };
    }

    // Stable Seating System: Find the lowest vacant seat number between 1 and 6
    const occupiedSeats = new Set(room.players.map((p) => p.seatNumber));
    let seatNumber = 1;
    for (let i = 1; i <= 6; i++) {
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

        // Clean up game state if a game is active
        if (room.game && room.players.length >= 2) {
          // Enough players remain — keep the game going.
          const game = room.game;

          // Remove the player's hand
          delete game.hands[playerSocketId];
          delete game.unoCalled[playerSocketId];

          // If the leaving player was the color chooser, reset to playing and advance turn
          if (game.colorChooserId === playerSocketId) {
            game.colorChooserId = null;
            game.status = 'playing';
          }

          // If it was the leaving player's turn, advance to the next valid player
          if (game.currentPlayerId === playerSocketId) {
            // Find next player from the remaining players array
            // Use index 0 as fallback since the leaving player is already removed
            const nextIdx = room.players.length > 0 ? 0 : -1;
            if (nextIdx >= 0) {
              game.currentPlayerId = room.players[nextIdx].id;
              logger.debug(`[TURN_ADVANCED_ON_LEAVE] Next Player: ${room.players[nextIdx].name} (${room.players[nextIdx].id})`);
            }
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

        // If the player was the host and there are other players, elect a new host
        if (leftPlayer.isHost && room.players.length > 0) {
          room.players[0].isHost = true;
          room.hostId = room.players[0].id;
        }

        // The last remaining player always becomes the host (e.g. when a game is stopped).
        if (room.players.length === 1 && !room.players[0].isHost) {
          room.players[0].isHost = true;
          room.hostId = room.players[0].id;
          logger.debug(`[HOST_ASSIGNED] ${room.players[0].name} is now the host of room ${code}`);
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

  // Set room game status to playing
  public startGame(code: string, hostSocketId: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.hostId !== hostSocketId) {
      throw new Error('Only the host can start the game');
    }
    if (room.players.length < 2) {
      throw new Error('At least 2 players are required to start the game');
    }

    room.status = 'playing';
    room.game = startGameState(room.players);
    this.markDirty(code);
    return room;
  }
}

export const roomManager = new RoomManager();

