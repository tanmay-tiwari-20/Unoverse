import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { Room, Player, Spectator } from '../types/game';
import { CardItem, CardColor } from '../lib/cards/cardEngine';
import { HouseRules, DEFAULT_HOUSE_RULES, normalizeHouseRules } from '../lib/houseRules';
import { soundManager } from '../utils/soundManager';
import { logger } from '../utils/logger';

// Match = a running series of rounds played to a target score. Mirrors the
// backend MatchState (scores keyed by lowercased player name).
export interface MatchState {
  scores: Record<string, number>;
  targetScore: number;
  round: number;
  lastRound: { round: number; winnerName: string; pointsAwarded: number } | null;
  matchWinnerName: string | null;
}

// A single real-time chat message, server-stamped (mirrors the reaction payload).
export interface ChatMessage {
  id: string;
  senderId: string;
  name: string;
  seatNumber: number | null;
  isSpectator: boolean;
  isHost: boolean;
  text: string;
  timestamp: number;
}

// Cap the in-memory chat history so a long session can't grow unbounded.
const MAX_CHAT_MESSAGES = 200;

// The most recent gameplay action, mirrored from the authoritative game state.
// Drives the subtle "last played by" indicator near the discard pile.
export interface GameLastAction {
  type: 'play' | 'draw' | 'pass' | 'jump_in' | 'swap' | 'rotate' | 'challenge';
  playerId: string;
  card?: CardItem;
  unoPenalty?: boolean;
  drawCount?: number;
  targetId?: string;
  challengeSuccess?: boolean;
}

interface GameState {
  socket: Socket | null;
  room: Room | null;
  player: Player | null;
  // The local user's spectator identity when they joined as a spectator (player is
  // null in that case). Carries the private reconnect secret like player does.
  spectator: Spectator | null;
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  cameraMode: 'seated' | 'orbit';
  
  // Card Engine States
  playerCards: Record<number, CardItem[]>; // seatNumber -> CardItem[]
  discardPile: CardItem[];
  drawPileCount: number;
  selectedCardId: string | null;
  isProcessing: boolean;

  // Active UNO Game Engine States
  currentPlayerId: string | null;
  currentPlayerSeat: number | null;
  direction: 'clockwise' | 'counter-clockwise' | null;
  wildColor: CardColor | null;
  gameStatus: 'lobby' | 'playing' | 'awaiting_color_selection' | 'awaiting_swap_target' | 'ended';
  colorChooserId: string | null;
  swapChooserId: string | null;
  challengeableById: string | null;
  // Active house rules. Sourced from the lobby (host-editable) and locked into the
  // game payload once a round starts. Always a complete, normalized object.
  houseRules: HouseRules;
  winnerId: string | null;
  winnerName: string | null;
  unoCalled: Record<string, boolean>; // socketId -> boolean
  drawStack: number; // accumulated +2/+4 cards the next player must stack or draw
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null; // top of an active draw chain
  drawnCardId: string | null; // id of a just-drawn, still-playable card awaiting a play-or-pass decision
  lastAction: GameLastAction | null; // most recent action from the authoritative game state
  match: MatchState | null; // running match scoreboard across rounds
  turnDeadline: number | null; // epoch ms when the active turn auto-resolves on the server
  gameStoppedNotice: boolean; // true when a game was just stopped due to too few players
  isSpectator: boolean;
  reactions: Array<{ id: string; name: string; seatNumber: number | null; emoji: string; isSpectator: boolean }>;
  // Text chat
  chatMessages: ChatMessage[];
  isChatOpen: boolean;
  unreadChatCount: number;
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  tableTheme: 'classic-green' | 'premium-blue' | 'dark-night';
  isMuted: boolean;
  
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  setTableTheme: (theme: 'classic-green' | 'premium-blue' | 'dark-night') => void;
  toggleMute: () => void;
  setGameStoppedNotice: (val: boolean) => void;
  setHouseRules: (rules: HouseRules) => void;
  
  setSocket: (socket: Socket | null) => void;
  setIsProcessing: (val: boolean) => void;
  setIsSpectator: (val: boolean) => void;
  addReaction: (reaction: { id: string; name: string; seatNumber: number | null; emoji: string; isSpectator: boolean }) => void;
  removeReaction: (id: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  setRoom: (room: Room | null) => void;
  setPlayer: (player: Player | null) => void;
  setSpectator: (spectator: Spectator | null) => void;
  setError: (error: string | null) => void;
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
  setCameraMode: (mode: 'seated' | 'orbit') => void;
  
  // Card Actions
  setSelectedCardId: (id: string | null) => void;
  setPlayerCards: (seatNumber: number, cards: CardItem[]) => void;
  addCardToPlayer: (seatNumber: number, card: CardItem) => void;
  removeCardFromPlayer: (seatNumber: number, cardId: string) => void;
  playCardToDiscard: (seatNumber: number, cardId: string) => void;
  setDiscardPile: (cards: CardItem[]) => void;
  setDrawPileCount: (count: number) => void;
  clearAllCards: () => void;
  
  // Game state bulk updater
  setGameState: (payload: {
    hands: Record<number, CardItem[]>;
    discardPile: CardItem[];
    drawPileCount: number;
    currentPlayerId: string;
    currentPlayerSeat: number;
    direction: 'clockwise' | 'counter-clockwise';
    wildColor: CardColor | null;
    gameStatus: 'playing' | 'awaiting_color_selection' | 'awaiting_swap_target' | 'ended';
    colorChooserId: string | null;
    swapChooserId?: string | null;
    challengeableById?: string | null;
    winnerId: string | null;
    winnerName: string | null;
    unoCalled: Record<string, boolean>;
    drawStack?: number;
    pendingDrawType?: 'draw_two' | 'wild_draw_four' | null;
    drawnCardId?: string | null;
    turnDeadline?: number | null;
    match?: MatchState | null;
    houseRules?: HouseRules | null;
    lastAction?: GameLastAction | null;
  }) => void;
  
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  socket: null,
  room: null,
  player: null,
  spectator: null,
  error: null,
  connectionStatus: 'disconnected',
  cameraMode: 'seated',
  
  // Card defaults
  playerCards: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  discardPile: [],
  drawPileCount: 108,
  selectedCardId: null,
  isProcessing: false,

  // Active UNO Game Engine defaults
  currentPlayerId: null,
  currentPlayerSeat: null,
  direction: 'clockwise',
  wildColor: null,
  gameStatus: 'lobby',
  colorChooserId: null,
  swapChooserId: null,
  challengeableById: null,
  houseRules: { ...DEFAULT_HOUSE_RULES },
  winnerId: null,
  winnerName: null,
  unoCalled: {},
  drawStack: 0,
  pendingDrawType: null,
  drawnCardId: null,
  lastAction: null,
  match: null,
  turnDeadline: null,
  gameStoppedNotice: false,
  isSpectator: false,
  reactions: [],
  chatMessages: [],
  isChatOpen: false,
  unreadChatCount: 0,
  toasts: [],
  tableTheme: 'premium-blue',
  isMuted: false,

  addToast: (message, type = 'info') => set((state) => {
    const id = `toast-${Math.random().toString(36).substring(2, 9)}`;
    // Auto-remove toast after 3.5 seconds
    setTimeout(() => {
      useGameStore.getState().removeToast(id);
    }, 3500);
    return { toasts: [...state.toasts, { id, message, type }] };
  }),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
  setTableTheme: (tableTheme) => set({ tableTheme }),
  setGameStoppedNotice: (gameStoppedNotice) => set({ gameStoppedNotice }),
  setHouseRules: (houseRules) => set({ houseRules: normalizeHouseRules(houseRules) }),
  toggleMute: () => set((state) => {
    const nextMuted = !state.isMuted;
    soundManager.setEnabled(!nextMuted);
    return { isMuted: nextMuted };
  }),

  setSocket: (socket) => set({ socket }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setIsSpectator: (isSpectator) => set({ isSpectator }),
  addReaction: (reaction) => set((state) => ({ reactions: [...state.reactions, reaction] })),
  removeReaction: (id) => set((state) => ({ reactions: state.reactions.filter(r => r.id !== id) })),
  addChatMessage: (message) => set((state) => {
    // De-dupe by id (defensive against a double-emit) and cap history length.
    if (state.chatMessages.some((m) => m.id === message.id)) return {};
    const next = [...state.chatMessages, message].slice(-MAX_CHAT_MESSAGES);
    // Only count as unread when the panel is closed and it isn't our own message.
    const isOwn = message.senderId === state.player?.id;
    const unreadChatCount = state.isChatOpen || isOwn ? state.unreadChatCount : state.unreadChatCount + 1;
    return { chatMessages: next, unreadChatCount };
  }),
  setChatOpen: (open) => set((state) => ({
    isChatOpen: open,
    // Opening the panel clears the unread indicator.
    unreadChatCount: open ? 0 : state.unreadChatCount,
  })),
  setRoom: (room) => set({ room }),
  setPlayer: (player) => set({ player }),
  setSpectator: (spectator) => set({ spectator }),
  setError: (error) => set({ error }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  
  setSelectedCardId: (selectedCardId) => set({ selectedCardId }),
  setPlayerCards: (seatNumber, cards) => set((state) => ({
    playerCards: { ...state.playerCards, [seatNumber]: cards }
  })),
  addCardToPlayer: (seatNumber, card) => set((state) => {
    const existing = state.playerCards[seatNumber] || [];
    return {
      playerCards: { ...state.playerCards, [seatNumber]: [...existing, card] }
    };
  }),
  removeCardFromPlayer: (seatNumber, cardId) => set((state) => {
    const existing = state.playerCards[seatNumber] || [];
    return {
      playerCards: { ...state.playerCards, [seatNumber]: existing.filter(c => c.id !== cardId) }
    };
  }),
  playCardToDiscard: (seatNumber, cardId) => set((state) => {
    const hand = state.playerCards[seatNumber] || [];
    const cardToPlay = hand.find(c => c.id === cardId);
    if (!cardToPlay) return {};
    
    return {
      playerCards: { ...state.playerCards, [seatNumber]: hand.filter(c => c.id !== cardId) },
      discardPile: [...state.discardPile, cardToPlay],
      selectedCardId: state.selectedCardId === cardId ? null : state.selectedCardId
    };
  }),
  setDiscardPile: (discardPile) => set({ discardPile }),
  setDrawPileCount: (drawPileCount) => set({ drawPileCount }),
  clearAllCards: () => set({
    playerCards: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    discardPile: [],
    drawPileCount: 52,
    selectedCardId: null,
    isProcessing: false,
    // NOTE: isSpectator/spectator are intentionally NOT reset here — the local
    // user's role comes from the authoritative join result and must survive a
    // game being stopped/reset back to the lobby.
    reactions: [],
    chatMessages: [],
    isChatOpen: false,
    unreadChatCount: 0,
    toasts: [],
    tableTheme: 'premium-blue',
    currentPlayerId: null,
    currentPlayerSeat: null,
    wildColor: null,
    gameStatus: 'lobby',
    colorChooserId: null,
    swapChooserId: null,
    challengeableById: null,
    winnerId: null,
    winnerName: null,
    unoCalled: {},
    drawStack: 0,
    pendingDrawType: null,
    drawnCardId: null,
    lastAction: null,
    match: null,
    turnDeadline: null,
    gameStoppedNotice: false,
  }),

  setGameState: (payload) => {
    logger.debug(`[STORE] SETTING GAME STATE. DISCARD PILE:`, payload.discardPile?.length, 'TOP:', payload.discardPile?.[payload.discardPile.length - 1]);
    set((state) => ({
      playerCards: payload.hands,
      discardPile: payload.discardPile,
      drawPileCount: payload.drawPileCount,
      currentPlayerId: payload.currentPlayerId,
      currentPlayerSeat: payload.currentPlayerSeat,
      direction: payload.direction,
      wildColor: payload.wildColor,
      gameStatus: payload.gameStatus,
      colorChooserId: payload.colorChooserId,
      swapChooserId: payload.swapChooserId ?? null,
      challengeableById: payload.challengeableById ?? null,
      houseRules: payload.houseRules ? normalizeHouseRules(payload.houseRules) : state.houseRules,
      winnerId: payload.winnerId,
      winnerName: payload.winnerName,
      unoCalled: payload.unoCalled,
      drawStack: payload.drawStack ?? 0,
      pendingDrawType: payload.pendingDrawType ?? null,
      drawnCardId: payload.drawnCardId ?? null,
      lastAction: payload.lastAction ?? null,
      match: payload.match ?? state.match ?? null,
      turnDeadline: payload.turnDeadline ?? null,
      gameStoppedNotice: false,
      isProcessing: false,
    }));
  },

  reset: () => set({
    room: null,
    player: null,
    spectator: null,
    error: null,
    cameraMode: 'seated',
    playerCards: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    discardPile: [],
    drawPileCount: 52,
    selectedCardId: null,
    isProcessing: false,
    isSpectator: false,
    reactions: [],
    chatMessages: [],
    isChatOpen: false,
    unreadChatCount: 0,
    toasts: [],
    tableTheme: 'premium-blue',
    currentPlayerId: null,
    currentPlayerSeat: null,
    direction: 'clockwise',
    wildColor: null,
    gameStatus: 'lobby',
    colorChooserId: null,
    swapChooserId: null,
    challengeableById: null,
    winnerId: null,
    winnerName: null,
    unoCalled: {},
    drawStack: 0,
    pendingDrawType: null,
    drawnCardId: null,
    lastAction: null,
    match: null,
    turnDeadline: null,
    gameStoppedNotice: false,
  }),
}));

