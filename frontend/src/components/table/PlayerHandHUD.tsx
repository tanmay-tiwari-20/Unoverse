'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { HtmlCard } from '../cards/HtmlCard';
import { isValidMove, CardItem } from '../../lib/cards/cardEngine';
import { useViewport } from '../../hooks/useViewport';

import { useSocket } from '../../hooks/useSocket';

export const PlayerHandHUD: React.FC = () => {
  const room = useGameStore((state) => state.room);
  const player = useGameStore((state) => state.player);
  const currentPlayerId = useGameStore((state) => state.currentPlayerId);
  const playerCards = useGameStore((state) => state.playerCards);
  const isProcessing = useGameStore((state) => state.isProcessing);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const discardPile = useGameStore((state) => state.discardPile);
  const wildColor = useGameStore((state) => state.wildColor);
  const pendingDrawType = useGameStore((state) => state.pendingDrawType);
  const houseRules = useGameStore((state) => state.houseRules);
  const { playCard, jumpIn } = useSocket();
  const { width, isMobile, isTablet, isTouch, isLandscape } = useViewport();

  // Hide hand when game is not active or has ended
  if (!room || !player || !['playing', 'awaiting_color_selection'].includes(room.status)) {
    return null;
  }
  if (gameStatus === 'ended') {
    return null;
  }

  const hand = playerCards[player.seatNumber] || [];
  const cardCount = hand.length;
  const isMyTurn = currentPlayerId === player.id && !isProcessing;
  const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Jump-In: when the rule is on and it's NOT our turn, a card that is identical
  // (same color AND value) to the top card can be played out of turn to seize it.
  const jumpInEnabled = !!houseRules?.jumpIn && gameStatus === 'playing' && !pendingDrawType && !isProcessing;
  const canJumpIn = (card: CardItem): boolean =>
    jumpInEnabled &&
    currentPlayerId !== player.id &&
    !!topCard &&
    topCard.color !== 'wild' &&
    card.color === topCard.color &&
    card.value === topCard.value;

  // ---------------------------------------------------------------------------
  // Responsive sizing. Rather than fixed Tailwind sizes (which made cards tiny
  // on phones and could overflow with a big hand), we size the fan to the live
  // viewport: pick the largest card width that lets the whole hand fit across
  // the available width, allowing cards to overlap as the hand grows.
  // ---------------------------------------------------------------------------

  // Base (max) card width per device bucket — mobile HUD is intentionally large
  // so a phone player can read and tap cards comfortably.
  const baseCardW = isMobile ? 68 : isTablet ? 78 : 84;
  const cardAspect = 1.5; // height / width, classic UNO ratio

  // Horizontal budget the fan may occupy (leaves side gutters for safe areas).
  const sideGutter = isMobile ? 16 : 32;
  const available = Math.max(240, (width || 360) - sideGutter * 2);

  // How much each successive card is inset over the previous one. Positive =
  // overlap. We start with a comfortable spread and only overlap once the hand
  // would otherwise run past the available width.
  const idealSpread = baseCardW * (isTouch ? 0.72 : 0.66); // visible slice per card
  const naturalWidth = baseCardW + (cardCount - 1) * idealSpread;

  let cardW = baseCardW;
  let step = idealSpread;
  if (naturalWidth > available && cardCount > 1) {
    // Compress: shrink the per-card step (more overlap) and, if that is not
    // enough, scale the whole card down so even a 15+ card hand stays on-screen.
    step = (available - baseCardW) / (cardCount - 1);
    const minStep = baseCardW * 0.22; // never fully hide a card's face
    if (step < minStep) {
      const scale = (available - minStep) / (baseCardW + (cardCount - 1) * minStep - minStep);
      cardW = Math.max(isMobile ? 40 : 52, baseCardW * scale);
      step = Math.max(cardW * 0.22, (available - cardW) / (cardCount - 1));
    }
  }
  const cardH = cardW * cardAspect;
  const fanWidth = cardW + (cardCount - 1) * step;

  // Vertical lift amounts scale with card size so the arch/hover reads well on
  // both a tiny phone and a large monitor.
  const liftPlayable = cardH * 0.22;
  const liftHover = cardH * 0.28;
  const archMax = cardH * 0.14;

  // Human-readable card name for screen readers (e.g. "Red 7", "Wild Draw Four").
  const describeCard = (card: CardItem): string => {
    const color = card.color === 'wild' ? 'Wild' : card.color.charAt(0).toUpperCase() + card.color.slice(1);
    const valueLabels: Record<string, string> = {
      draw_two: 'Draw Two',
      wild_draw_four: 'Wild Draw Four',
      skip: 'Skip',
      reverse: 'Reverse',
      wild: 'Wild',
    };
    const value = valueLabels[card.value] ?? card.value;
    // Avoid "Wild Wild" for plain wild cards.
    if (card.color === 'wild') return value;
    return `${color} ${value}`;
  };

  // Render a CSS replica of an UNO card
  const renderCard = (card: CardItem, idx: number) => {
    // Max fan angle based on hand size (gentler on small screens so tall cards
    // don't rotate off the bottom edge).
    const maxAngle = Math.min(isMobile ? 20 : 30, cardCount * 2.5);
    const angle = cardCount > 1
      ? -maxAngle + (idx * (maxAngle * 2 / (cardCount - 1)))
      : 0;

    // Arch height (cards in the middle are higher)
    const normalizedIdx = cardCount > 1 ? (idx / (cardCount - 1)) * 2 - 1 : 0; // -1 to 1
    const yArchOffset = Math.abs(normalizedIdx) * archMax;

    // Highlight every card that is a legal play this turn (server is the final
    // authority; this just mirrors the same rule for visual affordance).
    const isPlayable = isMyTurn && !!topCard && isValidMove(card, topCard, wildColor, pendingDrawType);
    const isJumpIn = canJumpIn(card);
    const canPlay = isMyTurn || isJumpIn;

    const activate = () => {
      if (isMyTurn) playCard(card.id);
      else if (isJumpIn) jumpIn(card.id);
    };

    // Accessible name conveys the card and what activating it does.
    const name = describeCard(card);
    const ariaLabel = isJumpIn
      ? `Jump in with ${name}`
      : isMyTurn
        ? isPlayable ? `Play ${name}` : `${name} (not playable)`
        : name;

    return (
      <motion.button
        key={card.id}
        type="button"
        aria-label={ariaLabel}
        aria-disabled={!canPlay}
        tabIndex={canPlay ? 0 : -1}
        initial={{ y: 100, opacity: 0 }}
        animate={{
          y: (isPlayable || isJumpIn) ? yArchOffset - liftPlayable : yArchOffset,
          rotate: angle,
          opacity: 1
        }}
        whileHover={canPlay ? {
          y: yArchOffset - liftHover,
          scale: 1.12,
          zIndex: 50
        } : undefined}
        whileTap={canPlay ? { scale: 1.08 } : undefined}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        style={{
          width: cardW,
          height: cardH,
          marginLeft: idx === 0 ? 0 : -(cardW - step),
          transformOrigin: 'bottom center',
          zIndex: (isPlayable || isJumpIn) ? 40 : idx,
        }}
        onClick={() => {
          if (canPlay) activate();
        }}
        className={`relative shrink-0 pointer-events-auto bg-transparent p-0 border-0
          ${canPlay ? 'cursor-pointer hover:shadow-2xl' : 'opacity-80 cursor-not-allowed'}
          ${isPlayable ? 'rounded-xl ring-[3px] sm:ring-4 ring-yellow-300 shadow-[0_0_22px_6px_rgba(253,224,71,0.55)]' : ''}
          ${isJumpIn ? 'rounded-xl ring-[3px] sm:ring-4 ring-fuchsia-400 shadow-[0_0_22px_6px_rgba(232,121,249,0.55)]' : ''}
          transition-shadow duration-200 ease-out`}
      >
        <HtmlCard color={card.color} value={card.value} />
      </motion.button>
    );
  };

  // On a landscape phone the viewport is only ~390px tall, so the fan's arch
  // would reach past the midline and occlude the table. Sit it flush with the
  // safe-area floor there; everywhere else keep the usual breathing room.
  const bottomOffset = isMobile && isLandscape ? 'bottom-0' : 'bottom-2 sm:bottom-5';

  return (
    <div className={`fixed left-1/2 -translate-x-1/2 pointer-events-none flex flex-col justify-end z-[100] w-full px-2 safe-bottom ${bottomOffset}`}>
      <AnimatePresence>
        <div className="flex justify-center items-end" style={{ width: fanWidth, margin: '0 auto' }}>
          {hand.map((card, idx) => renderCard(card, idx))}
        </div>
      </AnimatePresence>
    </div>
  );
};
