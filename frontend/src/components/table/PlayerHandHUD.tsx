'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { HtmlCard } from '../cards/HtmlCard';

import { useSocket } from '../../hooks/useSocket';

export const PlayerHandHUD: React.FC = () => {
  const { room, player, currentPlayerId, playerCards, isProcessing, gameStatus } = useGameStore();
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

    return (
      <motion.div
        key={card.id}
        initial={{ y: 100, opacity: 0 }}
        animate={{ 
          y: yArchOffset, 
          rotate: angle, 
          opacity: 1 
        }}
        whileHover={isMyTurn ? { 
          y: yArchOffset - 30, // Pop up on hover
          scale: 1.1,
          zIndex: 50
        } : undefined}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        style={{
          transformOrigin: 'bottom center',
          zIndex: idx,
        }}
        onClick={() => {
          if (isMyTurn) playCard(card.id);
        }}
        className={`relative w-[3.2rem] h-[4.8rem] sm:w-[4rem] sm:h-[6rem] md:w-[4.8rem] md:h-[7.2rem] shrink-0 
          ${isMyTurn ? 'cursor-pointer hover:shadow-2xl' : 'opacity-80 cursor-not-allowed'}
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
