'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getOutfit, outfitForName } from '../../lib/cosmetics/outfits';
import { buildMaterials } from '../table/shared/characterMaterials';


import { CharacterHead3D } from '../table/CharacterHead3D';

const HIP_H = 0.86;
const TORSO_Y = HIP_H + 0.08;
const LEG_X = 0.1;

export interface PreviewCharacterProps {
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
            <CharacterHead3D outfit={outfit} mats={mats} />
          </group>
        </group>
      </group>
    </group>
  );
};

export default PreviewCharacter;
