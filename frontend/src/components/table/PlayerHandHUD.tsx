'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { HtmlCard } from '../cards/HtmlCard';
import { isValidMove } from '../../lib/cards/cardEngine';

import { useSocket } from '../../hooks/useSocket';

export const PlayerHandHUD: React.FC = () => {
  const { room, player, currentPlayerId, playerCards, isProcessing, gameStatus, discardPile, wildColor, pendingDrawType } = useGameStore();
  const { playCard } = useSocket();

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

  // Render a CSS replica of an UNO card
  const renderCard = (card: any, idx: number) => {
    // Calculate elegant fan transform
    // Max fan angle based on hand size
    const maxAngle = Math.min(32, cardCount * 2.5);
    const angle = cardCount > 1
      ? -maxAngle + (idx * (maxAngle * 2 / (cardCount - 1)))
      : 0;

    // Arch height (cards in the middle are higher)
    const normalizedIdx = cardCount > 1 ? (idx / (cardCount - 1)) * 2 - 1 : 0; // -1 to 1
    const yArchOffset = Math.abs(normalizedIdx) * 20; // Middle cards are 0, outer cards are pushed down 20px

    const canPlay = isMyTurn;
    // Highlight every card that is a legal play this turn (server is the final
    // authority; this just mirrors the same rule for visual affordance).
    const isPlayable = isMyTurn && !!topCard && isValidMove(card, topCard, wildColor, pendingDrawType);

    return (
      <motion.div
        key={card.id}
        initial={{ y: 100, opacity: 0 }}
        animate={{
          y: isPlayable ? yArchOffset - 24 : yArchOffset, // lift playable cards so they stand out
          rotate: angle,
          opacity: 1
        }}
        whileHover={canPlay ? {
          y: yArchOffset - 30, // Pop up on hover
          scale: 1.1,
          zIndex: 50
        } : undefined}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        style={{
          transformOrigin: 'bottom center',
          zIndex: isPlayable ? 40 : idx,
        }}
        onClick={() => {
          if (canPlay) playCard(card.id);
        }}
        className={`relative w-[3.2rem] h-[4.8rem] sm:w-[4rem] sm:h-[6rem] md:w-[4.8rem] md:h-[7.2rem] shrink-0
          ${canPlay ? 'cursor-pointer hover:shadow-2xl' : 'opacity-80 cursor-not-allowed'}
          ${isPlayable ? 'rounded-xl ring-4 ring-yellow-300 shadow-[0_0_22px_6px_rgba(253,224,71,0.55)]' : ''}
          transition-shadow duration-200 ease-out`}
      >
        <HtmlCard color={card.color} value={card.value} />
      </motion.div>
    );
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col justify-end z-[100] w-full max-w-4xl px-4">
      <AnimatePresence>
        <div className="flex justify-center items-end" style={{ gap: cardCount > 10 ? '-1.5rem' : '-0.5rem' }}>
          {hand.map((card, idx) => (
            <div key={card.id} className="pointer-events-auto">
              {renderCard(card, idx)}
            </div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
};
