'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { HtmlCard } from '../cards/HtmlCard';
import { canPlayCard, canJumpInWithCard, CardItem } from '../../lib/cards/cardEngine';
import { useViewport } from '../../hooks/useViewport';
import { useSocket } from '../../hooks/useSocket';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import { describeCard } from '../../lib/cards/colorIdentity';
import { createHandGestureGuard, getCardRevealScroll, getHandLayout } from '../../lib/cards/handLayout';

export const PlayerHandHUD: React.FC = () => {
  useKeyboardControls();

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
  const selectedCardId = useGameStore((state) => state.selectedCardId);
  const setSelectedCardId = useGameStore((state) => state.setSelectedCardId);
  const { playCard, jumpIn } = useSocket();
  const { width, isMobile, isTablet, isTouch, isLandscape } = useViewport();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const gesture = useRef(createHandGestureGuard());
  const instructionsId = useId();
  const hand = player ? playerCards[player.seatNumber] || [] : [];
  const cardCount = hand.length;
  const layout = getHandLayout({ cardCount, viewportWidth: width, isMobile, isTablet, isTouch });
  const { cardWidth: cardW, cardHeight: cardH, step, handWidth: fanWidth, scrollable } = layout;

  const revealCard = useCallback((button: HTMLButtonElement | undefined) => {
    const strip = scrollRef.current;
    if (!strip || !button) return;
    const cardBounds = button.getBoundingClientRect();
    const stripBounds = strip.getBoundingClientRect();
    const left = getCardRevealScroll({
      scrollLeft: strip.scrollLeft,
      viewportWidth: strip.clientWidth,
      scrollWidth: strip.scrollWidth,
      cardLeft: cardBounds.left - stripBounds.left + strip.scrollLeft,
      cardWidth: cardBounds.width,
    });
    // Immediate movement keeps rapid keyboard navigation and reduced-motion
    // users in sync; it does not interrupt a touch swipe unless selection changes.
    strip.scrollLeft = left;
  }, []);

  useEffect(() => {
    if (scrollable && selectedCardId) revealCard(cardRefs.current.get(selectedCardId));
  }, [scrollable, selectedCardId, cardCount, width, revealCard]);

  const handVisible = !!room && !!player &&
    ['playing', 'awaiting_color_selection'].includes(room.status) && gameStatus !== 'ended';
  useEffect(() => {
    const strip = scrollRef.current;
    if (!scrollable || !handVisible || !strip) return;
    let start: { x: number; y: number; atStart: boolean; atEnd: boolean } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      start = touch ? {
        x: touch.clientX, y: touch.clientY,
        atStart: strip.scrollLeft <= 1,
        atEnd: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1,
      } : null;
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      // Native history swipes can ignore CSS overscroll containment. Only stop
      // outward gestures at an exhausted edge; inward browsing remains native.
      if (Math.abs(dx) > Math.abs(dy) && ((start.atStart && dx > 0) || (start.atEnd && dx < 0))) {
        if (event.cancelable) event.preventDefault();
        gesture.current.cancel();
      }
    };
    const onEnd = () => { start = null; };
    strip.addEventListener('touchstart', onStart, { passive: true });
    strip.addEventListener('touchmove', onMove, { passive: false });
    strip.addEventListener('touchend', onEnd);
    strip.addEventListener('touchcancel', onEnd);
    return () => {
      strip.removeEventListener('touchstart', onStart);
      strip.removeEventListener('touchmove', onMove);
      strip.removeEventListener('touchend', onEnd);
      strip.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollable, handVisible]);

  // Hide hand when game is not active or has ended
  if (!room || !player || !['playing', 'awaiting_color_selection'].includes(room.status)) {
    return null;
  }
  if (gameStatus === 'ended') {
    return null;
  }

  const isMyTurn = gameStatus === 'playing' && currentPlayerId === player.id && !isProcessing;
  const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Jump-In: when the rule is on and it's NOT our turn, a card that is identical
  // (same color AND value) to the top card can be played out of turn to seize it.
  const jumpInEnabled = gameStatus === 'playing' && !isProcessing;
  const canJumpIn = (card: CardItem): boolean =>
    jumpInEnabled &&
    currentPlayerId !== player.id &&
    canJumpInWithCard(card, topCard, pendingDrawType, houseRules, hand.length);

  // Vertical lift amounts scale with card size so the arch/hover reads well on
  // both a tiny phone and a large monitor.
  const liftPlayable = scrollable ? 4 : cardH * 0.22;
  const liftHover = scrollable ? 8 : cardH * 0.28;
  const archMax = scrollable ? 0 : cardH * 0.14;

  // Render a CSS replica of an UNO card
  const renderCard = (card: CardItem, idx: number) => {
    // Max fan angle based on hand size (gentler on small screens so tall cards
    // don't rotate off the bottom edge).
    const maxAngle = scrollable ? 0 : Math.min(isMobile ? 20 : 30, cardCount * 2.5);
    const angle = cardCount > 1
      ? -maxAngle + (idx * (maxAngle * 2 / (cardCount - 1)))
      : 0;

    // Arch height (cards in the middle are higher)
    const normalizedIdx = cardCount > 1 ? (idx / (cardCount - 1)) * 2 - 1 : 0; // -1 to 1
    const yArchOffset = Math.abs(normalizedIdx) * archMax;

    // Highlight every card that is a legal play this turn (server is the final
    // authority; this just mirrors the same rule for visual affordance).
    const isPlayable = isMyTurn && canPlayCard(card, topCard, wildColor, pendingDrawType, houseRules, hand.length);
    const isJumpIn = canJumpIn(card);
    const canPlay = isPlayable || isJumpIn;
    const isSelected = selectedCardId === card.id;

    const activate = () => {
      if (isMyTurn) playCard(card.id);
      else if (isJumpIn) jumpIn(card.id);
    };

    // Accessible name conveys the card and what activating it does.
    const name = describeCard(card);
    const prefix = isSelected ? '[Selected] ' : '';
    const ariaLabel = isJumpIn
      ? `${prefix}Jump in with ${name}`
      : isMyTurn
        ? isPlayable ? `${prefix}Play ${name}` : `${prefix}${name} (not playable)`
        : `${prefix}${name}`;

    const targetY = isSelected
      ? yArchOffset - liftHover - (scrollable ? 0 : 8)
      : (isPlayable || isJumpIn)
        ? yArchOffset - liftPlayable
        : yArchOffset;

    let ringShadowClasses = '';
    if (isSelected) {
      if (canPlay) {
        ringShadowClasses = 'rounded-xl ring-[3px] sm:ring-4 ring-yellow-300 shadow-[0_0_28px_8px_rgba(253,224,71,0.85)]';
      } else {
        ringShadowClasses = 'rounded-xl ring-[3px] sm:ring-4 ring-sky-400 shadow-[0_0_24px_6px_rgba(56,189,248,0.75)]';
      }
    } else if (isPlayable) {
      ringShadowClasses = 'rounded-xl ring-[3px] sm:ring-4 ring-yellow-300 shadow-[0_0_22px_6px_rgba(253,224,71,0.55)]';
    } else if (isJumpIn) {
      ringShadowClasses = 'rounded-xl ring-[3px] sm:ring-4 ring-fuchsia-400 shadow-[0_0_22px_6px_rgba(232,121,249,0.55)]';
    }

    return (
      <motion.button
        key={card.id}
        ref={(button) => {
          if (button) cardRefs.current.set(card.id, button);
          else cardRefs.current.delete(card.id);
        }}
        type="button"
        data-card-id={card.id}
        aria-label={ariaLabel}
        aria-disabled={!canPlay}
        tabIndex={scrollable ? (isSelected || (!selectedCardId && idx === 0) ? 0 : -1) : canPlay ? 0 : -1}
        initial={{ y: scrollable ? 0 : 100, opacity: 0 }}
        animate={{
          y: targetY,
          rotate: isSelected ? 0 : angle,
          scale: isSelected && !scrollable ? 1.14 : 1,
          opacity: 1
        }}
        whileHover={{
          y: yArchOffset - liftHover,
          scale: scrollable ? 1 : 1.12,
          zIndex: 70
        }}
        whileTap={{ scale: scrollable ? 1 : 1.08 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        style={{
          width: cardW,
          height: cardH,
          marginLeft: idx === 0 ? 0 : -(cardW - step),
          transformOrigin: 'bottom center',
          zIndex: isSelected ? 60 : (isPlayable || isJumpIn) ? 40 : idx,
        }}
        onFocus={(event) => {
          setSelectedCardId(card.id);
          if (scrollable) revealCard(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const nextIndex = event.key === 'ArrowLeft' ? Math.max(0, idx - 1)
            : event.key === 'ArrowRight' ? Math.min(cardCount - 1, idx + 1)
              : event.key === 'Home' ? 0 : event.key === 'End' ? cardCount - 1 : null;
          if (nextIndex === null) return;
          event.preventDefault();
          cardRefs.current.get(hand[nextIndex].id)?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (scrollable && gesture.current.suppressClick(event.detail)) {
            event.preventDefault();
            return;
          }
          setSelectedCardId(card.id);
          if (canPlay) activate();
        }}
        className={`relative shrink-0 pointer-events-auto bg-transparent p-0 border-0
          ${canPlay ? 'cursor-pointer hover:shadow-2xl' : 'opacity-85 cursor-pointer'}
          ${ringShadowClasses}
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
    <div
      role="region"
      aria-label="Your hand"
      aria-describedby={scrollable ? instructionsId : undefined}
      data-hand-layout={scrollable ? 'scroll' : 'fan'}
      className={`fixed left-1/2 -translate-x-1/2 pointer-events-none flex flex-col justify-end z-[100] w-full safe-bottom ${bottomOffset}`}
      style={{ paddingLeft: 'max(8px, env(safe-area-inset-left))', paddingRight: 'max(8px, env(safe-area-inset-right))' }}
    >
      {scrollable && (
        <p id={instructionsId} className="mx-auto mb-1 rounded-full bg-slate-950/90 px-3 py-1 text-center text-xs font-semibold text-white">
          {cardCount} cards · {isTouch ? 'Swipe' : 'Scroll'} to browse
          <span className="sr-only">. Use arrow keys, Home or End to browse cards, and Enter to play.</span>
        </p>
      )}
      <div
        ref={scrollable ? scrollRef : undefined}
        data-hand-scroll={scrollable ? 'true' : undefined}
        className={scrollable ? 'pointer-events-auto mx-auto max-w-full overflow-x-auto overflow-y-hidden rounded-xl bg-slate-950/45' : ''}
        style={scrollable ? { width: layout.availableWidth, touchAction: 'pan-x', overscrollBehaviorX: 'contain', scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 transparent' } : undefined}
        onPointerDownCapture={scrollable ? (event) => gesture.current.start(event) : undefined}
        onPointerMoveCapture={scrollable ? (event) => gesture.current.move(event) : undefined}
        onPointerUpCapture={scrollable ? (event) => gesture.current.end(event) : undefined}
        onPointerCancelCapture={scrollable ? () => gesture.current.cancel() : undefined}
        onScroll={scrollable ? () => gesture.current.scroll() : undefined}
      >
        <div
          className="relative flex items-end"
          style={{
            width: fanWidth + layout.edgePadding * 2,
            margin: scrollable ? 0 : '0 auto',
            padding: scrollable ? `16px ${layout.edgePadding}px 8px` : undefined,
            boxSizing: 'border-box',
          }}
        >
          <AnimatePresence>{hand.map((card, idx) => renderCard(card, idx))}</AnimatePresence>
        </div>
      </div>
    </div>
  );
};

