'use client';

import { useGameStore } from '../store/useGameStore';
import { isValidMove } from '../lib/cards/cardEngine';

/**
 * True when it is the local player's turn and drawing from the deck is the ONLY
 * legal way to continue — not one card in hand is playable.
 *
 * This is the moment CrazyGames QA flagged: the hand shows no highlighted cards
 * and nothing else changes, so a new player can read it as "the game is stuck"
 * rather than "click the deck". The deck affordance subscribes to this state to
 * escalate itself into an explicit call to action.
 *
 * Deliberately DERIVED, never stored, and it reuses the exact predicate
 * (`isValidMove`) that PlayerHandHUD uses to highlight playable cards. So the
 * cue can only ever appear when the player genuinely sees zero highlighted
 * cards — the two can't drift apart. No new game logic lives here; the server
 * remains the sole authority on what is legal.
 *
 * Goes false the instant the situation resolves: a playable card appears (a
 * wild color is chosen, a jump-in hands over the turn), a card has been drawn
 * (`drawnCardId` — the play-or-pass prompt owns that moment), an action is
 * already in flight (`isProcessing`, set synchronously when the deck is
 * clicked), the turn moves on, or the round leaves normal play.
 */
export const useMustDraw = (): boolean =>
  useGameStore((s) => {
    // Normal play only. The forced-choice phases (color / swap) and the end of a
    // round have their own dialogs, and a spectator never draws.
    if (s.gameStatus !== 'playing' || !s.player || s.isSpectator) return false;
    if (s.currentPlayerId !== s.player.id) return false;
    // Already drew, or a request is mid-flight: no longer a stuck player.
    if (s.isProcessing || s.drawnCardId) return false;

    const hand = s.playerCards[s.player.seatNumber] || [];
    const topCard = s.discardPile.length > 0 ? s.discardPile[s.discardPile.length - 1] : null;
    if (hand.length === 0 || !topCard) return false;

    return !hand.some((card) => isValidMove(card, topCard, s.wildColor, s.pendingDrawType));
  });

export default useMustDraw;
