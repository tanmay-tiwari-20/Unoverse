'use client';

import React, { useDeferredValue, useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGameStore } from '../../store/useGameStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useEffectiveQuality } from '../../hooks/useEffectiveQuality';
import { getTableGroupScale, getCameraDistanceBoost } from '../../utils/tableLayout';
import { AdaptiveQuality } from './AdaptiveQuality';
import { WebGLContextGuard } from './WebGLContextGuard';
import { ArenaEnvironment } from './arenas/ArenaEnvironment';
import { ArenaPostFX } from './arenas/shared/ArenaPostFX';

// Suppress Three.js Clock deprecation warnings originating from React Three Fiber v9 internals
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      args[0].includes('THREE.Clock: This module has been deprecated')
    ) {
      return;
    }
    originalWarn(...args);
  };
}

export interface RoomEnvironmentProps {
  numPlayers: number;
  localIndex: number;
  children?: React.ReactNode;
  isLandingPage?: boolean;
  onReady?: () => void;
}

function SceneReadyNotifier({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (!fired.current && onReady) {
      fired.current = true;
      onReady();
    }
  });
  return null;
}

function CameraSetup({ isLandingPage, numPlayers = 6 }: { isLandingPage?: boolean; numPlayers?: number }) {
  const size = useThree((state) => state.size);
  // The camera is read through the store getter rather than destructured from the
  // hook: this effect imperatively drives the live camera object (position, fov),
  // which is exactly the kind of mutation the immutability rule forbids on a
  // value returned by a hook. `get()` hands back the same instance R3F renders
  // with, outside of render, which is where imperative camera work belongs.
  const get = useThree((state) => state.get);

  useEffect(() => {
    const { camera } = get();
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
    // `aspect < 1` is a portrait phone; `< 1.3` covers narrow/tablet windows.
    const portrait = aspect < 1;

    // Larger active-player counts widen the table footprint, so pull the camera
    // back proportionally to keep every seat in frame. Spectators never affect this
    // (they aren't counted in numPlayers).
    const countBoost = isLandingPage ? 0 : getCameraDistanceBoost(numPlayers);

    // Base framing (landscape desktop).
    let y = 1.45;
    let z = 2.24;
    let fov = 75;

    if (isLandingPage) {
      // Cinematic hero shot for the landing page.
      y = 1.6;
      z = 3.5;
      fov = 75;
      // In portrait the hero table would be cropped on the sides — ease back and
      // widen the lens so the deck and scattered cards stay in frame.
      if (portrait) {
        z = 3.5 + (1 / aspect - 1) * 1.6;
        fov = Math.min(88, 75 + (1 / aspect - 1) * 26);
      }
    } else if (portrait) {
      // Portrait play view: the vertical FOV crops the table's width, so pull the
      // camera back and open the lens proportionally to how tall-and-narrow the
      // screen is. This keeps all opponents and both piles visible on phones.
      const narrowness = 1 / aspect - 1; // 0 at square, grows as it gets taller
      z = 2.24 + narrowness * 2.1 + countBoost;
      y = 1.45 + narrowness * 0.28 + countBoost * 0.18;
      fov = Math.min(90, 75 + narrowness * 24);
    } else if (aspect < 1.4) {
      // Slightly cramped landscape (small tablets / split-screen) — nudge back.
      z = 2.5 + countBoost;
      fov = 78;
    } else {
      z = 2.24 + countBoost;
      y = 1.45 + countBoost * 0.15;
    }

    camera.position.set(0, y, z);
    camera.lookAt(0, isLandingPage ? 0.7 : 1.0, 0);

    const perspCam = camera as THREE.PerspectiveCamera;
    perspCam.fov = fov;
    perspCam.updateProjectionMatrix();
  }, [get, isLandingPage, numPlayers, size.width, size.height]);

  return null;
}

const Scene = React.memo(function Scene({ numPlayers, localIndex, isLandingPage, onReady, children }: RoomEnvironmentProps) {
  const { cameraMotion, cameraSensitivity } = useSettingsStore();
  const quality = useEffectiveQuality();
  const reducedMotion = useReducedMotion();
  // The synced, match-persistent arena choice. Landing page always uses classic.
  const arenaId = useGameStore((s) => s.room?.arena);

  // Defer the active player count so a bot-add doesn't force the heavy table
  // resize + camera reframe + seat-ring recompute into the same synchronous,
  // uninterruptible commit that clicking "add bot" triggers — that single fat
  // commit is what stalls a frame and trips the WebGL context-loss overlay
  // (the "black screen"). `useDeferredValue` lets the urgent render keep the old
  // count (nothing heavy reconciles) and schedules the count growth as a low-
  // priority pass React can interrupt and time-slice. When the count is
  // unchanged `deferredCount === numPlayers`, so window-resize/aspect work in
  // CameraSetup stays urgent — only genuine count changes are deferred.
  // WebGLSeats defers its own seat signature in lockstep, so the table slab and
  // the seated characters transition together, one frame behind, coherently.
  const deferredCount = useDeferredValue(numPlayers);

  // Table + camera adapt to the active player count (spectators excluded upstream).
  const tableGroupScale = getTableGroupScale(deferredCount);

  return (
    <>
      <SceneReadyNotifier onReady={onReady} />
      <CameraSetup isLandingPage={isLandingPage} numPlayers={deferredCount} />
      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.2} // Keep camera strictly above table horizon
        minAzimuthAngle={-Math.PI / 3}
        maxAzimuthAngle={Math.PI / 3}
        minDistance={1.5}
        maxDistance={5.5}
        enableDamping={true}
        dampingFactor={0.03}
        enableRotate={cameraMotion}
        enablePan={cameraMotion}
        enableZoom={cameraMotion}
        rotateSpeed={cameraSensitivity / 50}
      />

      {/* Watches sustained framerate and steps the tier up/down. Renders nothing. */}
      <AdaptiveQuality />

      {/* The themed world (platform, sky, lights, fog, decor, particles). Fixed per
          match; landing page is always the classic tavern. Seats/cards/camera below
          are arena-independent and unchanged. */}
      <ArenaEnvironment
        arenaId={isLandingPage ? 'classic' : arenaId}
        numPlayers={deferredCount}
        localIndex={localIndex}
        quality={quality}
        tableGroupScale={tableGroupScale}
        isLandingPage={isLandingPage}
        reducedMotion={reducedMotion}
      />

      {children}

      {/* Global bloom pass — sits AFTER the arena and gameplay layers so it
          composites the whole frame. Renders nothing unless the effective tier
          is `high`, so medium/low and any adaptive downgrade fall back to the
          plain forward render with zero cost. */}
      <ArenaPostFX
        arenaId={isLandingPage ? 'classic' : arenaId}
        quality={quality}
        isLandingPage={isLandingPage}
      />
    </>
  );
});
Scene.displayName = 'Scene';

export const RoomEnvironment: React.FC<RoomEnvironmentProps> = ({ numPlayers, localIndex, isLandingPage, onReady, children }) => {
  const quality = useEffectiveQuality();

  // The renderer's own construction options can only be set when the WebGL
  // context is created — changing them later would force R3F to tear the context
  // down and rebuild it, which is exactly the visible interruption adaptive
  // scaling is supposed to avoid. So they are captured once, from the user's
  // manual settings, and never re-derived from the live tier. `useState` with no
  // setter is the capture-once idiom: evaluated on the first render, frozen after.
  const [initialPostProcessing] = useState(quality.postProcessing);

  return (
    <Canvas
      // Both of these ARE safe to change at runtime: R3F applies a new `dpr` via
      // setDpr and a new `shadows` value by toggling the shadow map, both in
      // place on the existing context. This is what makes a tier change a smooth
      // adjustment rather than a scene reload.
      dpr={quality.dpr}
      shadows={quality.shadows ? { type: THREE.PCFShadowMap } : false}
      camera={{ fov: 60, near: 0.1, far: 100 }}
      gl={{
        antialias: initialPostProcessing,
        toneMapping: initialPostProcessing ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping,
        toneMappingExposure: 0.9,
        // Ask the browser for the discrete GPU on hybrid-graphics laptops; on
        // integrated-only machines this is simply ignored.
        powerPreference: 'high-performance',
        // Lets the canvas survive a GPU reset instead of being permanently lost.
        failIfMajorPerformanceCaveat: false,
      }}
      style={{ background: '#020101', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <WebGLContextGuard />
      <Scene numPlayers={numPlayers} localIndex={localIndex} isLandingPage={isLandingPage} onReady={onReady}>
        {children}
      </Scene>
    </Canvas>
  );
};
