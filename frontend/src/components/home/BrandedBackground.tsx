'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * ============================================================================
 *  BrandedBackground — the shared Unoverse backdrop for 2D surfaces.
 * ============================================================================
 *
 * PURELY DECORATIVE. An absolutely-positioned, `aria-hidden`,
 * `pointer-events-none` stack of layers that gives any home/profile surface the
 * house look: the four classic UNO colour washes over a dark table, a polka-dot
 * texture, and a vignette that keeps whatever sits on top legible.
 *
 * DELIBERATELY INDEPENDENT. It knows nothing about `PreviewStage`,
 * `PreviewCharacter`, `LandingScene`, the arena/quality contexts or any store —
 * it draws no 3D, mounts no `Canvas`, and reads no game state. Drop it behind
 * anything, on any page, with no providers in scope.
 *
 * NOT A NEW PALETTE. The washes and dots are the existing `.arcade-bg` and
 * `.arcade-dots` utilities from `globals.css`, so the brand colours keep living
 * in one place and this component only composes and frames them.
 *
 * MOTION. `animated` adds a very slow parallax drift to the colour wash — one
 * transform on one layer, nothing per-frame. It is skipped entirely under
 * `prefers-reduced-motion`, where the backdrop renders once and then holds still.
 */

/** Per-variant tuning: how loud the wash is, and how hard the vignette pulls in. */
const VARIANTS = {
  /** Full-bleed page backdrop — the landing look, washes at full strength. */
  page: {
    base: '#120c2e',
    washOpacity: 0.5,
    dotOpacity: 1,
    vignette: 'radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(5, 3, 16, 0.72) 100%)',
  },
  /** Inside a card or picker — quieter, so the panel's own content stays loudest. */
  panel: {
    base: '#150e33',
    washOpacity: 0.32,
    dotOpacity: 0.6,
    vignette: 'radial-gradient(ellipse at 50% 40%, transparent 20%, rgba(5, 3, 16, 0.55) 100%)',
  },
} as const;

export interface BrandedBackgroundProps {
  /** How loud the backdrop is: full-page, or quieter behind panel content. */
  variant?: keyof typeof VARIANTS;
  /** Slow parallax drift on the colour wash. Ignored under reduced motion. */
  animated?: boolean;
  /** Extra wrapper classes — mainly `rounded-*` when used inside a panel. */
  className?: string;
}

/**
 * The house backdrop. Fills its nearest positioned ancestor, sits behind
 * everything in that box, and never takes a pointer event or a tab stop.
 */
const BrandedBackground: React.FC<BrandedBackgroundProps> = ({
  variant = 'page',
  animated = true,
  className,
}) => {
  const prefersReduced = useReducedMotion();
  const { base, washOpacity, dotOpacity, vignette } = VARIANTS[variant];
  const drifting = animated && !prefersReduced;

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className ?? ''}`}
      style={{ backgroundColor: base }}
    >
      {/*
        Colour wash — the shared `.arcade-bg` gradients. Inset NEGATIVELY so the
        layer is larger than the box it fills: the drift can then translate it
        without ever exposing an uncovered edge. `mix-blend-screen` keeps the
        washes additive over the base so they read as light, not as paint.
      */}
      <motion.div
        className="absolute -inset-[12%] arcade-bg mix-blend-screen"
        style={{ opacity: washOpacity }}
        // One transform on one layer, driven by the compositor — not a per-frame
        // React update. Holds still entirely when `drifting` is false.
        animate={drifting ? { x: ['-2%', '2%', '-2%'], y: ['1.5%', '-1.5%', '1.5%'] } : undefined}
        transition={
          drifting
            ? { duration: 38, ease: 'easeInOut', repeat: Infinity, repeatType: 'loop' }
            : undefined
        }
      />

      {/* Polka-dot texture — static, so the pattern never crawls against the wash. */}
      <div className="absolute inset-0 arcade-dots" style={{ opacity: dotOpacity }} />

      {/* Vignette — darkens the edges so foreground text and controls keep their
          contrast wherever the washes happen to be brightest. */}
      <div className="absolute inset-0" style={{ background: vignette }} />
    </div>
  );
};

export default BrandedBackground;
