'use client';

/**
 * gltf — optional GLTF hero-asset support for the themed arenas, with a
 * guaranteed procedural fallback.
 *
 * The arenas are procedural-first by design (code-split, zero mandatory
 * downloads). This module lets an arena OPTIONALLY upgrade a "hero" prop to an
 * optimized `.glb` when one is present under `public/models/…`, while never
 * breaking — and never blocking first paint — when it is absent or fails to
 * load:
 *
 *   - `<ArenaModel>` wraps drei's cached `useGLTF` (Draco + meshopt enabled) in a
 *     `<Suspense>` whose fallback is the procedural mesh, AND an error boundary
 *     that renders the SAME procedural mesh if the fetch/parse fails (missing
 *     file, 404, bad asset). So the procedural version shows instantly, then is
 *     seamlessly replaced only if a valid model actually loads.
 *   - Loads are gated by the caller (quality tier), so low/medium never even
 *     attempt a download.
 *   - drei owns the GLTF cache + disposal, so switching arenas releases the GPU
 *     buffers exactly like every other resource in `ArenaKit`.
 *
 * The net effect: the game's look and FPS never depend on any binary asset
 * existing. Drop a valid, optimized `.glb` into the referenced path and it lights
 * up automatically; ship without one and the arena is still complete.
 */

import React, { Suspense } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

/**
 * Canonical hero-asset slots. Paths are relative to `public/` (served at the web
 * root). A file is entirely optional — see the module doc. Keeping the registry
 * here means arenas reference a symbol, not a magic string, and the set of
 * expected assets is discoverable in one place.
 */
export const MODEL_PATHS = {
  spaceStation: '/models/space/station.glb',
  jungleTree: '/models/jungle/canopy-tree.glb',
  jungleFirefly: '/models/jungle/firefly.glb',
  jungleButterfly: '/models/jungle/butterfly.glb',
  glacierFormation: '/models/glacier/ice-formation.glb',
  cyberTower: '/models/cyber/tower.glb',
  volcanoTemple: '/models/volcano/temple.glb',
} as const;

export type ModelKey = keyof typeof MODEL_PATHS;

// Draco + meshopt on by default: any assets we do ship should be compressed.
const USE_DRACO = true;
const USE_MESHOPT = true;

// ---------------------------------------------------------------------------
// Error boundary — turns a failed load into the procedural fallback
// ---------------------------------------------------------------------------

interface FallbackBoundaryProps {
  fallback: React.ReactNode;
  /** Bump to reset the boundary if the url changes. */
  resetKey?: string;
  children: React.ReactNode;
}

class ModelErrorBoundary extends React.Component<FallbackBoundaryProps, { failed: boolean }> {
  constructor(props: FallbackBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: FallbackBoundaryProps) {
    // A new target asset gets a fresh attempt.
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }
  render() {
    if (this.state.failed) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Loaded-model renderer
// ---------------------------------------------------------------------------

function LoadedModel({
  url,
  castShadow,
  receiveShadow,
}: {
  url: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const gltf = useGLTF(url, USE_DRACO, USE_MESHOPT);
  // Clone with SkeletonUtils rather than Object3D.clone: a plain clone shares
  // the original skeleton, so multiple placements of a rigged/animated asset
  // would fight over one set of bones. SkeletonUtils rebinds each SkinnedMesh to
  // its own cloned skeleton. This also keeps our shadow-flag mutation local to
  // this instance and lets the same cached scene be placed more than once.
  const scene = React.useMemo(() => {
    const s = cloneSkeleton(gltf.scene) as THREE.Object3D;
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = !!castShadow;
        m.receiveShadow = !!receiveShadow;
      }
    });
    return s;
  }, [gltf.scene, castShadow, receiveShadow]);

  // Bind any baked-in clips to this instance's cloned rig and auto-play them all
  // (idle loops, ambient motion). Assets without animations produce an empty
  // action set and this is a no-op.
  const { actions } = useAnimations(gltf.animations, scene);
  React.useEffect(() => {
    const playing = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    playing.forEach((a) => a.reset().play());
    return () => {
      playing.forEach((a) => a.stop());
    };
  }, [actions]);

  return <primitive object={scene} />;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Render an optional GLTF hero asset, falling back to a procedural node.
 *
 * `fallback` is shown immediately (as the Suspense fallback) and permanently if
 * the load errors — so callers pass their existing procedural prop here and get
 * a strict visual upgrade only when a real asset resolves.
 *
 * `enabled` lets the caller gate loading by quality tier: when false, the
 * procedural fallback renders and no network request is made.
 */
export function ArenaModel({
  model,
  fallback,
  enabled = true,
  position,
  rotation,
  scale,
  castShadow,
  receiveShadow,
}: {
  model: ModelKey;
  fallback: React.ReactNode;
  enabled?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const url = MODEL_PATHS[model];

  const wrapped = (
    <group position={position} rotation={rotation} scale={scale}>
      {fallback}
    </group>
  );

  if (!enabled) return wrapped;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <ModelErrorBoundary fallback={fallback} resetKey={url}>
        <Suspense fallback={fallback}>
          <LoadedModel url={url} castShadow={castShadow} receiveShadow={receiveShadow} />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  );
}

/**
 * Best-effort preload of a hero asset for an arena that is about to mount. Safe
 * to call for a file that doesn't exist — drei swallows it and `ArenaModel`
 * still falls back. Never awaited; never blocks.
 */
export function preloadArenaModel(model: ModelKey) {
  try {
    useGLTF.preload(MODEL_PATHS[model], USE_DRACO, USE_MESHOPT);
  } catch {
    // ignore — the fallback path covers a failed/absent asset
  }
}
