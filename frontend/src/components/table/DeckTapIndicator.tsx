'use client';

import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ChevronDown, Hand, MousePointerClick } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface DeckTapIndicatorProps {
  /** Height of the visible card stack, so the ring sits just above the top card. */
  stackHeight: number;
  /** True on touch-primary devices — drives the standing tap cue and the wording. */
  isTouch: boolean;
  /** True when it is the local player's turn and a draw is currently valid. */
  canDraw: boolean;
  /** True when a draw is the ONLY legal continuation (no playable card in hand). */
  mustDraw: boolean;
}

/** Same yellow as the hover ring and the playable-card highlight, so across the
 *  whole table "yellow" consistently means "this is the thing you can act on". */
const RING_COLOR = '#fde047';

/**
 * The "you have no moves" deck highlight: the same base ring as the hover state,
 * brightened and breathing, wrapped in a soft additive halo. One useFrame drives
 * both meshes, and it holds a static bright pose under reduced motion.
 */
const DrawRingPulse: React.FC<{ y: number }> = ({ y }) => {
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const prefersReduced = useReducedMotion();

  useFrame((state) => {
    if (prefersReduced) {
      // Hold a clean resting pose — visible, just not moving.
      if (coreMat.current) coreMat.current.opacity = 1;
      if (halo.current) halo.current.scale.set(1, 1, 1);
      if (haloMat.current) haloMat.current.opacity = 0.22;
      return;
    }
    // 0..1 breathing wave on a ~2.6s period: slow enough to read as "alive and
    // waiting for you", never as a flashing alert.
    const pulse = (Math.sin(state.clock.getElapsedTime() * 2.4) + 1) / 2;
    if (coreMat.current) coreMat.current.opacity = 0.62 + pulse * 0.38;
    if (halo.current) {
      const s = 1 + pulse * 0.14;
      halo.current.scale.set(s, s, s);
    }
    // Halo fades as it expands, so the glow reads as light spreading outward.
    if (haloMat.current) haloMat.current.opacity = 0.3 - pulse * 0.2;
  });

  return (
    <group position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Soft outer halo — additive so it reads as light on the table felt. */}
      <mesh ref={halo}>
        <ringGeometry args={[0.112, 0.16, 48]} />
        <meshBasicMaterial
          ref={haloMat}
          color={RING_COLOR}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Core ring — identical geometry to the desktop hover ring. */}
      <mesh>
        <ringGeometry args={[0.085, 0.11, 40]} />
        <meshBasicMaterial
          ref={coreMat}
          color={RING_COLOR}
          transparent
          opacity={1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

/**
 * Draw-deck affordance. Mirrors the DrawPileHitbox hover ring's look (same
 * yellow, same base placement) and adds a chip when tapping/clicking the deck is
 * the expected next move.
 *
 * Three states, no new gameplay — purely a reflection of existing state:
 *  - mustDraw (any device) → pulsing ring + halo + "no moves, click the deck"
 *    chip with a chevron aimed at the pile. This is the one case worth
 *    interrupting for: the player is out of legal plays and, without a cue,
 *    reads a stuck game rather than "draw to continue".
 *  - canDraw, touch only    → bright static ring + "Tap to draw" chip. Touch
 *    users never hover, so discoverability needs a standing cue.
 *  - otherwise, touch only  → dim static ring (the deck is there, but not yours
 *    to draw). Desktop renders nothing: the hover ring already covers it, and a
 *    standing badge every turn would just be noise.
 *
 * Animations are gated by useReducedMotion (and the global reduced-motion CSS
 * rule covers the chip's classes), and nothing sits over the cards — the ring
 * hugs the pile base and the chip floats above it.
 */
const DeckTapIndicatorInner: React.FC<DeckTapIndicatorProps> = ({
  stackHeight,
  isTouch,
  canDraw,
  mustDraw,
}) => {
  const reducedMotion = useReducedMotion();

  // Desktop only needs a cue when the player is actually out of moves.
  if (!isTouch && !mustDraw) return null;

  const ringY = stackHeight + 0.004;
  const showChip = mustDraw || (isTouch && canDraw);
  const label = mustDraw
    ? isTouch
      ? 'No moves — tap the deck'
      : 'No moves — click the deck'
    : 'Tap to draw';

  return (
    <group>
      {mustDraw ? (
        <DrawRingPulse y={ringY} />
      ) : (
        /* Base ring — matches the desktop hover ring so the deck reads the same
           way across input types. */
        <mesh position={[0, ringY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.085, 0.11, 40]} />
          <meshBasicMaterial
            color={canDraw ? RING_COLOR : '#94a3b8'}
            transparent
            opacity={canDraw ? 0.9 : 0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Hint chip — floats above the pile only while the tap is actionable, so
          it's a call to act rather than permanent noise. The gentle bob
          (deck-hint-pulse) and the ripple behind it are pure CSS, auto-disabled
          by the global reduced-motion rule. */}
      {showChip && (
        <Html position={[0, stackHeight + 0.14, 0]} center zIndexRange={[95, 0]}>
          <div
            className={`pointer-events-none select-none flex flex-col items-center ${reducedMotion ? '' : 'deck-hint-pulse'}`}
          >
            <div className="relative flex items-center justify-center">
              {!reducedMotion && (
                <span
                  className="deck-hint-ripple absolute inset-0 rounded-full bg-yellow-300/50"
                  aria-hidden="true"
                />
              )}
              <div className="relative whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-400/95 text-black font-rounded font-extrabold text-[11px] shadow-lg border border-yellow-200/60">
                {mustDraw && !isTouch ? (
                  <MousePointerClick size={12} strokeWidth={2.75} aria-hidden="true" />
                ) : (
                  <Hand size={12} strokeWidth={2.75} aria-hidden="true" />
                )}
                {/* Announced once when the player runs out of moves, so the cue
                    isn't purely visual. */}
                <span role={mustDraw ? 'status' : undefined}>{label}</span>
              </div>
            </div>

            {/* Chevron aims the eye down at the pile itself — the chip says what
                to do, this says where. */}
            {mustDraw && (
              <ChevronDown
                size={14}
                strokeWidth={3}
                className="-mt-0.5 text-yellow-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                aria-hidden="true"
              />
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

export const DeckTapIndicator = React.memo(DeckTapIndicatorInner);
export default DeckTapIndicator;
