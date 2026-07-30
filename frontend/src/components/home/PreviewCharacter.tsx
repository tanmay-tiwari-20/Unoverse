'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getOutfit, outfitForName } from '../../lib/cosmetics/outfits';
import { buildMaterials, eyeMaterial } from '../table/shared/characterMaterials';

/**
 * ============================================================================
 *  PreviewCharacter — a STANDING full-body avatar for outfit preview.
 * ============================================================================
 *
 * PURELY VISUAL, and deliberately SELF-CONTAINED. This is the home/profile
 * "mannequin": a full-height character standing on the ground so a player can
 * inspect an outfit before wearing it. It shares exactly ONE thing with the
 * in-game seated characters — the outfit palette and the PBR materials derived
 * from it (`characterMaterials`) — so a skin previewed here reads identically at
 * the table.
 *
 * It shares NOTHING else on purpose: no seat math, no `HIP_Y`, no
 * `WebGLSeats`, no arena/`RoomEnvironment` coupling, no game store. It takes an
 * outfit key (or a name to derive one) plus a rotation, and renders. That keeps
 * the preview safe to restyle/repose without any risk to gameplay visuals.
 *
 * PLACEMENT — the group is anchored at the FEET (soles at local y = 0), so a
 * caller can drop it straight onto a floor/turntable at y = 0. `rotationY` is
 * owned by the caller (drag-to-spin, buttons, auto-spin, whatever); the idle
 * animation only ever adds a tiny sway *inside* that, so external rotation is
 * never fought over.
 *
 * PERFORMANCE — primitives only, one shared 5-material pool built from the
 * palette and disposed on unmount, no textures, no skinned meshes. The idle is a
 * handful of trig ops per frame and is fully skipped under reduced motion.
 */

// ---------------------------------------------------------------------------
//  Standing proportions (local space; the group's origin is the GROUND).
//  Front is local +Z (eyes face +Z), matching the seated character so both are
//  authored with the same handedness.
// ---------------------------------------------------------------------------
/** Pelvis centre height. Legs run down from here; the upper body is built up. */
const HIP_H = 0.86;
/** Torso group origin — slightly above the pelvis, as on the seated character. */
const TORSO_Y = HIP_H + 0.08;
/** Horizontal leg spacing (matches the seated character's stance width). */
const LEG_X = 0.1;

export interface PreviewCharacterProps {
  /** Stored outfit key to preview. Unknown/null falls back via `getOutfit`. */
  outfitKey?: string | null;
  /**
   * Player name, used ONLY when no `outfitKey` is given: the same deterministic
   * neutral outfit the table would show for a profile-less player.
   */
  name?: string | null;
  /** Y-axis rotation in radians, fully owned by the caller. */
  rotationY?: number;
  /** Where to stand the character (its soles sit on this y). */
  position?: [number, number, number];
  /** Uniform scale, for fitting the preview camera. */
  scale?: number;
}

/**
 * A single standing character: upright torso, vertical legs, arms hanging at the
 * sides. Same chunky-but-natural read as the seated avatar, built independently.
 */
const PreviewCharacter: React.FC<PreviewCharacterProps> = ({
  outfitKey,
  name,
  rotationY = 0,
  position = [0, 0, 0],
  scale = 1,
}) => {
  const bodyRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  // Resolve the palette: an explicit key wins, otherwise derive a stable neutral
  // outfit from the name (both return module-shared `Outfit` objects).
  const outfit = useMemo(
    () => (outfitKey ? getOutfit(outfitKey) : outfitForName(name)),
    [outfitKey, name],
  );

  // Shared materials, built once per palette and disposed on unmount/change.
  const mats = useMemo(() => buildMaterials(outfit), [outfit]);
  useEffect(() => () => mats.dispose(), [mats]);

  const prefersReduced = useReducedMotion();

  // ---- Standing idle: breathe, a slow weight shift, a gentle look-around ----
  useFrame((state) => {
    const body = bodyRef.current;
    if (!body) return;

    if (prefersReduced) {
      // Hold a clean, symmetrical resting pose.
      body.position.y = 0;
      body.rotation.set(0, 0, 0);
      if (torsoRef.current) {
        torsoRef.current.scale.set(1, 1, 1);
        torsoRef.current.rotation.set(0, 0, 0);
      }
      if (headRef.current) headRef.current.rotation.set(0, 0, 0);
      return;
    }

    const t = state.clock.getElapsedTime();

    // Breathing — a small rise/fall through the whole body + a torso swell.
    const breath = Math.sin(t * 1.3);
    body.position.y = breath * 0.008;
    // Weight shift — a lazy hip sway, the standing tell that reads as "alive".
    const sway = Math.sin(t * 0.45);
    body.rotation.z = sway * 0.012;
    body.rotation.y = Math.sin(t * 0.33) * 0.03;

    if (torsoRef.current) {
      torsoRef.current.scale.set(1, 1 + breath * 0.012, 1);
      torsoRef.current.rotation.z = -sway * 0.02;
      torsoRef.current.rotation.x = Math.sin(t * 0.6) * 0.015;
    }

    // Head — a soft glance around, countering the torso sway slightly.
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.55) * 0.18 - sway * 0.04;
      headRef.current.rotation.x = Math.sin(t * 0.4) * 0.05;
    }
  });

  return (
    // Outer group: caller-owned placement + Y rotation (never touched by the idle).
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Inner group: everything the idle animation is allowed to move. */}
      <group ref={bodyRef}>
        {/* ---- Feet: soles flat on the ground (y = 0) ---- */}
        {[-LEG_X, LEG_X].map((x) => (
          <mesh key={`shoe${x}`} position={[x, 0.035, 0.02]} castShadow receiveShadow material={mats.accent}>
            <boxGeometry args={[0.11, 0.07, 0.2]} />
          </mesh>
        ))}
        {/* Shins — vertical, ankle up to knee */}
        {[-LEG_X, LEG_X].map((x) => (
          <mesh key={`shin${x}`} position={[x, 0.28, 0]} castShadow material={mats.pants}>
            <capsuleGeometry args={[0.06, 0.28, 4, 10]} />
          </mesh>
        ))}
        {/* Thighs — vertical, knee up to the hip */}
        {[-LEG_X, LEG_X].map((x) => (
          <mesh key={`thigh${x}`} position={[x, 0.68, 0]} castShadow material={mats.pants}>
            <capsuleGeometry args={[0.075, 0.26, 4, 10]} />
          </mesh>
        ))}
        {/* Pelvis */}
        <mesh position={[0, HIP_H - 0.02, 0.01]} castShadow receiveShadow material={mats.pants}>
          <boxGeometry args={[0.34, 0.2, 0.26]} />
        </mesh>

        {/* ---- Upper body (breathes + sways as a unit) ---- */}
        <group ref={torsoRef} position={[0, TORSO_Y, 0]}>
          {/* Torso / jacket — tapered for a shoulder-heavy silhouette */}
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow material={mats.jacket}>
            <capsuleGeometry args={[0.19, 0.26, 6, 14]} />
          </mesh>
          {/* Chest accent panel / zipper strip (glows for neon skins) */}
          <mesh position={[0, 0.24, 0.16]} castShadow material={mats.accent}>
            <boxGeometry args={[0.06, 0.34, 0.03]} />
          </mesh>
          {/* Collar */}
          <mesh position={[0, 0.4, 0.02]} castShadow material={mats.accent}>
            <cylinderGeometry args={[0.1, 0.12, 0.08, 12]} />
          </mesh>

          {/* Shoulders */}
          {[-0.21, 0.21].map((x) => (
            <mesh key={`shoulder${x}`} position={[x, 0.34, 0]} castShadow material={mats.jacket}>
              <sphereGeometry args={[0.09, 12, 12]} />
            </mesh>
          ))}
          {/* Upper arms — hanging straight down at the sides, flared out slightly */}
          {[-0.24, 0.24].map((x) => (
            <mesh
              key={`uarm${x}`}
              position={[x, 0.19, 0]}
              rotation={[0, 0, x < 0 ? 0.09 : -0.09]}
              castShadow
              material={mats.jacket}
            >
              <capsuleGeometry args={[0.06, 0.2, 4, 10]} />
            </mesh>
          ))}
          {/* Forearms — continue the line down past the hips */}
          {[-0.255, 0.255].map((x) => (
            <mesh
              key={`farm${x}`}
              position={[x, -0.03, 0.01]}
              rotation={[0, 0, x < 0 ? 0.05 : -0.05]}
              castShadow
              material={mats.jacket}
            >
              <capsuleGeometry args={[0.052, 0.2, 4, 10]} />
            </mesh>
          ))}
          {/* Hands — resting at the sides */}
          {[-0.265, 0.265].map((x) => (
            <mesh key={`hand${x}`} position={[x, -0.17, 0.01]} castShadow material={mats.skin}>
              <sphereGeometry args={[0.055, 10, 10]} />
            </mesh>
          ))}

          {/* Neck */}
          <mesh position={[0, 0.46, 0]} castShadow material={mats.skin}>
            <cylinderGeometry args={[0.05, 0.06, 0.1, 12]} />
          </mesh>

          {/* ---- Head (turns independently for the look-around idle) ---- */}
          <group ref={headRef} position={[0, 0.56, 0]}>
            <mesh castShadow material={mats.skin}>
              <sphereGeometry args={[0.12, 20, 20]} />
            </mesh>
            {/* Hair cap — back/top of the head */}
            <mesh position={[0, 0.04, -0.02]} scale={[1.06, 0.9, 1.06]} castShadow material={mats.hair}>
              <sphereGeometry args={[0.12, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            </mesh>
            {/* Simple, expressive-but-minimal face: two eyes on the +Z front */}
            {[-0.045, 0.045].map((x) => (
              <mesh key={`eye${x}`} position={[x, 0.01, 0.108]} material={eyeMaterial}>
                <sphereGeometry args={[0.018, 8, 8]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
};

export default PreviewCharacter;
