"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const roomManager_1 = require("./rooms/roomManager");
const actions_1 = require("./game/actions");
// Helper to sanitize and broadcast game state to each player individually
function broadcastGameState(code) {
    const room = roomManager_1.roomManager.getRoom(code);
    if (!room || !room.game)
        return;
    const game = room.game;
    console.log(`[GAME_STATE_UPDATED] Broadcasted to room: ${room.code}`);
    room.players.forEach((targetPlayer) => {
        // Sanitize hands: targetPlayer sees their own cards, and placeholders for others
        const sanitizedHands = {};
        room.players.forEach((p) => {
            const isTarget = p.id === targetPlayer.id;
            const actualHand = game.hands[p.id] || [];
            if (isTarget) {
                sanitizedHands[p.seatNumber] = actualHand;
            }
            else {
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
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Middlewares
app.use((0, cors_1.default)({
    origin: '*', // Allow all origins for testing/development
}));
app.use(express_1.default.json());
// --- REST APIs ---
// Create Room API
app.post('/api/rooms', (req, res) => {
    try {
        const room = roomManager_1.roomManager.createRoom();
        console.log(`[REST] Created room: ${room.code}`);
        res.status(201).json({ code: room.code });
    }
    catch (error) {
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
    const room = roomManager_1.roomManager.getRoom(code);
    if (!room) {
        const availableRooms = roomManager_1.roomManager.getAvailableRooms().join(', ');
        const roomCount = roomManager_1.roomManager.getRoomCount();
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
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    // Track room code on the socket object for easier disconnect handling
    let currentRoomCode = null;
    let currentName = null;
    // Create room event (alternative pathway)
    socket.on('create-room', ({ name }) => {
        try {
            const room = roomManager_1.roomManager.createRoom();
            const { player, isSpectator } = roomManager_1.roomManager.joinRoom(room.code, name, socket.id);
            currentRoomCode = room.code;
            currentName = name;
            socket.join(room.code);
            console.log(`[Socket] Host ${name} (${socket.id}) created and joined room ${room.code}`);
            socket.emit('lobby-updated', room);
            socket.emit('joined-successfully', { room, player, isSpectator });
        }
        catch (error) {
            socket.emit('error', { message: error.message || 'Failed to create room via socket' });
        }
    });
    // Join room socket handler
    socket.on('join-room', ({ code, name }) => {
        if (currentRoomCode) {
            console.log(`[Socket] Duplicate join-room blocked for socket ${socket.id}. Already in room ${currentRoomCode}`);
            return;
        }
        try {
            const upperCode = code.toUpperCase();
            const { room, player, isSpectator } = roomManager_1.roomManager.joinRoom(upperCode, name, socket.id);
            currentRoomCode = upperCode;
            currentName = name;
            socket.join(upperCode);
            if (isSpectator) {
                console.log(`[Socket] Spectator ${name} (${socket.id}) joined room ${upperCode}`);
            }
            else {
                console.log(`[Socket] Player ${name} (${socket.id}) joined room ${upperCode} at Seat ${player?.seatNumber}`);
            }
            // Notify the specific socket they joined successfully
            socket.emit('joined-successfully', { room, player, isSpectator });
            if (isSpectator) {
                // Notify others that a spectator joined
                socket.to(upperCode).emit('spectator-joined', { name, id: socket.id });
            }
            else {
                // Notify others that a player joined
                socket.to(upperCode).emit('player-joined', player);
            }
            // Broadcast the updated lobby state to all players in the room
            io.to(upperCode).emit('lobby-updated', room);
            // If game is active, broadcast latest state immediately so they recover hands
            if (room.status === 'playing') {
                broadcastGameState(upperCode);
            }
        }
        catch (error) {
            console.error(`[Socket] Join error for client ${socket.id}:`, error.message);
            socket.emit('error', { message: error.message || 'Failed to join room' });
        }
    });
    // Send reaction socket handler
    socket.on('send-reaction', ({ emoji }) => {
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        if (!room)
            return;
        const player = room.players.find(p => p.id === socket.id);
        const spectator = room.spectators?.find(s => s.id === socket.id);
        const name = player ? player.name : (spectator ? spectator.name : 'Unknown');
        const seatNumber = player ? player.seatNumber : null;
        const isSpectator = !player;
        console.log(`[REACTION] ${name} sent emoji ${emoji} in room ${currentRoomCode}`);
        io.to(currentRoomCode).emit('player-reacted', { name, seatNumber, emoji, isSpectator });
    });
    // Trigger game start (host only)
    socket.on('start-game', () => {
        if (!currentRoomCode)
            return;
        try {
            const room = roomManager_1.roomManager.startGame(currentRoomCode, socket.id);
            console.log(`[Socket] Room ${currentRoomCode} game started by host ${socket.id}`);
            io.to(currentRoomCode).emit('lobby-updated', room);
            io.to(currentRoomCode).emit('game-started', room);
            // Broadcast initial game state to all players
            broadcastGameState(currentRoomCode);
        }
        catch (error) {
            console.error(`[Socket] Start game error for room ${currentRoomCode}:`, error.message);
            socket.emit('error', { message: error.message || 'Failed to start game' });
        }
    });
    // Play card event
    socket.on('play-card', ({ cardId }) => {
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        if (!room || !room.game)
            return;
        try {
            const player = room.players.find(p => p.id === socket.id);
            const playerName = player ? player.name : 'Unknown';
            console.log(`[CARD_PLAYED] Player: ${playerName}, Card: ${cardId}`);
            const oldPlayerId = room.game.currentPlayerId;
            const updatedGame = (0, actions_1.playCardAction)(room.game, room.players, socket.id, cardId);
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
        }
        catch (error) {
            console.error(`[Socket] Play card error:`, error.message);
            socket.emit('error', { message: error.message || 'Failed to play card' });
        }
    });
    // Draw card event
    socket.on('draw-card', () => {
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        if (!room || !room.game)
            return;
        try {
            const player = room.players.find(p => p.id === socket.id);
            const playerName = player ? player.name : 'Unknown';
            console.log(`[CARD_DRAWN] Player: ${playerName}`);
            const oldPlayerId = room.game.currentPlayerId;
            const updatedGame = (0, actions_1.drawCardAction)(room.game, room.players, socket.id);
            room.game = updatedGame;
            if (updatedGame.currentPlayerId !== oldPlayerId) {
                const nextPlayer = room.players.find(p => p.id === updatedGame.currentPlayerId);
                const nextPlayerName = nextPlayer ? nextPlayer.name : 'Unknown';
                console.log(`[TURN_ADVANCED] Next Player: ${nextPlayerName}`);
            }
            broadcastGameState(currentRoomCode);
        }
        catch (error) {
            console.error(`[Socket] Draw card error:`, error.message);
            socket.emit('error', { message: error.message || 'Failed to draw card' });
        }
    });
    // Choose color event
    socket.on('choose-color', ({ color }) => {
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        if (!room || !room.game)
            return;
        try {
            const oldPlayerId = room.game.currentPlayerId;
            const updatedGame = (0, actions_1.chooseColorAction)(room.game, room.players, socket.id, color);
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
        }
        catch (error) {
            console.error(`[Socket] Choose color error:`, error.message);
            socket.emit('error', { message: error.message || 'Failed to select color' });
        }
    });
    // Call UNO event
    socket.on('call-uno', () => {
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        if (!room || !room.game)
            return;
        try {
            const updatedGame = (0, actions_1.callUnoAction)(room.game, socket.id);
            room.game = updatedGame;
            console.log(`[Socket] Player ${currentName} (${socket.id}) called UNO in room ${currentRoomCode}`);
            broadcastGameState(currentRoomCode);
        }
        catch (error) {
            console.error(`[Socket] Call UNO error:`, error.message);
            socket.emit('error', { message: error.message || 'Failed to call UNO' });
        }
    });
    // Catch UNO event
    socket.on('catch-uno', ({ targetPlayerId }) => {
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        if (!room || !room.game)
            return;
        try {
            const updatedGame = (0, actions_1.catchUnoAction)(room.game, targetPlayerId);
            room.game = updatedGame;
            console.log(`[Socket] Player ${currentName} caught ${targetPlayerId} not calling UNO in room ${currentRoomCode}`);
            broadcastGameState(currentRoomCode);
        }
        catch (error) {
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
        if (!currentRoomCode)
            return;
        const room = roomManager_1.roomManager.getRoom(currentRoomCode);
        const player = room ? room.players.find(p => p.id === socket.id) : null;
        const spectator = room ? room.spectators?.find(s => s.id === socket.id) : null;
        const name = player ? player.name : (spectator ? spectator.name : 'Unknown');
        console.log(`[PLAYER_DISCONNECTED] Name: ${name} (${socket.id}), Room: ${currentRoomCode}`);
        const tempRoomCode = currentRoomCode;
        const graceInfo = roomManager_1.roomManager.startDisconnectGracePeriod(socket.id, tempRoomCode, (result) => {
            const { room: updatedRoom, leftPlayer, leftSpectator } = result;
            if (leftPlayer) {
                console.log(`[Socket] Disconnect grace period expired. Player ${leftPlayer.name} left room ${tempRoomCode}`);
                io.to(tempRoomCode).emit('player-left', leftPlayer);
            }
            else if (leftSpectator) {
                console.log(`[Socket] Disconnect grace period expired. Spectator ${leftSpectator.name} left room ${tempRoomCode}`);
                io.to(tempRoomCode).emit('spectator-left', leftSpectator);
            }
            if (updatedRoom) {
                io.to(tempRoomCode).emit('lobby-updated', updatedRoom);
                if (updatedRoom.status === 'playing') {
                    broadcastGameState(tempRoomCode);
                }
            }
        });
        if (graceInfo) {
            console.log(`[Socket] Seat/Spectator slot retained during disconnect grace period for ${name} (${socket.id})`);
        }
        else {
            handleLeave();
        }
    });
    // Common cleanup logic for explicit leave
    function handleLeave() {
        if (!currentRoomCode)
            return;
        const result = roomManager_1.roomManager.leaveRoom(socket.id);
        if (result) {
            const { room: updatedRoom, leftPlayer, leftSpectator } = result;
            if (leftPlayer) {
                console.log(`[Socket] Player ${leftPlayer.name} left room ${currentRoomCode}`);
                socket.to(currentRoomCode).emit('player-left', leftPlayer);
            }
            else if (leftSpectator) {
                console.log(`[Socket] Spectator ${leftSpectator.name} left room ${currentRoomCode}`);
                socket.to(currentRoomCode).emit('spectator-left', leftSpectator);
            }
            socket.leave(currentRoomCode);
            if (updatedRoom) {
                // Broadcast the updated lobby to remaining players
                io.to(currentRoomCode).emit('lobby-updated', updatedRoom);
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
