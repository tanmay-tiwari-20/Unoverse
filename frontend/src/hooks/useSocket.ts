import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/useGameStore';
import { CardColor, CardItem } from '../lib/cards/cardEngine';
import { HouseRules } from '../lib/houseRules';
import { soundManager } from '../utils/soundManager';
import { getSeatCoords } from '../utils/seating';
import { logger } from '../utils/logger';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

// --- Session secret persistence -------------------------------------------
// The backend issues a private per-session secret on first join. We persist it
// (per-tab) so a page reload or socket reconnect can prove ownership of the
// same seat instead of being rejected as a name collision.
const secretKey = (code: string, name: string) =>
  `unoverse:secret:${code.toUpperCase()}:${name.trim().toLowerCase()}`;

const saveSecret = (code: string, name: string, secret?: string) => {
  if (typeof window === 'undefined' || !secret) return;
  try {
    sessionStorage.setItem(secretKey(code, name), secret);
  } catch {
    // sessionStorage may be unavailable (private mode); reconnection still works
    // within the same tab via the in-memory store.
  }
};

const loadSecret = (code: string, name: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return sessionStorage.getItem(secretKey(code, name)) || undefined;
  } catch {
    return undefined;
  }
};

// Global singleton socket instance to prevent duplicate socket connections
let sharedSocket: Socket | null = null;

export const useSocket = () => {
  const { 
    socket, 
    setSocket, 
    setRoom, 
    setPlayer, 
    setError, 
    setConnectionStatus,
    setGameState,
    setIsProcessing,
    setIsSpectator,
    addReaction,
    addToast
  } = useGameStore();

  useEffect(() => {
    // 1. Ensure socket creation happens only once (singleton pattern)
    if (!sharedSocket) {
      logger.debug('SOCKET_CREATED');
      sharedSocket = io(BACKEND_URL, {
        autoConnect: false,
        transports: ['websocket'],
      });
    }

    const socketInstance = sharedSocket;

    // Transition animator to compare incoming payload and trigger visual card flights
    const handleGameUpdateAnimation = (payload: any) => {
      const state = useGameStore.getState();
      
      // Play turn start chime if turn has shifted to a new player
      if (payload.currentPlayerId && payload.currentPlayerId !== state.currentPlayerId) {
        if (payload.currentPlayerId === state.player?.id) {
          // Play a louder turn start chime when it's your turn
          soundManager.play('turn_start', 2.5);
        } else {
          soundManager.play('turn_start', 1.0);
        }
      }

      const localSeat = state.player?.seatNumber || 1;
      const playersList = state.room?.players || [];
      const numPlayers = playersList.length || 2;
      // If initial state load, merge immediately to prevent massive simultaneous fly-in overlaps
      // and to avoid deadlocks when joining mid-game
      const isInitialLoad = state.gameStatus !== 'playing' || state.discardPile.length === 0;

      if (isInitialLoad) {
        setGameState(payload);
        return;
      }

      const localIndex = state.room ? playersList.findIndex(p => p.id === state.player?.id) : -1;

      // Play sound effects based on what changed
      const oldDiscard: CardItem[] = state.discardPile;
      const newDiscard: CardItem[] = payload.discardPile;
      
      if (newDiscard.length > oldDiscard.length) {
        soundManager.play('card_play');
      }

      let drawSoundPlayed = false;
      for (const player of playersList) {
        const seat = player.seatNumber;
        const oldHand: CardItem[] = state.playerCards[seat] || [];
        const newHand: CardItem[] = payload.hands[seat] || [];
        
        if (newHand.length > oldHand.length && !drawSoundPlayed) {
          // Play sound if local player or others draw
          soundManager.play('card_draw');
          drawSoundPlayed = true;
        }

        // Check if UNO was just called
        if (payload.unoCalled && payload.unoCalled[player.id] && (!state.unoCalled || !state.unoCalled[player.id])) {
          soundManager.play('uno');
        }
      }

      // Synchronously and authoritatively replace the local state immediately
      setGameState(payload);
    };

    // 2. Attach listeners safely (cleaning up existing ones first to prevent duplicates)
    socketInstance.off('connect');
    socketInstance.on('connect', () => {
      logger.debug('SOCKET_CONNECTED', socketInstance.id);
      setConnectionStatus('connected');
      setError(null);

      const state = useGameStore.getState();
      // Rejoin as either a player or a spectator — both identities carry a
      // name+secret pair the backend uses to rebind the new socket id.
      const identity = state.player ?? state.spectator;
      if (state.room && identity) {
        addToast('Reconnected to game server! Resyncing...', 'info');
        // CRITICAL: Rejoin the room so the backend updates our socket.id in room.players!
        // Send our stored secret so the backend recognises us as the same participant
        // and lets us reclaim our seat/slot instead of rejecting the name.
        const secret = identity.secret || loadSecret(state.room.code, identity.name);
        socketInstance.emit('join-room', { code: state.room.code, name: identity.name, secret });
      }
    });

    socketInstance.off('connect_error');
    socketInstance.on('connect_error', (err) => {
      logger.error('[Socket] Connection error:', err);
      setConnectionStatus('error');

      const state = useGameStore.getState();
      if (state.room) {
        addToast('Connection lost. Reconnecting...', 'error');
      } else {
        setError('Unable to connect to game server. Please ensure the backend is running.');
      }
      setIsProcessing(false);
    });

    socketInstance.off('disconnect');
    socketInstance.on('disconnect', (reason) => {
      logger.debug('[Socket] Disconnected:', reason);
      setConnectionStatus('disconnected');
    });

    socketInstance.off('joined-successfully');
    socketInstance.on('joined-successfully', ({ room, player, isSpectator, spectator }) => {
      logger.debug('[Socket] Joined room successfully:', room?.code, player, 'isSpectator:', isSpectator);
      // Persist our private secret so a reload/reconnect can reclaim this seat —
      // or, for spectators, this spectator slot (their identity is also
      // name+secret; without it a reload would be rejected as a name collision).
      if (room && player?.secret) {
        saveSecret(room.code, player.name, player.secret);
      } else if (room && spectator?.secret) {
        saveSecret(room.code, spectator.name, spectator.secret);
      }
      setRoom(room);
      if (room?.houseRules) useGameStore.getState().setHouseRules(room.houseRules);
      setPlayer(player);
      useGameStore.getState().setSpectator(isSpectator ? (spectator ?? null) : null);
      setIsSpectator(!!isSpectator);
      setError(null);
      setIsProcessing(false);
      addToast(
        isSpectator
          ? 'All player slots are filled — you joined as a spectator.'
          : `Joined as ${player?.name}`,
        'success'
      );
    });

    socketInstance.off('lobby-updated');
    socketInstance.on('lobby-updated', (updatedRoom) => {
      logger.debug('[Socket] Lobby updated:', updatedRoom);
      setRoom(updatedRoom);
      if (updatedRoom?.houseRules) useGameStore.getState().setHouseRules(updatedRoom.houseRules);
      setIsProcessing(false);
    });

    // House rules changed by the host — mirror them locally in real time.
    socketInstance.off('house-rules-updated');
    socketInstance.on('house-rules-updated', ({ houseRules }) => {
      logger.debug('[Socket] House rules updated');
      if (houseRules) useGameStore.getState().setHouseRules(houseRules);
    });

    // A Wild Draw Four was challenged — surface the outcome.
    socketInstance.off('wild-four-challenge');
    socketInstance.on('wild-four-challenge', ({ challengerName, accusedName, success }) => {
      soundManager.play('card_draw');
      addToast(
        success
          ? `${challengerName} caught ${accusedName}'s +4 bluff!`
          : `${challengerName} challenged ${accusedName}'s +4 and was wrong!`,
        success ? 'success' : 'info'
      );
    });

    socketInstance.off('game-started');
    socketInstance.on('game-started', (room) => {
      logger.debug('[Socket] Game started:', room.code);
      soundManager.play('shuffle');
      addToast('Game has started! Good luck!', 'success');
      setIsProcessing(false);
    });

    socketInstance.off('game-updated');
    socketInstance.on('game-updated', (payload) => {
      logger.debug('[Socket] Game updated:', payload);
      logger.debug(`[DEBUG TASK] Discard Pile: ${payload.discardPile.length}, Top Card: ${payload.discardPile[payload.discardPile.length - 1]?.id || 'None'}, Draw Pile: ${payload.drawPileCount}`);
      handleGameUpdateAnimation(payload);
      setIsProcessing(false);
    });

    socketInstance.off('game-ended');
    socketInstance.on('game-ended', ({ winnerId, winnerName }) => {
      logger.debug('[Socket] Game ended. Winner:', winnerName);
      soundManager.play('victory');
      setIsProcessing(false);
    });

    socketInstance.off('uno-penalty');
    socketInstance.on('uno-penalty', ({ playerId, playerName }) => {
      logger.debug('[Socket] UNO penalty applied to', playerName);
      soundManager.play('card_draw');
      const me = useGameStore.getState().player;
      const youGotCaught = me?.id === playerId;
      addToast(
        youGotCaught
          ? "You forgot to call UNO! +4 penalty cards"
          : `${playerName} forgot to call UNO! +4 penalty cards`,
        youGotCaught ? 'error' : 'info'
      );
    });

    socketInstance.off('game-stopped');
    socketInstance.on('game-stopped', ({ room }) => {
      logger.debug('[Socket] Game stopped — not enough players. Resetting to lobby.');
      // Reset all card/game state back to the lobby. A fresh game must be started.
      useGameStore.getState().clearAllCards();
      if (room) {
        setRoom(room);
      }
      useGameStore.getState().setGameStoppedNotice(true);
      setIsProcessing(false);
      // No toast here — the on-table "Game Stopped" banner conveys this instead.
    });

    socketInstance.off('error');
    socketInstance.on('error', (err: { message: string }) => {
      logger.error('[Socket] Error from server:', err.message);
      const state = useGameStore.getState();
      // Redirect room gameplay error messages as toasts instead of crashing screen
      if (state.room) {
        addToast(err.message, 'error');
      } else {
        setError(err.message);
      }
      setIsProcessing(false);
    });

    socketInstance.off('player-reacted');
    socketInstance.on('player-reacted', ({ name, seatNumber, emoji, isSpectator }) => {
      logger.debug('[Socket] Player reacted:', name, emoji);
      soundManager.play('reaction');
      addReaction({
        id: `reaction-${Math.random().toString(36).substring(2, 9)}`,
        name,
        seatNumber,
        emoji,
        isSpectator: !!isSpectator
      });
    });

    // Real-time text chat — mirrors the reaction listener. The server broadcasts to
    // everyone (including the sender) so all clients render from one payload.
    socketInstance.off('chat-message');
    socketInstance.on('chat-message', (message) => {
      logger.debug('[Socket] Chat message:', message?.name);
      const store = useGameStore.getState();
      // Soft chime only for other people's messages while the panel is closed.
      if (message?.senderId !== store.player?.id && !store.isChatOpen) {
        soundManager.play('reaction', 0.5);
      }
      store.addChatMessage(message);
    });

    socketInstance.off('player-joined');
    socketInstance.on('player-joined', (newPlayer) => {
      logger.debug('[Socket] Player joined:', newPlayer?.name);
      soundManager.play('player_join');
      if (newPlayer && newPlayer.name) {
        addToast(`${newPlayer.name} joined the table!`, 'success');
      }
    });

    socketInstance.off('player-left');
    socketInstance.on('player-left', (leftPlayer) => {
      logger.debug('[Socket] Player left:', leftPlayer?.name);
      soundManager.play('player_leave');
      if (leftPlayer && leftPlayer.name) {
        addToast(`${leftPlayer.name} left the table.`, 'info');
      }
    });

    socketInstance.off('spectator-joined');
    socketInstance.on('spectator-joined', ({ name, id }) => {
      logger.debug('[Socket] Spectator joined:', name);
      soundManager.play('player_join');
      if (name) {
        addToast(`${name} is now spectating.`, 'info');
      }
    });

    socketInstance.off('spectator-left');
    socketInstance.on('spectator-left', ({ name, id }) => {
      logger.debug('[Socket] Spectator left:', name);
      soundManager.play('player_leave');
      if (name) {
        addToast(`${name} stopped spectating.`, 'info');
      }
    });

    // Connect if not already connected
    if (!socketInstance.connected) {
      setConnectionStatus('connecting');
      socketInstance.connect();
    }

    // 3. Verify setSocket() is only called when socket actually changes
    if (socket !== socketInstance) {
      logger.debug('SOCKET_STORED');
      setSocket(socketInstance);
    }

    // Cleanup: remove listeners to prevent duplicates
    return () => {
      logger.debug('[Socket] Cleaning up listeners for socket:', socketInstance.id);
      socketInstance.off('connect');
      socketInstance.off('connect_error');
      socketInstance.off('disconnect');
      socketInstance.off('joined-successfully');
      socketInstance.off('lobby-updated');
      socketInstance.off('game-started');
      socketInstance.off('game-updated');
      socketInstance.off('game-ended');
      socketInstance.off('uno-penalty');
      socketInstance.off('game-stopped');
      socketInstance.off('house-rules-updated');
      socketInstance.off('wild-four-challenge');
      socketInstance.off('error');
      socketInstance.off('player-reacted');
      socketInstance.off('chat-message');
      socketInstance.off('player-joined');
      socketInstance.off('player-left');
      socketInstance.off('spectator-joined');
      socketInstance.off('spectator-left');
    };
    // stable setter dependencies
  }, [setSocket, setRoom, setPlayer, setError, setConnectionStatus, setGameState, setIsProcessing, setIsSpectator, addReaction, addToast]);

  const createRoom = (name: string) => {
    if (socket) {
      socket.emit('create-room', { name });
    } else {
      logger.warn('[Socket] Socket not initialized yet');
    }
  };

  const joinRoom = (code: string, name: string) => {
    if (socket) {
      // Resend any previously-issued secret so a page reload reclaims our seat
      // rather than being rejected as a duplicate name.
      const secret = loadSecret(code, name);
      socket.emit('join-room', { code, name, secret });
    } else {
      logger.warn('[Socket] Socket not initialized yet');
    }
  };

  const leaveRoom = () => {
    if (socket) {
      socket.emit('leave-room');
      setRoom(null);
      setPlayer(null);
      useGameStore.getState().setSpectator(null);
      setIsSpectator(false);
      setError(null);
    }
  };

  const startGame = () => {
    if (socket) {
      socket.emit('start-game');
    }
  };

  const playCard = (cardId: string) => {
    const state = useGameStore.getState();
    if (state.isProcessing) return;

    if (socket) {
      logger.debug({
        clickedBy: state.player?.name,
        clickedById: state.player?.id,
        currentTurn: state.room?.players?.find(p => p.id === state.currentPlayerId)?.name,
        currentTurnId: state.currentPlayerId,
        cardId,
        socketId: socket.id
      });
      useGameStore.setState({ isProcessing: true });

      socket.emit('play-card', { cardId, playerId: state.player?.id });
    }
  };

  const drawCard = () => {
    const state = useGameStore.getState();
    if (state.isProcessing) return;

    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('draw-card');
    }
  };

  const passTurn = () => {
    const state = useGameStore.getState();
    if (state.isProcessing) return;

    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('pass-turn');
    }
  };

  const chooseColor = (color: CardColor) => {
    if (socket) {
      socket.emit('choose-color', { color });
    }
  };

  const callUno = () => {
    if (socket) {
      socket.emit('call-uno');
    }
  };

  // Host-only: push a house-rules change. The server validates authority + lock.
  const updateHouseRules = (rules: Partial<HouseRules>) => {
    if (socket) {
      socket.emit('update-house-rules', { rules });
    }
  };

  // Play an identical card out of turn (Jump-In house rule).
  const jumpIn = (cardId: string) => {
    const state = useGameStore.getState();
    if (state.isProcessing) return;
    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('jump-in', { cardId });
    }
  };

  // Choose the opponent to swap hands with after a 7 (Seven-O house rule).
  const chooseSwapTarget = (targetId: string) => {
    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('swap-target', { targetId });
    }
  };

  // Challenge a pending Wild Draw Four (house rule).
  const challengeWildFour = () => {
    if (socket) {
      socket.emit('challenge-wild-four');
    }
  };

  // Send a text chat message. Trimmed/bounded client-side; the server re-validates
  // and broadcasts the stamped message back to everyone (including us).
  const sendChat = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !socket) return;
    socket.emit('send-chat', { text: trimmed.slice(0, 500) });
  };

  return {
    socket,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playCard,
    drawCard,
    passTurn,
    chooseColor,
    callUno,
    updateHouseRules,
    jumpIn,
    chooseSwapTarget,
    challengeWildFour,
    sendChat,
  };
};
