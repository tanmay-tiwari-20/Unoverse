'use client';

import React, { useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import { getSeatRingRadii } from '../../utils/tableLayout';
import { getLayoutSeatCount } from '../../utils/capacity';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getOutfit, outfitForName, type Outfit } from '../../lib/cosmetics/outfits';
import { buildMaterials } from './shared/characterMaterials';
import { CharacterHead3D } from './CharacterHead3D';

/**
 * ============================================================================
 *  WebGLSeats — stylized seated player characters around the table.
 * ============================================================================
 *
 * PURELY VISUAL. This module renders one stylized human character per REMOTE
 * occupant (the local player is skipped — they are in first person). It reads
 * the same game store as before and uses the IDENTICAL seat-placement math
 * (relativeIndex → angle, elliptical radii) so camera framing, seat order and
 * turn indication are byte-for-byte unchanged. Nothing here touches gameplay,
 * networking, input, or the camera.
 *
 * The character's look is driven by a cosmetic OUTFIT palette (see
 * `lib/cosmetics/outfits.ts`). A player's stored `outfit` key resolves to a PBR
 * material palette; players with no outfit (guests/bots) get a deterministic
 * neutral outfit derived from their name so a table reads as varied but stable.
 *
 * PERFORMANCE
 *  - Geometry is built from a small pool of primitives; per-character MATERIALS
 *    are created once from the palette (5 shared materials) and disposed on
 *    unmount, so a full 6-seat table is ~30 materials, not hundreds.
 *  - Faces are simple. No skinned meshes, no morph targets, no texture loads —
 *    all colour/PBR is numeric, so there is nothing to stream and nothing to GC
 *    beyond the shared materials.
 *  - Idle animation is a couple of trig ops per frame on the group/head only,
 *    and is fully skipped under prefers-reduced-motion.
 */

// ---------------------------------------------------------------------------
//  Seated proportions (local space; group is anchored at hip height).
//  The character faces the table centre along LOCAL +Z (see rotation note in
//  WebGLSeats), so limbs that reach "toward the cards" extend along +Z.
// ---------------------------------------------------------------------------
const HIP_Y = 0.44; // group anchor height ≈ chair seat surface

interface PlayerCharacterProps {
  angle: number;
  rX: number;
  rZ: number;
  isActiveTurn: boolean;
  outfit: Outfit;
}

/**
 * A single stylized, seated human character. Proportions are chunky-but-natural
 * (a "polished multiplayer avatar" read), with a clear silhouette from every
 * angle and hands resting forward toward the table.
 *
 * MEMOIZED (perf): wrapped in `React.memo` with the default shallow prop
 * comparison. Its props are a seat position (`angle/rX/rZ`), a turn flag, and a
 * MODULE-STABLE outfit palette ref (`getOutfit`/`outfitForName` both return the
 * shared `BY_KEY[...]` object). So a seat only re-renders when its own placement,
 * turn state or outfit actually changes — a room swap that doesn't alter this
 * seat (chat, another player's ready flag, a house-rule edit, or a bot joining a
 * DIFFERENT seat) bails out here and never reconciles this character's meshes.
 * This is the load-bearing fix for the bot-add frame stall / black screen: only
 * genuinely-changed seats do any 3D work.
 */
const PlayerCharacter = React.memo<PlayerCharacterProps>(({ angle, rX, rZ, isActiveTurn, outfit }) => {
  const groupRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  // Elliptical seat position — radii are scaled upstream by player count.
  const position = useMemo(
    () => new THREE.Vector3(Math.sin(angle) * rX, HIP_Y, Math.cos(angle) * rZ),
    [angle, rX, rZ],
  );
  // Face the table centre (local +Z → world-toward-centre; unchanged from before).
  const rotation = useMemo(() => new THREE.Euler(0, angle + Math.PI, 0), [angle]);

  // Per-character shared materials, built once from the palette and disposed on
  // unmount (or when the outfit changes).
  const mats = useMemo(() => buildMaterials(outfit), [outfit]);
  useEffect(() => () => mats.dispose(), [mats]);

  const prefersReduced = useReducedMotion();

  // Idle animation — cheap, subtle, per-frame. Never distracting; fully skipped
  // under reduced motion. Same behavioural intent as the original silhouette:
  // breathing, a gentle look-around when idle, and a forward lean on your turn.
  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    if (prefersReduced) {
      // Hold a clean resting pose.
      g.position.y = position.y;
      return;
    }
    const t = state.clock.getElapsedTime();
    const phase = angle * 10; // per-seat phase offset so the table isn't in sync

    // Breathing — a tiny vertical bob + torso swell.
    const breath = Math.sin(t * 1.4 + phase);
    g.position.y = position.y + breath * 0.012;
    if (torsoRef.current) torsoRef.current.scale.set(1, 1 + breath * 0.01, 1);

    // Active-turn forward lean toward the table; idle players sit upright.
    const targetLean = isActiveTurn ? 0.16 : Math.sin(t * 0.5 + phase) * 0.02;
    if (torsoRef.current) {
      torsoRef.current.rotation.x = THREE.MathUtils.lerp(torsoRef.current.rotation.x, targetLean, 0.06);
    }

    // Head — look down at cards on your turn, gently glance around when idle.
    if (headRef.current) {
      if (isActiveTurn) {
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, 0, 0.1);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0.18, 0.1);
      } else {
        headRef.current.rotation.y = Math.sin(t * 0.7 + phase) * 0.16;
        headRef.current.rotation.x = Math.sin(t * 0.45 + phase) * 0.05;
      }
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* ---- Lower body: pelvis + thighs forward + shins down to the floor ---- */}
      <mesh position={[0, -0.02, 0.02]} castShadow receiveShadow material={mats.pants}>
        <boxGeometry args={[0.34, 0.2, 0.26]} />
      </mesh>
      {/* Thighs (seated: roughly horizontal, reaching toward the table) */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={`thigh${x}`} position={[x, -0.02, 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.pants}>
          <capsuleGeometry args={[0.075, 0.26, 4, 10]} />
        </mesh>
      ))}
      {/* Shins (drop from the knee to the floor) */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={`shin${x}`} position={[x, -0.24, 0.34]} rotation={[0.05, 0, 0]} castShadow material={mats.pants}>
          <capsuleGeometry args={[0.06, 0.28, 4, 10]} />
        </mesh>
      ))}
      {/* Shoes */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={`shoe${x}`} position={[x, -0.42, 0.42]} castShadow material={mats.accent}>
          <boxGeometry args={[0.11, 0.07, 0.2]} />
        </mesh>
      ))}

      {/* ---- Upper body (breathes + leans as a unit) ---- */}
      <group ref={torsoRef} position={[0, 0.08, 0]}>
        {/* Torso / jacket — tapered for a shoulder-heavy silhouette */}
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow material={mats.jacket}>
          <capsuleGeometry args={[0.19, 0.26, 6, 14]} />
        </mesh>
        {/* Chest accent panel / zipper strip (reads as a collar/trim, glows for neon skins) */}
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
        {/* Upper arms — down along the sides */}
        {[-0.24, 0.24].map((x) => (
          <mesh key={`uarm${x}`} position={[x, 0.2, 0.02]} rotation={[0.35, 0, x < 0 ? 0.12 : -0.12]} castShadow material={mats.jacket}>
            <capsuleGeometry args={[0.06, 0.2, 4, 10]} />
          </mesh>
        ))}
        {/* Forearms — reach forward toward the cards on the table */}
        {[-0.2, 0.2].map((x) => (
          <mesh key={`farm${x}`} position={[x, 0.12, 0.24]} rotation={[Math.PI / 2.1, 0, 0]} castShadow material={mats.jacket}>
            <capsuleGeometry args={[0.052, 0.2, 4, 10]} />
          </mesh>
        ))}
        {/* Hands — resting near the table edge */}
        {[-0.19, 0.19].map((x) => (
          <mesh key={`hand${x}`} position={[x, 0.11, 0.4]} castShadow material={mats.skin}>
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

      {/* Turn indicator — unchanged behaviour: a soft glow above the active player */}
      {isActiveTurn && (
        <pointLight position={[0, 1.25, 0]} intensity={0.7} distance={2.4} color="#10b981" />
      )}
    </group>
  );
});
PlayerCharacter.displayName = 'PlayerCharacter';

/** One resolved seat to render (local player excluded). */
interface SeatDescriptor {
  id: string;
  angle: number;
  rX: number;
  rZ: number;
  isActiveTurn: boolean;
  outfit: Outfit;
}

export const WebGLSeats: React.FC = () => {
  // NARROWED SUBSCRIPTION (perf): re-render ONLY when the seat-relevant slice of
  // the room actually changes. We subscribe to a cheap primitive SIGNATURE built
  // from just the fields that affect seating — each occupant's id/uid/name/outfit
  // and their order, the active-turn id, and the local player's identity. A room swap
  // that leaves these identical (a chat message, another player's ready flag, a
  // house-rule edit) yields the SAME string, so `Object.is` bails the re-render
  // and the entire 3D seat tree is left untouched. Every room broadcast mints
  // fresh player object refs, so a shallow-ref compare would never bail here — a
  // value signature is what actually narrows this.
  const seatSignature = useGameStore((state) => {
    const r = state.room;
    if (!r) return '';
    const roster = (r.players || [])
      .map((p) => `${p.id}~${p.uid}~${p.name}~${p.outfit ?? ''}`)
      .join('|');
    return `${roster}#${state.currentPlayerId ?? ''}#${state.player?.id ?? ''}#${state.player?.uid ?? ''}`;
  });

  // Defer the seat signature in lockstep with RoomEnvironment's deferred player
  // count. On a bot-add, the urgent render keeps the OLD signature (this seat
  // tree doesn't reconcile), and React schedules the new-seat mount as a low-
  // priority, interruptible pass — the same pass that resizes the table slab and
  // reframes the camera one frame behind. That coherence is the point: the slab
  // grows and the new character appears together, and neither lands in the
  // synchronous "add bot" click commit that would stall a frame and trip the
  // WebGL context-loss overlay (the black screen). When the signature is
  // unchanged, `deferredSignature === seatSignature`, so ordinary turn/outfit
  // updates stay urgent and nothing is delayed.
  const deferredSignature = useDeferredValue(seatSignature);

  // Derive the concrete seat descriptors only when that signature changes. The
  // full room is read non-reactively (getState) — the signature selector above is
  // what triggers the re-render, so this recompute is always fresh and never runs
  // on an unrelated room mutation. The seat math (local-player skip, relativeIndex
  // → angle, elliptical radii, outfit resolution) is byte-for-byte unchanged.
  const seats = useMemo<SeatDescriptor[] | null>(() => {
    const state = useGameStore.getState();
    const room = state.room;
    if (!room) return null;

    const player = state.player;
    const currentPlayerId = state.currentPlayerId;

    const playersList = room.players || [];
    const numPlayers = getLayoutSeatCount(room);
    const localPlayerIndex = playersList.findIndex((p) => p.id === player?.id);
    const safeLocalIndex = localPlayerIndex >= 0 ? localPlayerIndex : 0;

    // Seat-ring radii scale with the active player count (unchanged).
    const { rX, rZ } = getSeatRingRadii(numPlayers);

    const out: SeatDescriptor[] = [];
    playersList.forEach((occupant, idx) => {
      // Skip the local player (first person). Matched on the stable seat uid,
      // which survives socket reconnects like the name did — and, unlike the
      // name, cannot collide with an opponent who chose the same one.
      if (occupant.uid === player?.uid) return;

      // Seat angle — local player anchored at angle 0 (unchanged math).
      const relativeIndex = (idx - safeLocalIndex + numPlayers) % numPlayers;
      const angle = ((Math.PI * 2) / numPlayers) * relativeIndex;

      const isActiveTurn = occupant.id === currentPlayerId;

      const outfit = occupant.outfit
        ? getOutfit(occupant.outfit)
        : occupant.avatar
        ? getOutfit(occupant.avatar)
        : outfitForName(occupant.name);

      out.push({ id: occupant.id, angle, rX, rZ, isActiveTurn, outfit });
    });
    return out;
    // getState() is a stable store method; `deferredSignature` is the true
    // dependency — deferring it (not the raw signature) is what schedules the
    // seat recompute into React's low-priority pass alongside the table resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSignature]);

  if (!seats) return null;

  return (
    <group>
      {seats.map((seat) => (
        <PlayerCharacter
          key={`3dseat-${seat.id}`}
          angle={seat.angle}
          rX={seat.rX}
          rZ={seat.rZ}
          isActiveTurn={seat.isActiveTurn}
          outfit={seat.outfit}
        />
      ))}
    </group>
  );
};

export default WebGLSeats;
