'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

/**
 * Banner shown when the server aborted a round because too many players left.
 * Dismissible — the table has already been reset underneath, so this is
 * informational only and never blocks the lobby controls behind it.
 */
export const GameStoppedNotice: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const gameStoppedNotice = useGameStore((s) => s.gameStoppedNotice);
  const setGameStoppedNotice = useGameStore((s) => s.setGameStoppedNotice);

  const isHost = player?.isHost || false;
  const canStart = (room?.players.length || 0) >= 2;

  return (
    <AnimatePresence>
      {gameStatus === 'lobby' && gameStoppedNotice && (
        <motion.div
          initial={{ opacity: 0, y: -30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[90%] max-w-md short:top-24 short:max-w-lg"
        >
          <div className="panel-arcade bg-gradient-to-b from-neutral-900 to-black px-6 py-5 flex flex-col items-center gap-3 text-center relative short:px-4 short:py-3 short:gap-1.5">
            <button
              onClick={() => setGameStoppedNotice(false)}
              className="absolute top-2.5 right-2.5 chip-arcade w-7 h-7 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700"
              title="Dismiss"
              aria-label="Dismiss game stopped notice"
            >
              <X size={13} />
            </button>
            <div className="w-14 h-14 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] animate-bounce">
              <Pause size={26} className="fill-white" />
            </div>
            <h3 className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm">
              Game Stopped
            </h3>
            <p className="font-rounded font-semibold text-white/85 text-sm leading-snug">
              Not enough players to keep playing. The table has been reset.
            </p>
            <p className="font-rounded font-bold text-[11px] uppercase tracking-wider text-cyan-200 animate-pulse">
              {isHost
                ? canStart
                  ? 'Press Start Game to play a fresh round!'
                  : 'Waiting for another player to join…'
                : 'Waiting for the host to start a new game…'}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GameStoppedNotice;
