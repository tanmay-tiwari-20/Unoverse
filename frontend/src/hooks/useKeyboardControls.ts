'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useSocket } from './useSocket';
import { canPlayCard, canJumpInWithCard, CardItem } from '../lib/cards/cardEngine';
import { shouldIgnoreGameplayKey } from '../lib/keyboardGuards';

/**
 * Global keyboard controls for Unoverse.
 *
 * Controls:
 *   - 1 – 7: Select corresponding card in hand (1st to 7th).
 *   - ArrowLeft / ArrowRight: Navigate back and forth between cards in hand.
 *   - Space / Enter: Play/confirm currently selected card if valid move.
 *   - Escape: Deselect current card or close open chat.
 *
 * Safety:
 *   - Completely disabled when user is typing in inputs, textareas, selects, or contenteditable elements.
 *   - Only active when game is in an active state.
 *   - Ignores key repeat and modifier chords (Ctrl, Alt, Meta).
 */
export function useKeyboardControls() {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const playerCards = useGameStore((s) => s.playerCards);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const discardPile = useGameStore((s) => s.discardPile);
  const wildColor = useGameStore((s) => s.wildColor);
  const pendingDrawType = useGameStore((s) => s.pendingDrawType);
  const houseRules = useGameStore((s) => s.houseRules);
  const selectedCardId = useGameStore((s) => s.selectedCardId);
  const setSelectedCardId = useGameStore((s) => s.setSelectedCardId);
  const isChatOpen = useGameStore((s) => s.isChatOpen);
  const setChatOpen = useGameStore((s) => s.setChatOpen);

  const { playCard, jumpIn } = useSocket();

  // Keep latest values in refs to avoid re-binding event listener constantly
  const stateRef = useRef({
    room,
    player,
    isSpectator,
    gameStatus,
    currentPlayerId,
    playerCards,
    isProcessing,
    discardPile,
    wildColor,
    pendingDrawType,
    houseRules,
    selectedCardId,
    isChatOpen,
  });

  useEffect(() => {
    stateRef.current = {
      room,
      player,
      isSpectator,
      gameStatus,
      currentPlayerId,
      playerCards,
      isProcessing,
      discardPile,
      wildColor,
      pendingDrawType,
      houseRules,
      selectedCardId,
      isChatOpen,
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGameplayKey(e)) return;

      const {
        room: currentRoom,
        player: currentPlayer,
        isSpectator: currentIsSpectator,
        gameStatus: currentGameStatus,
        currentPlayerId: currentTurnId,
        playerCards: currentCards,
        isProcessing: currentIsProcessing,
        discardPile: currentDiscard,
        wildColor: currentWildColor,
        pendingDrawType: currentPendingDraw,
        houseRules: currentHouseRules,
        selectedCardId: currentSelectedId,
        isChatOpen: currentChatOpen,
      } = stateRef.current;

      // Escape key: close chat or deselect card
      if (e.key === 'Escape') {
        if (currentChatOpen) {
          setChatOpen(false);
          return;
        }
        if (currentSelectedId) {
          setSelectedCardId(null);
          return;
        }
        return;
      }

      // Remaining keys are gameplay-only: ensure game is actively in progress
      const isGameActive = Boolean(
        currentRoom &&
        currentPlayer &&
        !currentIsSpectator &&
        currentRoom.status === 'playing' && currentGameStatus === 'playing'
      );

      if (!isGameActive || !currentPlayer) return;

      const hand: CardItem[] = currentCards[currentPlayer.seatNumber] || [];
      if (hand.length === 0) return;

      // 1. Number keys 1–7: Select corresponding card
      if (/^[1-7]$/.test(e.key)) {
        const cardIndex = parseInt(e.key, 10) - 1;
        if (cardIndex >= 0 && cardIndex < hand.length) {
          setSelectedCardId(hand[cardIndex].id);
        }
        return;
      }

      // 2. Arrow keys: Navigate left and right between cards
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const currentIndex = currentSelectedId
          ? hand.findIndex((c) => c.id === currentSelectedId)
          : -1;

        let nextIndex = 0;
        if (e.key === 'ArrowLeft') {
          nextIndex = currentIndex === -1 ? 0 : Math.max(0, currentIndex - 1);
        } else {
          nextIndex = currentIndex === -1 ? 0 : Math.min(hand.length - 1, currentIndex + 1);
        }

        if (hand[nextIndex]) {
          setSelectedCardId(hand[nextIndex].id);
        }
        return;
      }

      // 3. Space / Enter: Play/confirm selected card
      if (e.key === ' ' || e.key === 'Enter') {
        if (e.key === ' ') {
          // Prevent page scrolling on Space
          e.preventDefault();
        }

        // Prevent repeated plays if user holds the key down
        if (e.repeat) return;

        if (!currentSelectedId || currentIsProcessing) return;

        const card = hand.find((c) => c.id === currentSelectedId);
        if (!card) return;

        const isMyTurn = currentTurnId === currentPlayer.id && !currentIsProcessing;
        const topCard = currentDiscard.length > 0 ? currentDiscard[currentDiscard.length - 1] : null;

        const isPlayable = isMyTurn && canPlayCard(card, topCard, currentWildColor, currentPendingDraw, currentHouseRules, hand.length);

        const jumpInEnabled =
          currentGameStatus === 'playing' &&
          !currentPendingDraw &&
          !currentIsProcessing;

        const canJumpIn =
          jumpInEnabled &&
          currentTurnId !== currentPlayer.id &&
          canJumpInWithCard(card, topCard, currentPendingDraw, currentHouseRules, hand.length);

        if (isMyTurn && isPlayable) {
          playCard(card.id);
        } else if (canJumpIn) {
          jumpIn(card.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playCard, jumpIn, setSelectedCardId, setChatOpen]);
}
