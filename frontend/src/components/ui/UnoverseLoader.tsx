'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface UnoverseLoaderProps {
  /** Loading text shown in the small side indicator (e.g. "Loading...", "Linking...", "Entering Arena...") */
  message?: string;
  /** Secondary subtitle or status (e.g. "Syncing seating slots...") */
  submessage?: string;
  /** Optional arena name or context */
  arenaName?: string;
  /** Fullscreen fixed overlay (default: true) or fit parent container */
  fullScreen?: boolean;
}

/**
 * Game-focused, clean Unoverse loading screen.
 *
 * Design inspired by game loading screens:
 * - Center: Large clean UNOVERSE title branding with subtle game accents.
 * - Bottom-Left: Small, elegant loading spinner + "Loading..." status text.
 * - Clean dark blue/slate game background without purple hues or heavy glow.
 */
export const UnoverseLoader: React.FC<UnoverseLoaderProps> = ({
  message = 'Loading...',
  submessage,
  arenaName,
  fullScreen = true,
}) => {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className={`${
        fullScreen ? 'fixed inset-0 z-[9999]' : 'absolute inset-0 z-50'
      } flex flex-col justify-between bg-[#0b1220] text-slate-100 p-6 sm:p-10 select-none overflow-hidden overscroll-none`}
      role="status"
      aria-live="polite"
      aria-label={`${message}${submessage ? `: ${submessage}` : ''}`}
      suppressHydrationWarning
    >
      {/* Clean dark game background with subtle radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, #131e36 0%, #0c1322 55%, #060a12 100%)',
        }}
        aria-hidden="true"
      />

      {/* Top bar (subtle arena pill if arenaName is passed) */}
      <div className="relative z-10 w-full flex justify-end">
        {arenaName && (
          <span className="font-rounded text-[11px] font-bold uppercase tracking-wider text-amber-300/80 bg-black/40 border border-amber-400/20 px-3 py-1 rounded-full backdrop-blur-xs">
            {arenaName}
          </span>
        )}
      </div>

      {/* Center Branding — Large Bold UNOVERSE Title */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto">
        <motion.div
          animate={reducedMotion ? {} : { y: [-3, 3, -3] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          {/* Subtle UNO 4-color dot strip */}
          <div className="flex items-center gap-1.5 mb-1 bg-black/35 px-3 py-1 rounded-full border border-white/10">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="font-rounded text-[9px] font-extrabold uppercase tracking-widest text-white/70 ml-1">
              3D Arcade
            </span>
          </div>

          {/* Big Center Title */}
          <h1 className="font-arcade text-5xl sm:text-7xl text-yellow-400 arcade-stroke-uno tracking-wider drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]">
            UNOVERSE!
          </h1>
        </motion.div>
      </div>

      {/* Bottom Side Loading Indicator (bottom-left, clean & compact) */}
      <div className="relative z-10 flex items-center justify-between w-full">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Mini Rotating Card/Spinner Icon */}
          <motion.div
            animate={reducedMotion ? {} : { rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-[3px] border-white/20 border-t-yellow-400 border-r-amber-400 flex items-center justify-center shrink-0 shadow-md"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
          </motion.div>

          {/* Status text with animated dots */}
          <div className="flex flex-col text-left">
            <div className="flex items-center font-arcade text-xl sm:text-2xl text-white tracking-wide drop-shadow-sm">
              <span>{message}</span>
              <span className="inline-flex gap-0.5 ml-1" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="w-1 h-1 rounded-full bg-yellow-300 inline-block"
                    animate={
                      reducedMotion
                        ? { opacity: [0.3, 1, 0.3] }
                        : { y: [0, -3, 0], opacity: [0.3, 1, 0.3] }
                    }
                    transition={{
                      repeat: Infinity,
                      duration: 0.9,
                      ease: 'easeInOut',
                      delay: dot * 0.18,
                    }}
                  />
                ))}
              </span>
            </div>

            {submessage && (
              <p className="font-rounded text-[11px] sm:text-xs text-sky-200/80 font-medium tracking-wide">
                {submessage}
              </p>
            )}
          </div>
        </div>

        {/* Small version stamp in bottom right */}
        <span className="font-rounded text-[10px] font-bold text-white/25 uppercase tracking-widest hidden sm:inline-block">
          Unoverse
        </span>
      </div>
    </div>
  );
};

export default UnoverseLoader;
