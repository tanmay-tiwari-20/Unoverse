import { useEffect } from 'react';
import { io, Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';
import { useGameStore, type GameUpdatePayload } from '../store/useGameStore';
import { useProfileStore } from '../store/useProfileStore';
import { CardColor, CardItem } from '../lib/cards/cardEngine';
import { HouseRules } from '../lib/houseRules';
import { soundManager } from '../utils/soundManager';
import { logger } from '../utils/logger';
// Friends & Social System. Two calls only — the listeners are attached alongside
// the gameplay ones, and `sayHello` re-binds the profile after every (re)connect.
// Both are no-ops when no profile exists, so profile-less play is untouched.
import { attachSocialListeners, sayHello } from '../lib/social/socialClient';
import { BACKEND_URL } from '../lib/config';
import { getPlatform } from '../lib/platform';

// --- Persistent profile identity -------------------------------------------
// The durable player identity (profileId + private secret) lives in
// useProfileStore (localStorage). We attach it to every create/join/reconnect
// emit from a single place so the server can verify ownership and key
// server-authoritative stats to the profile. Returns `{}` when no profile
// exists yet (profile-less play still works exactly as before).
const profileCreds = (): { profileId?: string; profileSecret?: string } => {
  const { profileId, profileSecret } = useProfileStore.getState();
  return profileId && profileSecret ? { profileId, profileSecret } : {};
};

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

// --- Transport strategy -----------------------------------------------------
// Start on HTTP long-polling, then let Engine.IO silently upgrade to WebSocket
// once it proves a WebSocket handshake actually succeeds.
//
// We previously pinned `transports: ['websocket']`. That skips the (small)
// polling handshake on a healthy network, but it is fail-closed: on corporate
// proxies, captive portals, school/hospital firewalls and some in-app browsers
// that strip the `Upgrade` header, the WebSocket handshake never completes and
// the client has no second option — the game is simply unreachable. Polling
// first is fail-open: everyone connects, and the vast majority are upgraded to
// a real WebSocket within a few hundred milliseconds, so steady-state gameplay
// latency and bandwidth are unchanged.
//
// `upgrade: true` (the default, stated explicitly here so it can't be lost) is
// what performs that handshake; `rememberUpgrade` then lets subsequent
// connections in the same tab retry WebSocket immediately instead of paying for
// the polling round trip again.
const SOCKET_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  autoConnect: false,
  transports: ['polling', 'websocket'],
  upgrade: true,
  rememberUpgrade: true,
  // Reconnection is Socket.IO's default-on behavior; spelled out so a future
  // options change can't silently disable it. Backoff is capped so a client that
  // dropped mid-round rejoins promptly rather than after a long exponential wait.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 20000,
};

// Global singleton socket instance to prevent duplicate socket connections
let sharedSocket: Socket | null = null;
let listenersAttached = false;

function setupSocketListeners(socketInstance: Socket) {
  if (listenersAttached) return;
  listenersAttached = true;

  // Transition animator to compare incoming payload and trigger visual card flights
  const handleGameUpdateAnimation = (payload: GameUpdatePayload) => {
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

    const playersList = state.room?.players || [];
    const isInitialLoad = state.gameStatus !== 'playing' || state.discardCount === 0;

    if (isInitialLoad) {
      useGameStore.getState().setGameState(payload);
      return;
    }

    // Play sound effects based on what changed. Compare the authoritative pile
    // SIZE, never `discardPile.length` — the local pile is a bounded window that
    // stops growing once it saturates, which would silently mute this cue.
    if (payload.discardCount > state.discardCount) {
      soundManager.play('card_play');
    }

    let drawSoundPlayed = false;
    for (const player of playersList) {
      const seat = player.seatNumber;
      const oldHand: CardItem[] = state.playerCards[seat] || [];
      const newHandSize: number = payload.handCounts?.[seat] ?? 0;

      if (newHandSize > oldHand.length && !drawSoundPlayed) {
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
    useGameStore.getState().setGameState(payload);
  };

  socketInstance.on('connect', () => {
    logger.debug('SOCKET_CONNECTED', socketInstance.id);
    useGameStore.getState().setConnectionStatus('connected');
    useGameStore.getState().setError(null);

    // Re-bind the social identity on every connect AND reconnect, so presence and
    // the friend graph are correct again after a drop without the player acting.
    sayHello(socketInstance);

    const state = useGameStore.getState();
    const identity = state.player ?? state.spectator;
    if (state.room && identity) {
      useGameStore.getState().addToast('Reconnected to game server! Resyncing...', 'info');
      const secret = identity.secret || loadSecret(state.room.code, identity.name);
      socketInstance.emit('join-room', { code: state.room.code, name: identity.name, secret, ...profileCreds() });
    }
  });

  socketInstance.on('connect_error', (err) => {
    logger.error('[Socket] Connection error:', err);
    useGameStore.getState().setConnectionStatus('error');

    const state = useGameStore.getState();
    if (state.room) {
      useGameStore.getState().addToast('Connection lost. Reconnecting...', 'error');
    } else {
      useGameStore.getState().setError('Unable to connect to game server. Please ensure the backend is running.');
    }
    useGameStore.getState().setIsProcessing(false);
  });

  socketInstance.on('disconnect', (reason) => {
    logger.debug('[Socket] Disconnected:', reason);
    useGameStore.getState().setConnectionStatus('disconnected');
  });

  socketInstance.on('joined-successfully', ({ room, player, isSpectator, spectator }) => {
    logger.debug('[Socket] Joined room successfully:', room?.code, player, 'isSpectator:', isSpectator);
    if (room && player?.secret) {
      saveSecret(room.code, player.name, player.secret);
    } else if (room && spectator?.secret) {
      saveSecret(room.code, spectator.name, spectator.secret);
    }
    useGameStore.getState().setRoom(room);
    if (room?.houseRules) useGameStore.getState().setHouseRules(room.houseRules);
    useGameStore.getState().setPlayer(player);
    useGameStore.getState().setSpectator(isSpectator ? (spectator ?? null) : null);
    useGameStore.getState().setIsSpectator(!!isSpectator);
    useGameStore.getState().setError(null);
    useGameStore.getState().setIsProcessing(false);
    useGameStore.getState().addToast(
      isSpectator
        ? 'All player slots are filled — you joined as a spectator.'
        : `Joined as ${player?.name}`,
      'success'
    );
  });

  socketInstance.on('lobby-updated', (updatedRoom) => {
    logger.debug('[Socket] Lobby updated:', updatedRoom);
    useGameStore.getState().setRoom(updatedRoom);
    if (updatedRoom?.houseRules) useGameStore.getState().setHouseRules(updatedRoom.houseRules);
    useGameStore.getState().setIsProcessing(false);
  });

  socketInstance.on('house-rules-updated', ({ houseRules }) => {
    logger.debug('[Socket] House rules updated');
    if (houseRules) useGameStore.getState().setHouseRules(houseRules);
  });

  socketInstance.on('wild-four-challenge', ({ challengerName, accusedName, success }) => {
    soundManager.play('card_draw');
    useGameStore.getState().addToast(
      success
        ? `${challengerName} caught ${accusedName}'s +4 bluff!`
        : `${challengerName} challenged ${accusedName}'s +4 and was wrong!`,
      success ? 'success' : 'info'
    );
  });

  socketInstance.on('game-started', (room) => {
    logger.debug('[Socket] Game started:', room.code);
    soundManager.play('shuffle');
    useGameStore.getState().addToast('Game has started! Good luck!', 'success');
    useGameStore.getState().setIsProcessing(false);
  });

  socketInstance.on('game-updated', (payload) => {
    logger.debug('[Socket] Game updated:', payload);
    handleGameUpdateAnimation(payload);
    useGameStore.getState().setIsProcessing(false);
  });

  socketInstance.on('game-ended', ({ winnerName }) => {
    logger.debug('[Socket] Game ended. Winner:', winnerName);
    soundManager.play('victory');
    useGameStore.getState().setIsProcessing(false);
    // Lifetime stats were just committed server-side for this match. Re-fetch the
    // profile view (never computed client-side) so the profile modal shows fresh
    // totals + the new match-history entry. Best-effort: a failure is silent.
    useProfileStore.getState().refreshProfile().catch(() => {});
  });

  socketInstance.on('uno-penalty', ({ playerId, playerName }) => {
    logger.debug('[Socket] UNO penalty applied to', playerName);
    soundManager.play('card_draw');
    const me = useGameStore.getState().player;
    const youGotCaught = me?.id === playerId;
    useGameStore.getState().addToast(
      youGotCaught
        ? "You forgot to call UNO! +4 penalty cards"
        : `${playerName} forgot to call UNO! +4 penalty cards`,
      youGotCaught ? 'error' : 'info'
    );
  });

  socketInstance.on('game-stopped', ({ room }) => {
    logger.debug('[Socket] Game stopped — not enough players. Resetting to lobby.');
    useGameStore.getState().clearAllCards();
    if (room) {
      useGameStore.getState().setRoom(room);
    }
    useGameStore.getState().setGameStoppedNotice(true);
    useGameStore.getState().setIsProcessing(false);
  });

  socketInstance.on('error', (err: { message: string }) => {
    logger.error('[Socket] Error from server:', err.message);
    const state = useGameStore.getState();
    if (state.room) {
      useGameStore.getState().addToast(err.message, 'error');
    } else {
      useGameStore.getState().setError(err.message);
    }
    useGameStore.getState().setIsProcessing(false);
  });

  socketInstance.on('player-reacted', ({ name, seatNumber, emoji, isSpectator }) => {
    logger.debug('[Socket] Player reacted:', name, emoji);
    soundManager.play('reaction');
    useGameStore.getState().addReaction({
      id: `reaction-${Math.random().toString(36).substring(2, 9)}`,
      name,
      seatNumber,
      emoji,
      isSpectator: !!isSpectator
    });
  });

  socketInstance.on('chat-message', (message) => {
    logger.debug('[Socket] Chat message:', message?.name);
    // A platform-level `disableChat` means the player must not SEE chat, not
    // merely be unable to send it — so incoming messages are dropped here
    // rather than only hiding the panel. Server-side house rules already gate
    // sending; this is the receive half, and it is client-side because the
    // preference is the player's own and unknown to the server.
    if (getPlatform().getSettings().disableChat) return;
    const store = useGameStore.getState();
    if (message?.senderId !== store.player?.id && !store.isChatOpen) {
      soundManager.play('reaction', 0.5);
    }
    store.addChatMessage(message);
  });

  socketInstance.on('player-joined', (newPlayer) => {
    logger.debug('[Socket] Player joined:', newPlayer?.name);
    soundManager.play('player_join');
    if (newPlayer && newPlayer.name) {
      useGameStore.getState().addToast(`${newPlayer.name} joined the table!`, 'success');
    }
  });

  socketInstance.on('player-left', (leftPlayer) => {
    logger.debug('[Socket] Player left:', leftPlayer?.name);
    soundManager.play('player_leave');
    if (leftPlayer && leftPlayer.name) {
      useGameStore.getState().addToast(`${leftPlayer.name} left the table.`, 'info');
    }
  });

  socketInstance.on('spectator-joined', ({ name }) => {
    logger.debug('[Socket] Spectator joined:', name);
    soundManager.play('player_join');
    if (name) {
      useGameStore.getState().addToast(`${name} is now spectating.`, 'info');
    }
  });

  socketInstance.on('spectator-left', ({ name }) => {
    logger.debug('[Socket] Spectator left:', name);
    soundManager.play('player_leave');
    if (name) {
      useGameStore.getState().addToast(`${name} stopped spectating.`, 'info');
    }
  });

  // Friends & Social System listeners, registered exactly once alongside the
  // gameplay ones. Every `social:*` event is handled inside `socialClient` and
  // lands in `useSocialStore` — none of them touch game state.
  attachSocialListeners(socketInstance);
}

export const useSocket = () => {
  const socket = useGameStore((state) => state.socket);
  const setSocket = useGameStore((state) => state.setSocket);
  const setConnectionStatus = useGameStore((state) => state.setConnectionStatus);

  useEffect(() => {
    if (!sharedSocket) {
      logger.debug('SOCKET_CREATED');
      sharedSocket = io(BACKEND_URL, SOCKET_OPTIONS);
      setupSocketListeners(sharedSocket);
    }

    const socketInstance = sharedSocket;

    if (!socketInstance.connected) {
      setConnectionStatus('connecting');
      socketInstance.connect();
    }

    if (socket !== socketInstance) {
      setSocket(socketInstance);
    }
  }, [socket, setSocket, setConnectionStatus]);

  const createRoom = (name: string) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('create-room', { name, ...profileCreds() });
    } else {
      logger.warn('[Socket] Socket not initialized yet');
    }
  };

  const joinRoom = (code: string, name: string) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      const secret = loadSecret(code, name);
      currentSocket.emit('join-room', { code, name, secret, ...profileCreds() });
    } else {
      logger.warn('[Socket] Socket not initialized yet');
    }
  };

  const leaveRoom = () => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('leave-room');
      useGameStore.getState().setRoom(null);
      useGameStore.getState().setPlayer(null);
      useGameStore.getState().setSpectator(null);
      useGameStore.getState().setIsSpectator(false);
      useGameStore.getState().setError(null);
    }
  };

  const startGame = (options?: { fillWithBots?: boolean }) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('start-game', options ?? {});
    }
  };

  const addBots = (count: number) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('add-bots', { count });
    }
  };

  const removeBot = (botId: string) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('remove-bot', { botId });
    }
  };

  const playCard = (cardId: string) => {
    const state = useGameStore.getState();
    const currentSocket = state.socket;
    if (state.isProcessing) return;

    if (currentSocket) {
      logger.debug({
        clickedBy: state.player?.name,
        clickedById: state.player?.id,
        currentTurn: state.room?.players?.find(p => p.id === state.currentPlayerId)?.name,
        currentTurnId: state.currentPlayerId,
        cardId,
        socketId: currentSocket.id
      });
      useGameStore.setState({ isProcessing: true });
      currentSocket.emit('play-card', { cardId, playerId: state.player?.id });
    }
  };

  const drawCard = () => {
    const state = useGameStore.getState();
    const currentSocket = state.socket;
    if (state.isProcessing) return;

    if (currentSocket) {
      useGameStore.setState({ isProcessing: true });
      currentSocket.emit('draw-card');
    }
  };

  const passTurn = () => {
    const state = useGameStore.getState();
    const currentSocket = state.socket;
    if (state.isProcessing) return;

    if (currentSocket) {
      useGameStore.setState({ isProcessing: true });
      currentSocket.emit('pass-turn');
    }
  };

  const chooseColor = (color: CardColor) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('choose-color', { color });
    }
  };

  const callUno = () => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('call-uno');
    }
  };

  const updateHouseRules = (rules: Partial<HouseRules>) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('update-house-rules', { rules });
    }
  };

  // Host-only, lobby-only. `arena` may be a concrete id or 'random' (the server
  // resolves 'random' to a concrete id and broadcasts the whole room back).
  const updateArena = (arena: string) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('update-arena', { arena });
    }
  };

  const jumpIn = (cardId: string) => {
    const state = useGameStore.getState();
    const currentSocket = state.socket;
    if (state.isProcessing) return;
    if (currentSocket) {
      useGameStore.setState({ isProcessing: true });
      currentSocket.emit('jump-in', { cardId });
    }
  };

  const chooseSwapTarget = (targetId: string) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      useGameStore.setState({ isProcessing: true });
      currentSocket.emit('swap-target', { targetId });
    }
  };

  const challengeWildFour = () => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('challenge-wild-four');
    }
  };

  const sendChat = (text: string) => {
    const currentSocket = useGameStore.getState().socket;
    const trimmed = text.trim();
    if (!trimmed || !currentSocket) return;
    currentSocket.emit('send-chat', { text: trimmed.slice(0, 500) });
  };

  const sendReaction = (emoji: string) => {
    const currentSocket = useGameStore.getState().socket;
    if (currentSocket) {
      currentSocket.emit('send-reaction', { emoji });
    }
  };

  return {
    socket,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    addBots,
    removeBot,
    playCard,
    drawCard,
    passTurn,
    chooseColor,
    callUno,
    updateHouseRules,
    updateArena,
    jumpIn,
    chooseSwapTarget,
    challengeWildFour,
    sendChat,
    sendReaction,
  };
};
