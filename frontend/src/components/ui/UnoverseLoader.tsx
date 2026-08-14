'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface UnoverseLoaderProps {
  /** Main message shown (e.g. "LOADING...", "LINKING...", "ENTERING ARENA...") */
  message?: string;
  /** Secondary subtitle or status (e.g. "Connecting to game server...", "Loading Volcano 3D Table...") */
  submessage?: string;
  /** Optional arena name or context */
  arenaName?: string;
  /** Fullscreen fixed overlay (default: true) or fit parent container */
  fullScreen?: boolean;
}

/**
 * Visual Fan Card Component
 */
const FanCard: React.FC<{
  color: 'red' | 'yellow' | 'wild' | 'blue' | 'green';
  rotation: number;
  translateY: number;
  symbol: React.ReactNode;
  cornerSymbol: string;
  isCenter?: boolean;
}> = ({ color, rotation, translateY, symbol, cornerSymbol, isCenter }) => {
  const bgStyles = {
    red: 'bg-gradient-to-b from-[#ff3333] via-[#e52521] to-[#b31412]',
    yellow: 'bg-gradient-to-b from-[#ffd200] via-[#fbb034] to-[#d98200]',
    wild: 'bg-gradient-to-b from-[#2a2a32] via-[#1a1a20] to-[#0f0f14]',
    blue: 'bg-gradient-to-b from-[#0099ff] via-[#0072bc] to-[#004e82]',
    green: 'bg-gradient-to-b from-[#00d668] via-[#00a651] to-[#007036]',
  };

  return (
    <div
      className={`relative rounded-lg sm:rounded-xl md:rounded-2xl border-[1.5px] sm:border-[2.5px] md:border-[3.5px] border-white shadow-[0_8px_18px_rgba(0,0,0,0.65),0_2px_4px_rgba(0,0,0,0.4)] ${bgStyles[color]} w-12 sm:w-18 md:w-22 lg:w-24 short:w-10 sm:short:w-12 aspect-[2/3] shrink-0 select-none flex flex-col justify-between p-1 sm:p-1.5 short:p-0.5 overflow-hidden transition-transform duration-300`}
      style={{
        transform: `rotate(${rotation}deg) translateY(${translateY}px)${isCenter ? ' scale(1.08)' : ''}`,
        transformOrigin: 'bottom center',
        boxShadow: isCenter
          ? '0 0 30px rgba(255, 170, 0, 0.45), 0 12px 25px rgba(0,0,0,0.8)'
          : '0 8px 18px rgba(0,0,0,0.6)',
      }}
    >
      {/* Glossy top-left highlight */}
      <div className="absolute -top-4 -left-4 sm:-top-6 sm:-left-6 w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full blur-sm sm:blur-md pointer-events-none" />

      {/* Top-left corner symbol */}
      <div className="font-arcade text-[8px] sm:text-xs md:text-sm short:text-[7px] font-black text-white leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] tracking-tight">
        {cornerSymbol}
      </div>

      {/* Center symbol / oval */}
      <div className="my-auto mx-auto flex items-center justify-center w-full">
        {color === 'wild' ? (
          /* Wild Card 4-Color Ring with White 'W' */
          <div className="relative w-7 h-7 sm:w-11 sm:h-11 md:w-13 md:h-13 short:w-6 short:h-6 rounded-full p-[1.5px] sm:p-[2px] shadow-inner flex items-center justify-center overflow-hidden">
            {/* 4-Color Segmented Background */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
              <span className="bg-[#e52521]" />
              <span className="bg-[#0072bc]" />
              <span className="bg-[#ffd200]" />
              <span className="bg-[#00a651]" />
            </div>
            {/* Dark Inner Core */}
            <div className="relative z-10 w-full h-full rounded-full bg-black/60 border border-white/40 flex items-center justify-center">
              <span className="font-arcade text-xs sm:text-xl md:text-2xl short:text-[10px] font-black italic text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                W
              </span>
            </div>
          </div>
        ) : (
          /* Standard White Oval with Symbol */
          <div
            className="w-7 h-7 sm:w-11 sm:h-11 md:w-13 md:h-13 short:w-6 short:h-6 rounded-full bg-white/95 border border-black/10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)] flex items-center justify-center"
            style={{ transform: 'rotate(-15deg)' }}
          >
            <div className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {symbol}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-right corner symbol (upside down) */}
      <div className="font-arcade text-[8px] sm:text-xs md:text-sm short:text-[7px] font-black text-white leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] self-end rotate-180 tracking-tight">
        {cornerSymbol}
      </div>
    </div>
  );
};

/**
 * Premium Unoverse Loading Screen
 *
 * Implements:
 * - Chunky golden/yellow "UNOVERSE!" 3D title with red/orange outline.
 * - Warm dark brown/black game backdrop with subtle arcade texture & ambient glow.
 * - 5-card fan with Red +2, Yellow Reverse, Center Wild 'W', Blue Skip, Green +4.
 * - Floating/tilting card animation.
 * - Glowing capsule progress indicator with animated dots.
 * - Dynamic status submessage.
 * - Fully responsive across mobile portrait, mobile landscape, desktop, and embedded viewports.
 */
export const UnoverseLoader: React.FC<UnoverseLoaderProps> = ({
  message = 'LOADING',
  submessage,
  arenaName,
  fullScreen = true,
}) => {
  const reducedMotion = useReducedMotion();

  // Normalize message to clean uppercase without trailing dots for the central title
  const cleanMessage = message.replace(/\.+$/, '').trim().toUpperCase();

  return (
    <div
      className={`${
        fullScreen ? 'fixed inset-0 z-[9999]' : 'absolute inset-0 z-50'
      } flex flex-col justify-between items-center bg-[#0d0705] text-amber-50 select-none overflow-hidden overscroll-none w-full h-full min-h-screen-dvh`}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 0.5rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
        paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
        paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
      }}
      role="status"
      aria-live="polite"
      aria-label={`${message}${submessage ? `: ${submessage}` : ''}`}
      suppressHydrationWarning
    >
      {/* 1. Deep Warm Arcade Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, #2a140a 0%, #170a05 45%, #0a0402 100%)',
        }}
        aria-hidden="true"
      />

      {/* Subtle Warm Diamond / Dot Grid Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255, 180, 100, 0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden="true"
      />

      {/* Subtle Center Spotlight behind Cards */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] sm:w-[420px] md:w-[500px] h-[280px] sm:h-[420px] md:h-[500px] bg-gradient-to-b from-amber-500/20 via-orange-600/10 to-transparent rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Top Bar: Optional Arena Context Badge */}
      <div className="relative z-10 w-full flex justify-end min-h-[22px] sm:min-h-[30px] short:min-h-[18px]">
        {arenaName && (
          <span className="font-rounded text-[9px] sm:text-xs short:text-[8px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 border border-amber-500/30 px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-full backdrop-blur-md shadow-lg">
            {arenaName}
          </span>
        )}
      </div>

      {/* Center Stage: Title + Card Fan */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto gap-2 sm:gap-4 md:gap-6 short:gap-1 max-w-lg w-full shrink-0 min-h-0">
        {/* UNOVERSE! 3D Cartoon Title */}
        <motion.div
          animate={reducedMotion ? {} : { y: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
          className="flex flex-col items-center text-center px-2"
        >
          <h1
            className="font-arcade text-3xl sm:text-6xl md:text-7xl lg:text-8xl short:text-2xl sm:short:text-3xl tracking-wider text-yellow-400 select-none leading-none"
            style={{
              WebkitTextStroke: 'clamp(2px, 0.4vw + 1px, 4px) #b81414',
              paintOrder: 'stroke fill',
              textShadow:
                '0 3px 0 #730a0a, 0 5px 0 #4a0505, 0 10px 20px rgba(0,0,0,0.85)',
            }}
          >
            UNOVERSE!
          </h1>
        </motion.div>

        {/* Fanned 5 Cards in Arc */}
        <motion.div
          animate={
            reducedMotion
              ? {}
              : {
                  y: [-3, 3, -3],
                  rotate: [-0.5, 0.5, -0.5],
                }
          }
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          className="relative flex items-center justify-center pt-1 pb-3 sm:pb-5 short:py-0.5 px-3"
        >
          {/* Floor Shadow beneath Cards */}
          <div
            className="absolute bottom-1 sm:bottom-2 w-36 sm:w-56 md:w-64 h-4 sm:h-6 bg-black/70 rounded-full blur-md pointer-events-none"
            aria-hidden="true"
          />

          {/* Cards Container with Overlap */}
          <div className="flex items-end justify-center -space-x-3 sm:-space-x-4 md:-space-x-5 short:-space-x-2.5">
            {/* Card 1: Red +2 */}
            <FanCard
              color="red"
              rotation={-18}
              translateY={6}
              cornerSymbol="+2"
              symbol={
                <span className="font-arcade text-[10px] sm:text-sm md:text-base short:text-[8px] font-black text-[#e52521]">
                  +2
                </span>
              }
            />

            {/* Card 2: Yellow Reverse */}
            <FanCard
              color="yellow"
              rotation={-9}
              translateY={1.5}
              cornerSymbol="⇄"
              symbol={
                <span className="font-arcade text-[10px] sm:text-sm md:text-base short:text-[8px] font-black text-[#fbb034]">
                  ⇄
                </span>
              }
            />

            {/* Card 3: Center Wild 'W' */}
            <FanCard
              color="wild"
              rotation={0}
              translateY={-6}
              cornerSymbol="W"
              isCenter={true}
              symbol={null}
            />

            {/* Card 4: Blue Skip */}
            <FanCard
              color="blue"
              rotation={9}
              translateY={1.5}
              cornerSymbol="⊘"
              symbol={
                <span className="font-arcade text-[10px] sm:text-sm md:text-base short:text-[8px] font-black text-[#0072bc]">
                  ⊘
                </span>
              }
            />

            {/* Card 5: Green +4 */}
            <FanCard
              color="green"
              rotation={18}
              translateY={6}
              cornerSymbol="+4"
              symbol={
                <span className="font-arcade text-[10px] sm:text-sm md:text-base short:text-[8px] font-black text-[#00a651]">
                  +4
                </span>
              }
            />
          </div>
        </motion.div>
      </div>

      {/* Bottom Area: Animated Status + Glowing Capsule Bar */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 sm:gap-2.5 md:gap-3 short:gap-1 w-full max-w-xs sm:max-w-md pb-1 sm:pb-3 short:pb-0.5">
        {/* Animated Dots + Clean Message */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-amber-200/90 font-arcade text-xs sm:text-base md:text-lg short:text-[10px] tracking-[0.2em] sm:tracking-[0.25em]">
          {/* Leading Dots */}
          <span className="inline-flex gap-1 sm:gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((dot) => (
              <motion.span
                key={`left-dot-${dot}`}
                className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] inline-block"
                animate={
                  reducedMotion
                    ? { opacity: [0.3, 1, 0.3] }
                    : { scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }
                }
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  ease: 'easeInOut',
                  delay: dot * 0.15,
                }}
              />
            ))}
          </span>

          <span className="font-extrabold px-1 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {cleanMessage}
          </span>

          {/* Trailing Dots */}
          <span className="inline-flex gap-1 sm:gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((dot) => (
              <motion.span
                key={`right-dot-${dot}`}
                className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] inline-block"
                animate={
                  reducedMotion
                    ? { opacity: [0.3, 1, 0.3] }
                    : { scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }
                }
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  ease: 'easeInOut',
                  delay: (3 - dot) * 0.15,
                }}
              />
            ))}
          </span>
        </div>

        {/* Glowing Pill / Capsule Progress Bar */}
        <div className="relative w-full max-w-[200px] sm:max-w-[300px] md:max-w-[340px] short:max-w-[180px] h-3 sm:h-4.5 md:h-5 short:h-2.5 rounded-full bg-[#120703] border-2 border-amber-800/60 p-[1.5px] sm:p-[2px] shadow-[inset_0_2px_5px_rgba(0,0,0,0.9),0_0_15px_rgba(245,158,11,0.25)] overflow-hidden">
          {/* Inner Glowing Gradient Bar */}
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#e52521] via-[#fbb034] to-[#22c55e] relative shadow-[0_0_12px_rgba(251,191,36,0.6)]"
            animate={
              reducedMotion
                ? { width: '85%' }
                : {
                    width: ['30%', '85%', '95%', '40%'],
                    filter: [
                      'brightness(1)',
                      'brightness(1.25)',
                      'brightness(1.1)',
                      'brightness(1)',
                    ],
                  }
            }
            transition={{
              repeat: Infinity,
              duration: 2.8,
              ease: 'easeInOut',
            }}
          >
            {/* Glowing Leading Head Light */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 sm:w-4 h-full rounded-full bg-white/80 blur-[1.5px] sm:blur-[2px]" />

            {/* Shimmer Highlight */}
            {!reducedMotion && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent -skew-x-12"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
              />
            )}
          </motion.div>
        </div>

        {/* Dynamic Submessage */}
        {submessage && (
          <p className="font-rounded text-[10px] sm:text-xs short:text-[9px] text-amber-200/75 font-semibold tracking-wide text-center drop-shadow-sm max-w-xs truncate">
            {submessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default UnoverseLoader;
