import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { roomManager } from './rooms/roomManager';
import { createRoomStore } from './rooms/roomStore';
import { drawCardAction, playCardAction, chooseColorAction, callUnoAction, passTurnAction } from './game/actions';
import { CardColor } from './game/deck';
import { logger } from './utils/logger';
import type { ZodType } from 'zod';
import {
  createRoomSchema,
  joinRoomSchema,
  sendReactionSchema,
  webrtcSignalSchema,
  voiceStatusSchema,
  playCardSchema,
  chooseColorSchema,
} from './validation/socketSchemas';

// Load environment variables from backend/.env if present (optional in dev).
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to process defaults. This is fine for local dev.
}

// ---- Turn timer --------------------------------------------------------------
// Each active turn is given a deadline. If the active player (or color chooser)
// does nothing before it expires, the server auto-resolves the turn so a single
// AFK or disconnected player can't freeze the table forever.

const TURN_DURATION_MS = Number(process.env.TURN_TIMEOUT_MS) || 45000;
const turnTimers = new Map<string, NodeJS.Timeout>();
// Tracks which turn (status + active socket id) the current timer belongs to, so
// idempotent re-broadcasts (e.g. a reconnect) don't restart the clock.
const turnSignatures = new Map<string, string>();

function turnSignatureOf(game: { status: string; currentPlayerId: string; colorChooserId: string | null; drawnCardId?: string | null }): string {
  const activeId = game.status === 'awaiting_color_selection' ? game.colorChooserId : game.currentPlayerId;
  // Opening a draw-then-play decision window keeps the same player & status but is
  // a distinct timed phase, so fold it into the signature to (re)arm a fresh clock.
  const decision = game.drawnCardId ? ':decision' : '';
  return `${game.status}:${activeId}${decision}`;
}

function clearTurnTimer(code: string) {
  const existing = turnTimers.get(code);
  if (existing) clearTimeout(existing);
  turnTimers.delete(code);
  turnSignatures.delete(code);
}

// Pick a sensible color for an AFK player's pending Wild: their most-held color.
function pickAutoColor(hands: Record<string, { color: string }[]>, playerId: string): CardColor {
  const counts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of hands[playerId] || []) {
    if (card.color in counts) counts[card.color]++;
  }
  let best: CardColor = 'red';
  let bestN = -1;
  (['red', 'blue', 'green', 'yellow'] as CardColor[]).forEach((c) => {
    if (counts[c] > bestN) { best = c; bestN = counts[c]; }
  });
  return best;
}

// Arm (or refresh) the timer for the room's current turn. Called from
// broadcastGameState after every state change so the deadline rides along in
// the payload. No-op if the turn signature is unchanged.
function armTurnTimer(code: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) { clearTurnTimer(code); return; }
  const game = room.game;

  const timed = game.status === 'playing' || game.status === 'awaiting_color_selection';
  // A timer only makes sense with at least 2 players actively in the game.
  if (!timed || room.players.length < 2) {
    clearTurnTimer(code);
    game.turnDeadline = null;
    return;
  }

  const signature = turnSignatureOf(game);
  if (turnSignatures.get(code) === signature && turnTimers.has(code)) {
    return; // Same turn already being timed — don't reset the clock.
  }

  clearTurnTimer(code);
  game.turnDeadline = Date.now() + TURN_DURATION_MS;
  turnSignatures.set(code, signature);
  turnTimers.set(code, setTimeout(() => handleTurnTimeout(code, signature), TURN_DURATION_MS));
}

// Fired when a turn's deadline expires. Auto-draws (playing) or auto-picks a
// color (awaiting_color_selection) for the stalled player, then re-broadcasts.
function handleTurnTimeout(code: string, signature: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) { clearTurnTimer(code); return; }
  const game = room.game;

  // The turn moved on between scheduling and firing — ignore this stale timeout.
  if (turnSignatureOf(game) !== signature) return;

  try {
    if (game.status === 'awaiting_color_selection' && game.colorChooserId) {
      const color = pickAutoColor(game.hands, game.colorChooserId);
      logger.info(`[TURN_TIMEOUT] Auto-choosing '${color}' for ${game.colorChooserId} in room ${code}`);
      room.game = chooseColorAction(game, room.players, game.colorChooserId, color);
    } else if (game.status === 'playing') {
      const activePlayerId = game.currentPlayerId;
      if (game.drawnCardId) {
        // Already drew a playable card and is sitting on the decision — pass for them.
        logger.info(`[TURN_TIMEOUT] Auto-passing drawn-card decision for ${activePlayerId} in room ${code}`);
        room.game = passTurnAction(game, room.players, activePlayerId);
      } else {
        logger.info(`[TURN_TIMEOUT] Auto-drawing for ${activePlayerId} in room ${code}`);
        room.game = drawCardAction(game, room.players, activePlayerId);
        // If the forced draw produced a playable card, don't make the table wait
        // another full timeout — immediately pass on the AFK player's behalf.
        if (room.game.drawnCardId) {
          room.game = passTurnAction(room.game, room.players, activePlayerId);
        }
      }
    } else {
      return;
    }
    broadcastGameState(code);
  } catch (err: any) {
    logger.error(`[TURN_TIMEOUT] Failed to auto-resolve turn in room ${code}:`, err.message);
    clearTurnTimer(code);
  }
}

// Helper to sanitize and broadcast game state to each player individually
function broadcastGameState(code: string) {
  const room = roomManager.getRoom(code);
  if (!room || !room.game) return;

  const game = room.game;

  // Safety: validate currentPlayerId references an actual player in the room
  if (game.status === 'playing' || game.status === 'awaiting_color_selection') {
    const currentPlayerExists = room.players.some(p => p.id === game.currentPlayerId);
    if (!currentPlayerExists && room.players.length > 0) {
      const fallback = room.players[0];
      logger.debug(`[TURN_RECOVERY] currentPlayerId '${game.currentPlayerId}' is stale (no matching player). Resetting to ${fallback.name} (${fallback.id})`);
      game.currentPlayerId = fallback.id;
      // Also reset color selection state if stale
      if (game.status === 'awaiting_color_selection') {
        game.status = 'playing';
        game.colorChooserId = null;
      }
    }
  }

  // Arm/refresh the turn timer before building the payload so the deadline is
  // included in this broadcast.
  armTurnTimer(code);

  const activePlayerObj = room.players.find(p => p.id === game.currentPlayerId);
  const activePlayerName = activePlayerObj ? activePlayerObj.name : 'Unknown';
  logger.debug(`[GAME_STATE_UPDATED] roomId: ${room.code}, turnPlayerId: ${game.currentPlayerId}, turnPlayerName: ${activePlayerName}, drawPileLength: ${game.deck.length}, discardPileLength: ${game.discardPile.length}`);
  
  room.players.forEach((p) => {
    logger.debug(`  Player -> playerId: ${p.id}, socketId: ${p.id}, seat: ${p.seatNumber}, cards.length: ${game.hands[p.id]?.length || 0}`);
  });
  
  room.players.forEach((targetPlayer) => {
    // Sanitize hands: targetPlayer sees their own cards, and placeholders for others
    const sanitizedHands: Record<number, any[]> = {};
    
    room.players.forEach((p) => {
      const isTarget = p.id === targetPlayer.id;
      const actualHand = game.hands[p.id] || [];
      if (isTarget) {
        sanitizedHands[p.seatNumber] = actualHand;
      } else {
        sanitizedHands[p.seatNumber] = actualHand.map((c, idx) => ({
          id: `${p.id}-back-${idx}`,
          color: 'wild',
          value: 'wild',
        }));
      }
    });

    const activePlayerObj = room.players.find(p => p.id === game.currentPlayerId);
    const activeSeat = activePlayerObj ? activePlayerObj.seatNumber : 1;

    const winnerObj = game.winnerId ? room.players.find(p => p.id === game.winnerId) : null;

    logger.debug(`[BROADCAST] Room ${room.code} Player ${targetPlayer.id} Discard Pile Length: ${game.discardPile?.length}`);

    io.to(targetPlayer.id).emit('game-updated', {
      roomCode: room.code,
      hands: sanitizedHands,
      discardPile: game.discardPile,
      drawPileCount: game.deck.length,
      currentPlayerId: game.currentPlayerId,
      currentPlayerSeat: activeSeat,
      direction: game.direction,
      wildColor: game.wildColor,
      gameStatus: game.status,
      colorChooserId: game.colorChooserId,
      winnerId: game.winnerId,
      winnerName: winnerObj ? winnerObj.name : null,
      unoCalled: game.unoCalled,
      drawStack: game.drawStack,
      pendingDrawType: game.pendingDrawType,
      drawnCardId: game.drawnCardId ?? null,
      turnDeadline: game.turnDeadline ?? null,
      lastAction: game.lastAction,
    });
  });

  const activePlayer = room.players.find(p => p.id === game.currentPlayerId);
  if (activePlayer) {
    logger.debug(`[TURN_START] Player: ${activePlayer.name} (${game.currentPlayerId})`);
  }

  // Persist the room after every game-state broadcast. All in-game mutations
  // (play/draw/pass/chooseColor/UNO, plus reconnection remaps) flow through here,
  // so this single hook covers durability for active games. Coalesced + async
  // inside the manager, so it never blocks the broadcast.
  roomManager.markDirty(code);
}

const app = express();
const port = process.env.PORT || 3001;

// Allowed CORS origins. Comma-separated env var; "*" (default) allows all.
// In production set CORS_ORIGIN to your real frontend URL(s).
const corsEnv = process.env.CORS_ORIGIN || '*';
const corsOrigin: string | string[] = corsEnv === '*'
  ? '*'
  : corsEnv.split(',').map((o) => o.trim()).filter(Boolean);

// Middlewares
app.use(cors({
  origin: corsOrigin,
}));
app.use(express.json());

// --- REST APIs ---

// Create Room API
app.post('/api/rooms', (req, res) => {
  try {
    const room = roomManager.createRoom();
    logger.debug(`[REST] Created room: ${room.code}`);
    res.status(201).json({ code: room.code });
  } catch (error: any) {
    logger.error('[REST] Error creating room:', error);
    res.status(500).json({ error: error.message || 'Failed to create room' });
  }
});

// Join Room API (Validation step)
app.post('/api/rooms/join', (req, res) => {
  const { code, name } = req.body;

  if (!code || !name) {
    res.status(400).json({ error: 'Room code and display name are required' });
    return;
  }

  const room = roomManager.getRoom(code);
  if (!room) {
    const availableRooms = roomManager.getAvailableRooms().join(', ');
    const roomCount = roomManager.getRoomCount();
    logger.debug(`[ROOM_NOT_FOUND] (REST) requested: ${code.toUpperCase()}, available: ${availableRooms || 'None'}, roomCount: ${roomCount}`);
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  // If player is reconnecting with same name, allow it
  const isReconnecting = room.players.some(p => p.name.toLowerCase() === name.toLowerCase());
  
  let isSpectator = false;
  if (!isReconnecting) {
    if (room.players.length >= 6) {
      isSpectator = true;
    }
  }

  logger.debug(`[REST] Validated join request for name "${name}" to room ${code} (isSpectator: ${isSpectator})`);
  res.status(200).json({ success: true, isSpectator });
});

// --- Socket.IO Server Setup ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  logger.debug(`[Socket] Client connected: ${socket.id}`);

  // Track room code on the socket object for easier disconnect handling
  let currentRoomCode: string | null = null;
  let currentName: string | null = null;

  /**
   * Wrap a socket handler with schema validation. The returned listener parses the
   * raw payload against `schema`; on success it invokes `handler` with the typed,
   * sanitized value, on failure it emits a clean `error` back to just that client.
   * Any exception thrown inside the handler is also caught here so a single bad
   * actor can never take down the process (or the room). This is the core of the
   * hardening: previously handlers destructured raw payloads and a malformed one
   * threw an uncaught exception inside the listener.
   */
  function guard<T>(
    schema: ZodType<T>,
    handler: (data: T) => void
  ): (payload: unknown) => void {
    return (payload: unknown) => {
      const result = schema.safeParse(payload);
      if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue?.path?.join('.') || 'payload';
        logger.debug(`[VALIDATION] Rejected ${socket.id} payload (${where}: ${issue?.message})`);
        socket.emit('error', { message: `Invalid request: ${where} ${issue?.message ?? 'is invalid'}` });
        return;
      }
      try {
        handler(result.data);
      } catch (err: any) {
        logger.error(`[Socket] Unhandled handler error for ${socket.id}:`, err?.message);
        socket.emit('error', { message: err?.message || 'Something went wrong processing your request.' });
      }
    };
  }

  // Create room event (alternative pathway)
  socket.on('create-room', guard(createRoomSchema, ({ name }) => {
    try {
      const room = roomManager.createRoom();
      const { player, isSpectator } = roomManager.joinRoom(room.code, name, socket.id);

      currentRoomCode = room.code;
      currentName = name;
      socket.join(room.code);

      logger.debug(`[Socket] Host ${name} (${socket.id}) created and joined room ${room.code}`);

      // The owner receives their own player object including its private secret;
      // the room is sanitized so no other player's secret is exposed.
      socket.emit('lobby-updated', roomManager.publicRoom(room));
      socket.emit('joined-successfully', { room: roomManager.publicRoom(room), player, isSpectator });
    } catch (error: any) {
      socket.emit('error', { message: error.message || 'Failed to create room via socket' });
    }
  }));

  // Join room socket handler
  socket.on('join-room', guard(joinRoomSchema, ({ code, name, secret }) => {
    if (currentRoomCode) {
      logger.debug(`[Socket] Duplicate join-room blocked for socket ${socket.id}. Already in room ${currentRoomCode}`);
      return;
    }

    try {
      const upperCode = code.toUpperCase();
      const { room, player, isSpectator } = roomManager.joinRoom(upperCode, name, socket.id, secret);

      currentRoomCode = upperCode;
      currentName = name;
      socket.join(upperCode);

      if (isSpectator) {
        logger.debug(`[Socket] Spectator ${name} (${socket.id}) joined room ${upperCode}`);
      } else {
        logger.debug(`[Socket] Player ${name} (${socket.id}) joined room ${upperCode} at Seat ${player?.seatNumber}`);
      }

      // Notify the joining socket. Their own player object keeps its secret so
      // they can prove identity on reconnect; the room view is sanitized.
      socket.emit('joined-successfully', { room: roomManager.publicRoom(room), player, isSpectator });

      if (isSpectator) {
        // Notify others that a spectator joined
        socket.to(upperCode).emit('spectator-joined', { name, id: socket.id });
      } else if (player) {
        // Notify others that a player joined (without the secret)
        socket.to(upperCode).emit('player-joined', roomManager.publicPlayer(player));
      }

      // Broadcast the updated lobby state to all players in the room
      io.to(upperCode).emit('lobby-updated', roomManager.publicRoom(room));

      // If game is active, broadcast latest state immediately so they recover hands
      if (room.status === 'playing') {
        broadcastGameState(upperCode);
      }
    } catch (error: any) {
      logger.error(`[Socket] Join error for client ${socket.id}:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to join room' });
    }
  }));

  // Send reaction socket handler
  socket.on('send-reaction', guard(sendReactionSchema, ({ emoji }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    const spectator = room.spectators?.find(s => s.id === socket.id);
    const name = player ? player.name : (spectator ? spectator.name : 'Unknown');
    const seatNumber = player ? player.seatNumber : null;
    const isSpectator = !player;

    logger.debug(`[REACTION] ${name} sent emoji ${emoji} in room ${currentRoomCode}`);
    io.to(currentRoomCode).emit('player-reacted', { name, seatNumber, emoji, isSpectator });
  }));

  // WebRTC Signaling
  socket.on('webrtc-signal', guard(webrtcSignalSchema, ({ targetId, signalData }) => {
    // Relay the signal to the specific target socket
    io.to(targetId).emit('webrtc-signal', { sourceId: socket.id, signalData });
  }));

  // Voice Status Updates (e.g. mic muted)
  socket.on('voice-status', guard(voiceStatusSchema, ({ isMuted }) => {
    if (!currentRoomCode) return;
    // Broadcast to everyone else in the room
    socket.to(currentRoomCode).emit('voice-status-changed', { playerId: socket.id, isMuted });
  }));


  // Trigger game start (host only)
  socket.on('start-game', () => {
    if (!currentRoomCode) return;

    try {
      const room = roomManager.startGame(currentRoomCode, socket.id);
      logger.debug(`[Socket] Room ${currentRoomCode} game started by host ${socket.id}`);

      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
      io.to(currentRoomCode).emit('game-started', roomManager.publicRoom(room));

      // Broadcast initial game state to all players
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Start game error for room ${currentRoomCode}:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to start game' });
    }
  });

  // Play card event
  socket.on('play-card', guard(playCardSchema, ({ cardId }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[CARD_PLAYED] Player: ${playerName}, Card: ${cardId}`);

      // Proactive stale-turn recovery: if currentPlayerId doesn't match any active player, fix it
      const currentTurnValid = room.players.some(p => p.id === room.game!.currentPlayerId);
      if (!currentTurnValid && player) {
        logger.debug(`[TURN_RECOVERY] currentPlayerId '${room.game!.currentPlayerId}' is stale. Recovering to ${playerName} (${socket.id})`);
        room.game!.currentPlayerId = socket.id;
      }

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = playCardAction(room.game, room.players, socket.id, cardId);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);

      // Notify the room when a play triggered the automatic +4 UNO penalty so
      // clients can surface it (the player forgot to declare UNO at 2 cards).
      if (updatedGame.lastAction?.type === 'play' && updatedGame.lastAction.unoPenalty) {
        io.to(currentRoomCode).emit('uno-penalty', {
          playerId: updatedGame.lastAction.playerId,
          playerName: player ? player.name : 'A player',
        });
      }

      if (updatedGame.status === 'ended') {
        clearTurnTimer(currentRoomCode);
        logger.debug(`[Socket] Game in room ${currentRoomCode} ended. Winner: ${currentName}`);
        io.to(currentRoomCode).emit('game-ended', {
          winnerId: socket.id,
          winnerName: currentName
        });
      }
    } catch (error: any) {
      logger.error(`[Socket] Play card error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to play card' });
    }
  }));

  // Draw card event
  socket.on('draw-card', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[CARD_DRAWN] Player: ${playerName}`);

      // Proactive stale-turn recovery
      const currentTurnValid = room.players.some(p => p.id === room.game!.currentPlayerId);
      if (!currentTurnValid && player) {
        logger.debug(`[TURN_RECOVERY] currentPlayerId '${room.game!.currentPlayerId}' is stale. Recovering to ${playerName} (${socket.id})`);
        room.game!.currentPlayerId = socket.id;
      }

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = drawCardAction(room.game, room.players, socket.id);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Draw card error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to draw card' });
    }
  });

  // Pass-turn event — the player drew a playable card but chose not to play it.
  socket.on('pass-turn', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[TURN_PASSED] Player: ${playerName}`);

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = passTurnAction(room.game, room.players, socket.id);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Pass turn error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to pass turn' });
    }
  });

  // Choose color event
  socket.on('choose-color', guard(chooseColorSchema, ({ color }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = chooseColorAction(room.game, room.players, socket.id, color);
      room.game = updatedGame;

      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      logger.debug(`[Socket] Player ${playerName} selected color ${color}`);

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        logger.debug(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Choose color error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to select color' });
    }
  }));

  // Call UNO event
  socket.on('call-uno', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const updatedGame = callUnoAction(room.game, socket.id);
      room.game = updatedGame;

      logger.debug(`[Socket] Player ${currentName} (${socket.id}) called UNO in room ${currentRoomCode}`);
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      logger.error(`[Socket] Call UNO error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to call UNO' });
    }
  });

  // Manual leave-room event
  socket.on('leave-room', () => {
    handleLeave();
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (!currentRoomCode) return;

    const room = roomManager.getRoom(currentRoomCode);
    const player = room ? room.players.find(p => p.id === socket.id) : null;
    const spectator = room ? room.spectators?.find(s => s.id === socket.id) : null;
    const name = player ? player.name : (spectator ? spectator.name : 'Unknown');

    logger.debug(`[PLAYER_DISCONNECTED] Name: ${name} (${socket.id}), Room: ${currentRoomCode}`);

    const tempRoomCode = currentRoomCode;
    const graceInfo = roomManager.startDisconnectGracePeriod(socket.id, tempRoomCode, (result) => {
      const { room: updatedRoom, leftPlayer, leftSpectator, gameStopped } = result;

      if (leftPlayer) {
        logger.debug(`[Socket] Disconnect grace period expired. Player ${leftPlayer.name} left room ${tempRoomCode}`);
        io.to(tempRoomCode).emit('player-left', roomManager.publicPlayer(leftPlayer));
      } else if (leftSpectator) {
        logger.debug(`[Socket] Disconnect grace period expired. Spectator ${leftSpectator.name} left room ${tempRoomCode}`);
        io.to(tempRoomCode).emit('spectator-left', { id: leftSpectator.id, name: leftSpectator.name });
      }

      if (updatedRoom) {
        // Game was stopped because too few players remain — tell clients to reset to lobby
        if (gameStopped) {
          logger.debug(`[Socket] Game stopped in room ${tempRoomCode} (not enough players).`);
          clearTurnTimer(tempRoomCode);
          io.to(tempRoomCode).emit('game-stopped', { room: roomManager.publicRoom(updatedRoom) });
        }
        io.to(tempRoomCode).emit('lobby-updated', roomManager.publicRoom(updatedRoom));
        if (updatedRoom.status === 'playing') {
          broadcastGameState(tempRoomCode);
        }
      }
    });

    if (graceInfo) {
      logger.debug(`[Socket] Seat/Spectator slot retained during disconnect grace period for ${name} (${socket.id})`);
    } else {
      handleLeave();
    }
  });

  // Common cleanup logic for explicit leave
  function handleLeave() {
    if (!currentRoomCode) return;

    const result = roomManager.leaveRoom(socket.id);
    if (result) {
      const { room: updatedRoom, leftPlayer, leftSpectator, gameStopped } = result;
      if (leftPlayer) {
        logger.debug(`[Socket] Player ${leftPlayer.name} left room ${currentRoomCode}`);
        socket.to(currentRoomCode).emit('player-left', roomManager.publicPlayer(leftPlayer));
      } else if (leftSpectator) {
        logger.debug(`[Socket] Spectator ${leftSpectator.name} left room ${currentRoomCode}`);
        socket.to(currentRoomCode).emit('spectator-left', { id: leftSpectator.id, name: leftSpectator.name });
      }

      socket.leave(currentRoomCode);

      if (updatedRoom) {
        // Game was stopped because too few players remain — tell clients to reset to lobby
        if (gameStopped) {
          logger.debug(`[Socket] Game stopped in room ${currentRoomCode} (not enough players).`);
          clearTurnTimer(currentRoomCode);
          io.to(currentRoomCode).emit('game-stopped', { room: roomManager.publicRoom(updatedRoom) });
        }
        // Broadcast the updated lobby to remaining players
        io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(updatedRoom));
        if (updatedRoom.status === 'playing') {
          broadcastGameState(currentRoomCode);
        }
      }
    }

    currentRoomCode = null;
    currentName = null;
  }

});

// Start Server — build the durable store, rehydrate any in-progress rooms, then
// begin accepting connections so reconnecting players find their game intact.
async function start() {
  const store = await createRoomStore();
  roomManager.setStore(store);
  try {
    await roomManager.hydrate();
  } catch (err: any) {
    logger.error('[STORE] Hydration failed (starting with no restored rooms):', err?.message);
  }

  server.listen(port, () => {
    logger.info(`===============================================`);
    logger.info(`  Unoverse Backend Server running on port ${port}  `);
    logger.info(`  Log level: ${logger.level}`);
    logger.info(`  Rooms persisted: ${roomManager.getRoomCount()} restored`);
    logger.info(`===============================================`);
  });
}

start();

// Last-resort safety net. The per-handler guard() should catch everything, but if
// any async path throws unexpectedly we log it and keep the process alive rather
// than letting a single bad event take down every active room.
process.on('uncaughtException', (err) => {
  logger.error('[FATAL] Uncaught exception (server kept alive):', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('[FATAL] Unhandled promise rejection (server kept alive):', reason);
});
