'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';

/**
 * Subtle turn indicator that shows a green glow border at the bottom of the screen
 * when it's the local player's turn. Brief transition animation on turn change.
 */
export const TurnGlowIndicator: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const isProcessing = useGameStore((s) => s.isProcessing);

  const isMyTurn = currentPlayerId === player?.id && gameStatus === 'playing' && !isProcessing;

  return (
    <AnimatePresence>
      {isMyTurn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 pointer-events-none z-[25]"
        >
          {/* Bottom glow */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(16, 185, 129, 0.6), transparent)',
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.15)',
            }}
          />
          {/* Corner glows */}
          <div 
            className="absolute bottom-0 left-0 w-32 h-32"
            style={{
              background: 'radial-gradient(ellipse at bottom left, rgba(16, 185, 129, 0.12), transparent 70%)',
            }}
          />
          <div 
            className="absolute bottom-0 right-0 w-32 h-32"
            style={{
              background: 'radial-gradient(ellipse at bottom right, rgba(16, 185, 129, 0.12), transparent 70%)',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TurnGlowIndicator;
