'use client';

import React from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { Hand } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface DeckTapIndicatorProps {
  /** Height of the visible card stack, so the ring sits just above the top card. */
  stackHeight: number;
  /** True on touch-primary devices — the whole affordance only renders for touch. */
  isTouch: boolean;
  /** True when it is the local player's turn and a draw is currently valid. */
  canDraw: boolean;
}

/**
 * Touch-only draw-deck affordance. Desktop users get the hover ring from
 * DrawPileHitbox; touch users never hover, so discoverability needs a standing
 * cue. This mirrors the hover ring's look (same yellow, same base placement) and
 * adds a small "Tap to draw" chip.
 *
 * Two states, no new gameplay — purely reflects the existing `canDraw`:
 *  - can draw  → bright ring + gentle ripple + prominent chip (act now)
 *  - otherwise → dim static ring, no chip (deck is there but not yours to draw)
 *
 * Animations are gated by useReducedMotion (and the global reduced-motion CSS
 * rule covers the chip's Tailwind pulse), and nothing sits over the cards — the
 * ring hugs the pile base and the chip floats to the side.
 */
const DeckTapIndicatorInner: React.FC<DeckTapIndicatorProps> = ({ stackHeight, isTouch, canDraw }) => {
  const reducedMotion = useReducedMotion();

  if (!isTouch) return null;

  const ringY = stackHeight + 0.004;
  const ringColor = canDraw ? '#fde047' : '#94a3b8';
  const ringOpacity = canDraw ? 0.9 : 0.35;

  return (
    <group>
      {/* Base ring — matches the desktop hover ring so the deck reads the same
          way across input types. */}
      <mesh position={[0, ringY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.085, 0.11, 40]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={ringOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* "Tap to draw" chip — floats above the pile only when the tap is
          actionable, so it's a call to act rather than permanent noise. The
          gentle bob (deck-hint-pulse) and expanding ripple behind it are pure
          CSS, auto-disabled by the global reduced-motion rule. */}
      {canDraw && (
        <Html position={[0, stackHeight + 0.14, 0]} center zIndexRange={[95, 0]}>
          <div className="pointer-events-none select-none relative flex items-center justify-center">
            {!reducedMotion && (
              <span
                className="deck-hint-ripple absolute inset-0 rounded-full bg-yellow-300/50"
                aria-hidden="true"
              />
            )}
            <div
              className={`relative whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-400/95 text-black font-rounded font-extrabold text-[11px] shadow-lg border border-yellow-200/60 ${reducedMotion ? '' : 'deck-hint-pulse'}`}
            >
              <Hand size={12} strokeWidth={2.75} aria-hidden="true" />
              <span>Tap to draw</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export const DeckTapIndicator = React.memo(DeckTapIndicatorInner);
export default DeckTapIndicator;
