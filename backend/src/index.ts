import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { roomManager } from './rooms/roomManager';
import { drawCardAction, playCardAction, chooseColorAction, callUnoAction, catchUnoAction } from './game/actions';
import { CardColor } from './game/deck';

// Load environment variables from backend/.env if present (optional in dev).
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to process defaults. This is fine for local dev.
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
      console.log(`[TURN_RECOVERY] currentPlayerId '${game.currentPlayerId}' is stale (no matching player). Resetting to ${fallback.name} (${fallback.id})`);
      game.currentPlayerId = fallback.id;
      // Also reset color selection state if stale
      if (game.status === 'awaiting_color_selection') {
        game.status = 'playing';
        game.colorChooserId = null;
      }
    }
  }

  const activePlayerObj = room.players.find(p => p.id === game.currentPlayerId);
  const activePlayerName = activePlayerObj ? activePlayerObj.name : 'Unknown';
  console.log(`[GAME_STATE_UPDATED] roomId: ${room.code}, turnPlayerId: ${game.currentPlayerId}, turnPlayerName: ${activePlayerName}, drawPileLength: ${game.deck.length}, discardPileLength: ${game.discardPile.length}`);
  
  room.players.forEach((p) => {
    console.log(`  Player -> playerId: ${p.id}, socketId: ${p.id}, seat: ${p.seatNumber}, cards.length: ${game.hands[p.id]?.length || 0}`);
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

    console.log(`[BROADCAST] Room ${room.code} Player ${targetPlayer.id} Discard Pile Length: ${game.discardPile?.length}`);

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
      lastAction: game.lastAction,
    });
  });

  const activePlayer = room.players.find(p => p.id === game.currentPlayerId);
  if (activePlayer) {
    console.log(`[TURN_START] Player: ${activePlayer.name} (${game.currentPlayerId})`);
  }
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
    console.log(`[REST] Created room: ${room.code}`);
    res.status(201).json({ code: room.code });
  } catch (error: any) {
    console.error('[REST] Error creating room:', error);
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
    console.log(`[ROOM_NOT_FOUND] (REST) requested: ${code.toUpperCase()}, available: ${availableRooms || 'None'}, roomCount: ${roomCount}`);
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

  console.log(`[REST] Validated join request for name "${name}" to room ${code} (isSpectator: ${isSpectator})`);
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
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Track room code on the socket object for easier disconnect handling
  let currentRoomCode: string | null = null;
  let currentName: string | null = null;

  // Create room event (alternative pathway)
  socket.on('create-room', ({ name }: { name: string }) => {
    try {
      const room = roomManager.createRoom();
      const { player, isSpectator } = roomManager.joinRoom(room.code, name, socket.id);

      currentRoomCode = room.code;
      currentName = name;
      socket.join(room.code);

      console.log(`[Socket] Host ${name} (${socket.id}) created and joined room ${room.code}`);

      // The owner receives their own player object including its private secret;
      // the room is sanitized so no other player's secret is exposed.
      socket.emit('lobby-updated', roomManager.publicRoom(room));
      socket.emit('joined-successfully', { room: roomManager.publicRoom(room), player, isSpectator });
    } catch (error: any) {
      socket.emit('error', { message: error.message || 'Failed to create room via socket' });
    }
  });

  // Join room socket handler
  socket.on('join-room', ({ code, name, secret }: { code: string; name: string; secret?: string }) => {
    if (currentRoomCode) {
      console.log(`[Socket] Duplicate join-room blocked for socket ${socket.id}. Already in room ${currentRoomCode}`);
      return;
    }

    try {
      const upperCode = code.toUpperCase();
      const { room, player, isSpectator } = roomManager.joinRoom(upperCode, name, socket.id, secret);

      currentRoomCode = upperCode;
      currentName = name;
      socket.join(upperCode);

      if (isSpectator) {
        console.log(`[Socket] Spectator ${name} (${socket.id}) joined room ${upperCode}`);
      } else {
        console.log(`[Socket] Player ${name} (${socket.id}) joined room ${upperCode} at Seat ${player?.seatNumber}`);
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
      console.error(`[Socket] Join error for client ${socket.id}:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to join room' });
    }
  });

  // Send reaction socket handler
  socket.on('send-reaction', ({ emoji }: { emoji: string }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    const spectator = room.spectators?.find(s => s.id === socket.id);
    const name = player ? player.name : (spectator ? spectator.name : 'Unknown');
    const seatNumber = player ? player.seatNumber : null;
    const isSpectator = !player;

    console.log(`[REACTION] ${name} sent emoji ${emoji} in room ${currentRoomCode}`);
    io.to(currentRoomCode).emit('player-reacted', { name, seatNumber, emoji, isSpectator });
  });

  // WebRTC Signaling
  socket.on('webrtc-signal', ({ targetId, signalData }: { targetId: string; signalData: any }) => {
    // Relay the signal to the specific target socket
    io.to(targetId).emit('webrtc-signal', { sourceId: socket.id, signalData });
  });

  // Voice Status Updates (e.g. mic muted)
  socket.on('voice-status', ({ isMuted }: { isMuted: boolean }) => {
    if (!currentRoomCode) return;
    // Broadcast to everyone else in the room
    socket.to(currentRoomCode).emit('voice-status-changed', { playerId: socket.id, isMuted });
  });


  // Trigger game start (host only)
  socket.on('start-game', () => {
    if (!currentRoomCode) return;

    try {
      const room = roomManager.startGame(currentRoomCode, socket.id);
      console.log(`[Socket] Room ${currentRoomCode} game started by host ${socket.id}`);

      io.to(currentRoomCode).emit('lobby-updated', roomManager.publicRoom(room));
      io.to(currentRoomCode).emit('game-started', roomManager.publicRoom(room));

      // Broadcast initial game state to all players
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      console.error(`[Socket] Start game error for room ${currentRoomCode}:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to start game' });
    }
  });

  // Play card event
  socket.on('play-card', ({ cardId, playerId }: { cardId: string; playerId: string }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      console.log(`[CARD_PLAYED] Player: ${playerName}, Card: ${cardId}`);

      // Proactive stale-turn recovery: if currentPlayerId doesn't match any active player, fix it
      const currentTurnValid = room.players.some(p => p.id === room.game!.currentPlayerId);
      if (!currentTurnValid && player) {
        console.log(`[TURN_RECOVERY] currentPlayerId '${room.game!.currentPlayerId}' is stale. Recovering to ${playerName} (${socket.id})`);
        room.game!.currentPlayerId = socket.id;
      }

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = playCardAction(room.game, room.players, socket.id, cardId);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        console.log(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);

      if (updatedGame.status === 'ended') {
        console.log(`[Socket] Game in room ${currentRoomCode} ended. Winner: ${currentName}`);
        io.to(currentRoomCode).emit('game-ended', { 
          winnerId: socket.id, 
          winnerName: currentName 
        });
      }
    } catch (error: any) {
      console.error(`[Socket] Play card error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to play card' });
    }
  });

  // Draw card event
  socket.on('draw-card', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      console.log(`[CARD_DRAWN] Player: ${playerName}`);

      // Proactive stale-turn recovery
      const currentTurnValid = room.players.some(p => p.id === room.game!.currentPlayerId);
      if (!currentTurnValid && player) {
        console.log(`[TURN_RECOVERY] currentPlayerId '${room.game!.currentPlayerId}' is stale. Recovering to ${playerName} (${socket.id})`);
        room.game!.currentPlayerId = socket.id;
      }

      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = drawCardAction(room.game, room.players, socket.id);
      room.game = updatedGame;

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        console.log(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      console.error(`[Socket] Draw card error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to draw card' });
    }
  });

  // Choose color event
  socket.on('choose-color', ({ color }: { color: CardColor }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const oldPlayerId = room.game.currentPlayerId;
      const updatedGame = chooseColorAction(room.game, room.players, socket.id, color);
      room.game = updatedGame;

      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      console.log(`[Socket] Player ${playerName} selected color ${color}`);

      if (updatedGame.currentPlayerId !== oldPlayerId) {
        const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
        const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
        console.log(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
      }

      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      console.error(`[Socket] Choose color error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to select color' });
    }
  });

  // Call UNO event
  socket.on('call-uno', () => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const updatedGame = callUnoAction(room.game, socket.id);
      room.game = updatedGame;

      console.log(`[Socket] Player ${currentName} (${socket.id}) called UNO in room ${currentRoomCode}`);
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      console.error(`[Socket] Call UNO error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to call UNO' });
    }
  });

  // Catch UNO event
  socket.on('catch-uno', ({ targetPlayerId }: { targetPlayerId: string }) => {
    if (!currentRoomCode) return;
    const room = roomManager.getRoom(currentRoomCode);
    if (!room || !room.game) return;

    try {
      const updatedGame = catchUnoAction(room.game, targetPlayerId);
      room.game = updatedGame;

      console.log(`[Socket] Player ${currentName} caught ${targetPlayerId} not calling UNO in room ${currentRoomCode}`);
      broadcastGameState(currentRoomCode);
    } catch (error: any) {
      console.error(`[Socket] Catch UNO error:`, error.message);
      socket.emit('error', { message: error.message || 'Failed to catch UNO' });
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

    console.log(`[PLAYER_DISCONNECTED] Name: ${name} (${socket.id}), Room: ${currentRoomCode}`);

    const tempRoomCode = currentRoomCode;
    const graceInfo = roomManager.startDisconnectGracePeriod(socket.id, tempRoomCode, (result) => {
      const { room: updatedRoom, leftPlayer, leftSpectator, gameStopped } = result;

      if (leftPlayer) {
        console.log(`[Socket] Disconnect grace period expired. Player ${leftPlayer.name} left room ${tempRoomCode}`);
        io.to(tempRoomCode).emit('player-left', roomManager.publicPlayer(leftPlayer));
      } else if (leftSpectator) {
        console.log(`[Socket] Disconnect grace period expired. Spectator ${leftSpectator.name} left room ${tempRoomCode}`);
        io.to(tempRoomCode).emit('spectator-left', { id: leftSpectator.id, name: leftSpectator.name });
      }

      if (updatedRoom) {
        // Game was stopped because too few players remain — tell clients to reset to lobby
        if (gameStopped) {
          console.log(`[Socket] Game stopped in room ${tempRoomCode} (not enough players).`);
          io.to(tempRoomCode).emit('game-stopped', { room: roomManager.publicRoom(updatedRoom) });
        }
        io.to(tempRoomCode).emit('lobby-updated', roomManager.publicRoom(updatedRoom));
        if (updatedRoom.status === 'playing') {
          broadcastGameState(tempRoomCode);
        }
      }
    });

    if (graceInfo) {
      console.log(`[Socket] Seat/Spectator slot retained during disconnect grace period for ${name} (${socket.id})`);
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
        console.log(`[Socket] Player ${leftPlayer.name} left room ${currentRoomCode}`);
        socket.to(currentRoomCode).emit('player-left', roomManager.publicPlayer(leftPlayer));
      } else if (leftSpectator) {
        console.log(`[Socket] Spectator ${leftSpectator.name} left room ${currentRoomCode}`);
        socket.to(currentRoomCode).emit('spectator-left', { id: leftSpectator.id, name: leftSpectator.name });
      }

      socket.leave(currentRoomCode);

      if (updatedRoom) {
        // Game was stopped because too few players remain — tell clients to reset to lobby
        if (gameStopped) {
          console.log(`[Socket] Game stopped in room ${currentRoomCode} (not enough players).`);
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

// Start Server
server.listen(port, () => {
  console.log(`===============================================`);
  console.log(`  UNO Real Backend Server running on port ${port}  `);
  console.log(`===============================================`);
});
