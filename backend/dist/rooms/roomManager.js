"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomManager = void 0;
const actions_1 = require("../game/actions");
class RoomManager {
    rooms = new Map();
    // Map key: `${roomCode}:${playerName}` -> NodeJS.Timeout
    disconnectTimers = new Map();
    // Helper to generate a unique 6-digit room code
    generateRoomCode() {
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
    createRoom() {
        const code = this.generateRoomCode();
        const newRoom = {
            code,
            hostId: '',
            players: [],
            status: 'lobby',
        };
        this.rooms.set(code, newRoom);
        console.log(`[ROOM_CREATED] Code: ${code}`);
        return newRoom;
    }
    // Get a room by its code
    getRoom(code) {
        return this.rooms.get(code.toUpperCase());
    }
    // Expose active room lists for diagnostic logs
    getAvailableRooms() {
        return Array.from(this.rooms.keys());
    }
    getRoomCount() {
        return this.rooms.size;
    }
    // Check if a player name is unique in a room
    isNameUnique(room, name) {
        return !room.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
    }
    // Start disconnect grace period for player or spectator (60 seconds)
    startDisconnectGracePeriod(socketId, roomCode, onExpired) {
        const upperCode = roomCode.toUpperCase();
        const room = this.rooms.get(upperCode);
        if (!room)
            return null;
        const player = room.players.find((p) => p.id === socketId);
        const spectator = room.spectators?.find((s) => s.id === socketId);
        if (!player && !spectator)
            return null;
        const name = player ? player.name : spectator.name;
        const isPlayer = !!player;
        const key = `${upperCode}:${name.toLowerCase()}`;
        // Cancel existing timer if any (defensive check)
        if (this.disconnectTimers.has(key)) {
            clearTimeout(this.disconnectTimers.get(key));
        }
        console.log(`[GRACE_PERIOD_START] Starting 60s disconnect grace period for ${isPlayer ? 'Player' : 'Spectator'} ${name} in Room ${upperCode}`);
        const timer = setTimeout(() => {
            this.disconnectTimers.delete(key);
            console.log(`[GRACE_PERIOD_EXPIRED] Disconnect grace period expired for ${name} in Room ${upperCode}`);
            // Actually remove the player/spectator now
            const result = this.leaveRoom(socketId);
            if (result) {
                onExpired(result);
            }
            else {
                onExpired({ room: null, leftPlayer: null, leftSpectator: null });
            }
        }, 60000);
        this.disconnectTimers.set(key, timer);
        return { playerName: name, isPlayer };
    }
    // Join an existing room via Socket connection
    joinRoom(code, playerName, playerSocketId) {
        const upperCode = code.toUpperCase();
        const room = this.rooms.get(upperCode);
        if (!room) {
            const availableRooms = Array.from(this.rooms.keys()).join(', ');
            const roomCount = this.rooms.size;
            console.log(`[ROOM_NOT_FOUND] requested: ${upperCode}, available: ${availableRooms || 'None'}, roomCount: ${roomCount}`);
            throw new Error('Room not found');
        }
        console.log(`[ROOM_JOIN_REQUEST] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${upperCode}, Status: ${room.status}`);
        console.log(`[ROOM_PLAYER_COUNT] Room: ${upperCode}, Count: ${room.players.length}`);
        console.log(`[ROOM_CAPACITY] Room: ${upperCode}, Capacity: 6`);
        // Cancel any active disconnect timer for this player/spectator
        const timerKey = `${upperCode}:${playerName.toLowerCase()}`;
        if (this.disconnectTimers.has(timerKey)) {
            clearTimeout(this.disconnectTimers.get(timerKey));
            this.disconnectTimers.delete(timerKey);
            console.log(`[GRACE_PERIOD_CANCEL] Reconnection detected. Cancelled disconnect grace period for ${playerName} in Room ${upperCode}`);
        }
        // Check if a player with this name already exists in the room (Reconnection Case)
        const existingPlayerByName = room.players.find((p) => p.name.toLowerCase() === playerName.toLowerCase());
        if (existingPlayerByName) {
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
                    if (game.unoCalled[oldSocketId] !== undefined) {
                        game.unoCalled[playerSocketId] = game.unoCalled[oldSocketId];
                        delete game.unoCalled[oldSocketId];
                    }
                }
            }
            console.log(`[PLAYER_RECONNECTED] Rebound name "${playerName}" from socket ${oldSocketId} to ${playerSocketId}`);
            console.log(`[PLAYER_ASSIGNED_SEAT] Name: ${playerName} (Reconnected), Socket: ${playerSocketId}, Room: ${room.code}, Seat: ${existingPlayerByName.seatNumber}`);
            console.log(`[ROOM_JOIN] Player: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
            return { room, player: existingPlayerByName, isSpectator: false };
        }
        // Check if spectator with same name exists (Spectator Reconnection Case)
        if (room.spectators) {
            const existingSpectatorByName = room.spectators.find((s) => s.name.toLowerCase() === playerName.toLowerCase());
            if (existingSpectatorByName) {
                const oldSocketId = existingSpectatorByName.id;
                existingSpectatorByName.id = playerSocketId;
                console.log(`[SPECTATOR_RECONNECTED] Rebound spectator "${playerName}" from socket ${oldSocketId} to ${playerSocketId}`);
                console.log(`[ROOM_JOIN] Spectator: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
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
                spectator = { id: playerSocketId, name: playerName };
                room.spectators.push(spectator);
            }
            console.log(`[PLAYER_ASSIGNED_SPECTATOR] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
            console.log(`[ROOM_JOIN] Spectator: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
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
        const newPlayer = {
            id: playerSocketId,
            name: playerName,
            seatNumber,
            isHost,
        };
        room.players.push(newPlayer);
        // Sort players by seat number so client lists remain aligned
        room.players.sort((a, b) => a.seatNumber - b.seatNumber);
        console.log(`[PLAYER_ASSIGNED_SEAT] Name: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}, Seat: ${seatNumber}`);
        console.log(`[ROOM_JOIN] Player: ${playerName}, Socket: ${playerSocketId}, Room: ${room.code}`);
        return { room, player: newPlayer, isSpectator: false };
    }
    // Remove player/spectator from whatever room they are in
    leaveRoom(playerSocketId) {
        for (const [code, room] of this.rooms.entries()) {
            // Check players list
            const playerIndex = room.players.findIndex((p) => p.id === playerSocketId);
            if (playerIndex !== -1) {
                const [leftPlayer] = room.players.splice(playerIndex, 1);
                // Cancel any active disconnect grace period timer for safety
                const timerKey = `${code.toUpperCase()}:${leftPlayer.name.toLowerCase()}`;
                if (this.disconnectTimers.has(timerKey)) {
                    clearTimeout(this.disconnectTimers.get(timerKey));
                    this.disconnectTimers.delete(timerKey);
                }
                console.log(`[ROOM_LEAVE] Player: ${leftPlayer.name}, Socket: ${playerSocketId}, Room: ${code}`);
                // If the player was the host and there are other players, elect a new host
                if (leftPlayer.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                    room.hostId = room.players[0].id;
                }
                // If room is empty, delete it
                if (room.players.length === 0 && (!room.spectators || room.spectators.length === 0)) {
                    console.log(`[ROOM_DELETED] Code: ${code}`);
                    this.rooms.delete(code);
                    return { room: null, leftPlayer, leftSpectator: null };
                }
                // Keep players sorted by seat number
                room.players.sort((a, b) => a.seatNumber - b.seatNumber);
                return { room, leftPlayer, leftSpectator: null };
            }
            // Check spectators list
            if (room.spectators) {
                const specIndex = room.spectators.findIndex((s) => s.id === playerSocketId);
                if (specIndex !== -1) {
                    const [leftSpectator] = room.spectators.splice(specIndex, 1);
                    // Cancel any active disconnect grace period timer for safety
                    const timerKey = `${code.toUpperCase()}:${leftSpectator.name.toLowerCase()}`;
                    if (this.disconnectTimers.has(timerKey)) {
                        clearTimeout(this.disconnectTimers.get(timerKey));
                        this.disconnectTimers.delete(timerKey);
                    }
                    console.log(`[ROOM_LEAVE] Spectator: ${leftSpectator.name}, Socket: ${playerSocketId}, Room: ${code}`);
                    if (room.players.length === 0 && room.spectators.length === 0) {
                        console.log(`[ROOM_DELETED] Code: ${code}`);
                        this.rooms.delete(code);
                        return { room: null, leftPlayer: null, leftSpectator };
                    }
                    return { room, leftPlayer: null, leftSpectator };
                }
            }
        }
        return null;
    }
    // Set room game status to playing
    startGame(code, hostSocketId) {
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
        room.game = (0, actions_1.startGameState)(room.players);
        return room;
    }
}
exports.roomManager = new RoomManager();
