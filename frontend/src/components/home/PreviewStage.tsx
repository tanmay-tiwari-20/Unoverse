'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getOutfit, outfitForName } from '../../lib/cosmetics/outfits';
import PreviewCharacter from './PreviewCharacter';

/**
 * ============================================================================
 *  PreviewStage — the self-contained 3D stage for the outfit preview.
 * ============================================================================
 *
 * PURELY VISUAL and deliberately ISOLATED. This is the little studio the
 * home/profile "mannequin" (`PreviewCharacter`) stands in: its own `Canvas`, its
 * own three-point lighting rig, its own turntable. It shares NOTHING with the
 * table renderer — no `RoomEnvironment`, no `WebGLSeats`, no `LandingScene`, no
 * arena/quality context, no Zustand store. The only thing it has in common with
 * the in-game look is the outfit palette, and that arrives as a plain string key
 * it forwards straight to `PreviewCharacter`.
 *
 * That isolation is the point: the preview can be relit, reframed or restyled
 * with zero risk to gameplay visuals, and it renders fine on a page where no
 * game context exists at all.
 *
 * INTERACTION — a turntable. Drag horizontally (mouse, pen or touch) to spin the
 * character on Y; arrow keys nudge it for keyboard users. Let go and the flick
 * carries on with a little inertia, then a slow idle spin fades back in. All of
 * it is skipped under `prefers-reduced-motion`, where the stage holds still and
 * only ever moves in direct response to a drag or key press.
 *
 * PERFORMANCE — `frameloop="demand"`, so the canvas is idle unless something
 * actually needs drawing. The turntable re-arms the loop from inside `useFrame`
 * while the character is breathing or spinning, and under reduced motion nothing
 * re-arms it at all: the stage renders once and then costs nothing until the
 * user touches it. The canvas is transparent (`alpha`), so whatever the page puts
 * behind it shows through — the stage draws no background of its own.
 */

/** Radians of spin per pixel dragged (~a full turn across a 560px drag). */
const DRAG_SENSITIVITY = 0.011;
/** Radians the arrow keys nudge per press (24°). */
const KEY_STEP = Math.PI / 7.5;
/** Idle auto-spin speed in rad/s (~22s per revolution). */
const AUTO_SPIN = 0.28;
/** Seconds of stillness after an interaction before the idle spin starts back up. */
const AUTO_SPIN_DELAY = 1.4;
/** Seconds the idle spin takes to fade in once it starts. */
const AUTO_SPIN_FADE = 1.1;
/** Exponential decay rate for post-drag inertia (higher = shorter fling). */
const INERTIA_DAMPING = 4.5;
/** Below this (rad/s) a fling is considered finished. */
const INERTIA_EPSILON = 0.002;

/** Mutable turntable state, shared between the DOM handlers and the r3f frame. */
interface SpinState {
  /** Current Y rotation in radians. */
  rotation: number;
  /** Leftover angular velocity from a fling, in rad/s. */
  velocity: number;
  /** True while a pointer is down and dragging. */
  dragging: boolean;
  /** Seconds since the last user interaction (drag move or key press). */
  idleTime: number;
}

export interface PreviewStageProps {
  /** Stored outfit key to preview; forwarded verbatim to `PreviewCharacter`. */
  outfitKey?: string | null;
  /** Player name, used only to derive a neutral outfit when no key is given. */
  name?: string | null;
  /** Whether the idle auto-spin runs. Ignored under reduced motion. */
  autoRotate?: boolean;
  /** Sizing/positioning for the stage wrapper (it fills whatever box it gets). */
  className?: string;
}

// ---------------------------------------------------------------------------
//  Turntable — owns the spin, and owns re-arming the on-demand frame loop.
// ---------------------------------------------------------------------------

interface TurntableProps {
  /**
   * Shared mutable spin state, written by the DOM handlers on the wrapper. Named
   * with the `Ref` suffix so the hooks lint recognises it as a ref and permits
   * the per-frame mutation below.
   */
  spinRef: React.RefObject<SpinState>;
  /**
   * Filled with r3f's `invalidate` so the DOM drag handlers — which live outside
   * the Canvas and therefore get no automatic re-render — can wake the loop.
   */
  wakeRef: React.RefObject<(() => void) | null>;
  autoRotate: boolean;
  prefersReduced: boolean;
  children: React.ReactNode;
}

const Turntable: React.FC<TurntableProps> = ({ spinRef, wakeRef, autoRotate, prefersReduced, children }) => {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    wakeRef.current = invalidate;
    return () => {
      wakeRef.current = null;
    };
  }, [wakeRef, invalidate]);

  // The rotation is applied straight to the group's transform rather than being
  // pushed through React state: a 60Hz setState would re-render the whole
  // character tree every frame for what is one matrix update.
  useFrame((_state, rawDelta) => {
    const s = spinRef.current;
    const g = groupRef.current;
    if (!s || !g) return;

    // On `demand` the first frame after an idle gap arrives with a huge delta.
    // Clamp it so waking the loop can never teleport a fling a quarter turn.
    const delta = Math.min(rawDelta, 1 / 20);

    if (!s.dragging) {
      s.idleTime += delta;

      if (Math.abs(s.velocity) > INERTIA_EPSILON) {
        // Carry the flick, bleeding off exponentially — feels like a real dial.
        s.rotation += s.velocity * delta;
        s.velocity *= Math.exp(-INERTIA_DAMPING * delta);
      } else {
        s.velocity = 0;
        if (autoRotate && !prefersReduced) {
          // Fade the idle spin in so it resumes as a drift, never as a jolt.
          const fade = Math.min(1, (s.idleTime - AUTO_SPIN_DELAY) / AUTO_SPIN_FADE);
          if (fade > 0) s.rotation += AUTO_SPIN * fade * delta;
        }
      }
    }

    g.rotation.y = s.rotation;

    // Nothing redraws under `frameloop="demand"` unless we ask, so keep asking
    // while anything is still in motion: the character's own breathing idle
    // (always running unless reduced motion), a fling, or the auto-spin. Under
    // reduced motion with no interaction this stops re-arming and the canvas
    // goes fully idle — one render, then zero cost.
    if (!prefersReduced || s.dragging || s.velocity !== 0) invalidate();
  });

  return <group ref={groupRef}>{children}</group>;
};

// ---------------------------------------------------------------------------
//  The stage itself.
// ---------------------------------------------------------------------------

/** Height the camera aims at — roughly the character's chest, for a flattering
 *  three-quarter framing rather than a floor-level or bird's-eye one. */
const CAMERA_TARGET_Y = 0.82;

/**
 * A standing outfit preview on a small lit stage. Drag to spin, release to fling,
 * leave it be and it drifts back into a slow turn.
 */
const PreviewStage: React.FC<PreviewStageProps> = ({
  outfitKey,
  name,
  autoRotate = true,
  className,
}) => {
  const prefersReduced = useReducedMotion();

  // Rim-light tint comes from the outfit's own accent, so a neon skin gets a
  // coloured edge and a matte one stays neutral. Resolved exactly the way
  // `PreviewCharacter` resolves its own palette (key wins, else derive from the
  // name), so the rim always matches the outfit actually being worn.
  const rimColor = useMemo(
    () => (outfitKey ? getOutfit(outfitKey) : outfitForName(name)).accent,
    [outfitKey, name],
  );

  const spinRef = useRef<SpinState>({ rotation: 0, velocity: 0, dragging: false, idleTime: 0 });
  const wakeRef = useRef<(() => void) | null>(null);
  /** Last pointer x + timestamp, for deriving fling velocity on release. */
  const drag = useRef({ x: 0, t: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = spinRef.current;
    s.dragging = true;
    s.velocity = 0;
    s.idleTime = 0;
    drag.current = { x: e.clientX, t: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
    wakeRef.current?.();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = spinRef.current;
    if (!s.dragging) return;
    const dx = e.clientX - drag.current.x;
    const dt = (e.timeStamp - drag.current.t) / 1000;
    s.rotation += dx * DRAG_SENSITIVITY;
    s.idleTime = 0;
    // Instantaneous velocity, so letting go mid-flick keeps the momentum. The dt
    // guard drops the coalesced same-timestamp events browsers can emit.
    if (dt > 0) s.velocity = (dx * DRAG_SENSITIVITY) / dt;
    drag.current = { x: e.clientX, t: e.timeStamp };
    wakeRef.current?.();
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = spinRef.current;
    if (!s.dragging) return;
    s.dragging = false;
    s.idleTime = 0;
    // A pointer that stopped moving before release should not fling.
    if (e.timeStamp - drag.current.t > 120) s.velocity = 0;
    // Under reduced motion the spin ends exactly where the finger left it.
    if (prefersReduced) s.velocity = 0;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    wakeRef.current?.();
  }, [prefersReduced]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const s = spinRef.current;
    s.rotation += dir * KEY_STEP;
    s.velocity = 0;
    s.idleTime = 0;
    wakeRef.current?.();
  }, []);

  return (
    <div
      className={className}
      // `touch-none` hands touch drags to the turntable instead of the page
      // scroller — without it a swipe on the preview scrolls the page instead.
      style={{ touchAction: 'none', cursor: 'grab' }}
      tabIndex={0}
      role="img"
      aria-label="Outfit preview. Drag, or use the left and right arrow keys, to rotate the character."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <Canvas
        // On-demand: the stage only draws when the turntable asks it to.
        frameloop="demand"
        dpr={[1, 2]}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [0, CAMERA_TARGET_Y, 3.6], fov: 30, near: 0.1, far: 20 }}
        gl={{
          // Transparent so the page's own backdrop shows through — this stage
          // deliberately paints no background of its own.
          alpha: true,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          powerPreference: 'high-performance',
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/*
          Everything is authored in CHARACTER space (soles at y = 0) and the whole
          stage is then dropped so the camera, sitting at chest height and looking
          straight down its own axis, frames the figure without any lookAt rig.
        */}
        <group position={[0, -CAMERA_TARGET_Y, 0]}>
          {/* Soft base fill so shadowed sides never go black. */}
          <ambientLight intensity={0.55} />
          {/* Key — front-right and high; the only light that casts. */}
          <directionalLight
            position={[2.4, 3.4, 2.8]}
            intensity={2.1}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0012}
            // Tight ortho bounds around a ~1.7m figure keep the map's texels
            // dense, which is what makes a 1k shadow read as soft rather than
            // blocky at this framing.
            shadow-camera-left={-1.6}
            shadow-camera-right={1.6}
            shadow-camera-top={2.4}
            shadow-camera-bottom={-0.4}
            shadow-camera-near={0.5}
            shadow-camera-far={12}
          />
          {/* Fill — cool, from the opposite side, no shadow. */}
          <directionalLight position={[-3, 1.8, 1.6]} intensity={0.6} color="#93c5fd" />
          {/* Rim — behind and above, tinted by the outfit's accent, for a clean
              silhouette against a dark page backdrop. */}
          <directionalLight position={[-1.2, 2.6, -3]} intensity={1.35} color={rimColor} />

          {/* Contact shadow catcher: `shadowMaterial` draws ONLY the shadow, so
              the canvas stays transparent and the figure still feels grounded. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <circleGeometry args={[1.5, 48]} />
            <shadowMaterial transparent opacity={0.32} />
          </mesh>

          <Turntable spinRef={spinRef} wakeRef={wakeRef} autoRotate={autoRotate} prefersReduced={prefersReduced}>
            <PreviewCharacter outfitKey={outfitKey} name={name} />
          </Turntable>
        </group>
      </Canvas>
    </div>
  );
};

export default PreviewStage;
