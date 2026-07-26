'use client';

import React from 'react';
import { motion } from 'framer-motion';

// Mini UNO cards used in the loader's shuffle animation
const SHUFFLE_CARDS = [
  { color: '#ef4444', label: '7' },   // red
  { color: '#eab308', label: '+2' },  // yellow
  { color: '#22c55e', label: 'W' },   // green
  { color: '#3b82f6', label: '4' },   // blue
  { color: '#ef4444', label: '+4' },   // red
];

// A single mini UNO card face
const MiniUnoCard: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div
    className="w-full h-full rounded-xl border-[3px] border-white shadow-[0_8px_16px_rgba(0,0,0,0.45)] flex items-center justify-center p-1"
    style={{ background: color }}
  >
    <div className="w-full h-full rounded-lg border border-black/10 flex items-center justify-center overflow-hidden">
      {/* White oval badge with the value, classic UNO style */}
      <div className="w-[78%] h-[58%] bg-white rounded-[999px] flex items-center justify-center -rotate-12 shadow-inner">
        <span className="font-arcade text-lg leading-none" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  </div>
);

export interface PremiumLoaderProps {
  message: string;
  submessage?: string;
}

/**
 * Gamified loader: a deck of UNO cards riffle-shuffling in a loop.
 *
 * Used both as the lazy-loading fallback for the 3D table bundle and as the
 * "connecting to lobby" screen, so it lives on its own rather than inside the
 * route component.
 */
export const PremiumLoader: React.FC<PremiumLoaderProps> = ({ message, submessage }) => {
  const cycle = 2.6; // seconds for one full shuffle loop
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center arcade-bg arcade-dots text-slate-100 gap-8 z-[999] overflow-hidden select-none">
      {/* Rotating festive glow rings behind the deck */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
        className="absolute w-[420px] h-[420px] rounded-full blur-[70px] pointer-events-none opacity-50"
        style={{
          background:
            'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #3b82f6, #ef4444)',
        }}
      />

      {/* Shuffling Deck */}
      <div className="relative w-44 h-40 flex items-center justify-center">
        {SHUFFLE_CARDS.map((card, i) => {
          const baseX = (i - (SHUFFLE_CARDS.length - 1) / 2) * 6;
          const baseRot = (i - (SHUFFLE_CARDS.length - 1) / 2) * 5;
          const delay = (i * cycle) / SHUFFLE_CARDS.length;
          return (
            <motion.div
              key={i}
              className="absolute w-[4.5rem] h-[6.5rem]"
              style={{ transformOrigin: 'bottom center' }}
              animate={{
                x: [baseX, baseX + 96, baseX - 96, baseX],
                y: [0, -56, -20, 0],
                rotate: [baseRot, 22, -16, baseRot],
                scale: [1, 1.12, 1.06, 1],
                zIndex: [i, 60, 30, i],
              }}
              transition={{
                duration: cycle,
                times: [0, 0.4, 0.7, 1],
                repeat: Infinity,
                ease: 'easeInOut',
                delay,
              }}
            >
              <MiniUnoCard color={card.color} label={card.label} />
            </motion.div>
          );
        })}
      </div>

      {/* Message and Submessage */}
      <div className="text-center space-y-2.5 relative z-10 px-6">
        <h2 className="font-arcade text-2xl text-yellow-400 uppercase tracking-wide arcade-stroke-uno-sm flex items-center justify-center gap-1">
          <span>{message}</span>
          {/* Bouncing dots */}
          <span className="inline-flex gap-1 ml-0.5">
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-yellow-300 inline-block"
                animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut', delay: d * 0.15 }}
              />
            ))}
          </span>
        </h2>
        {submessage && (
          <p className="font-rounded text-cyan-200 text-xs font-bold uppercase tracking-wider">
            {submessage}
          </p>
        )}
      </div>

      {/* Chunky arcade progress bar */}
      <div className="w-56 h-3 bg-black/50 rounded-full overflow-hidden relative border-[3px] border-white/70 shadow-[0_4px_0_0_rgba(0,0,0,0.35)]">
        <motion.div
          animate={{ x: ['-100%', '320%'] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          className="absolute inset-y-0 w-1/3 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, #ef4444, #eab308, #22c55e, #3b82f6, transparent)',
          }}
        />
      </div>
    </div>
  );
};

export default PremiumLoader;
