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
 *   - "Actually loads" is enforced, not assumed: a file that fetches and parses
 *     but has no default scene or nothing drawable in it is treated as a failed
 *     load, so a half-exported asset yields the procedural prop rather than an
 *     invisible hole where the prop used to be.
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
import { ThemedArenaId } from '../../../../lib/arenas/types';
import { isThemedArena } from '../../../../lib/arenas/registry';

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
  /** Target asset; changing it resets the boundary so the new url gets a fresh attempt. */
  url?: string;
  children: React.ReactNode;
}

/**
 * A GLB that fetched and parsed but has nothing we can draw. Distinct from a
 * network/parse failure only for the dev message — both resolve to the
 * procedural fallback.
 */
class UnusableModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableModelError';
  }
}

// A failed GLB is a normal, expected path (the arenas ship procedural-first and
// most `.glb` slots are empty), so a failure must be SILENT in production. But a
// genuinely corrupt or half-exported asset that a developer just dropped in is
// otherwise undebuggable — the procedural fallback simply appears and nothing
// says why. So in dev we log ONCE per distinct problem.
//
// The single gate is a literal `process.env.NODE_ENV` comparison so the bundler
// folds it to `false` in a production build and drops the message strings with
// it. Every logging path below routes through `warnOnce`, so production never
// does more than take a branch.
const IS_DEV = process.env.NODE_ENV === 'development';

// Module-scoped, not per-instance: the same broken asset placed in several spots
// warns once, and a remount/StrictMode double-render doesn't repeat it. Keys are
// `category:url[#clip]`, bounded by MODEL_PATHS × clips, so this can't grow
// without bound.
const warned = new Set<string>();
function warnOnce(key: string, message: string, err?: unknown) {
  if (!IS_DEV) return;
  if (warned.has(key)) return;
  warned.add(key);
  if (err === undefined) console.warn(message);
  else console.warn(message, err);
}

/**
 * A model resolved to the procedural fallback. Split by cause, because the two
 * causes need different developer responses: a parsed-but-unusable asset is
 * always a mistake (the file exists, so somebody meant to ship it), whereas a
 * fetch/parse failure is usually just an intentionally-empty slot.
 */
function warnModelFailed(url: string | undefined, err: unknown) {
  if (!IS_DEV || !url) return;
  if (err instanceof UnusableModelError) {
    warnOnce(
      `unusable:${url}`,
      `[arena/gltf] ${err.message} Falling back to the procedural prop — ` +
        `re-export the asset with its meshes included.`,
    );
    return;
  }
  warnOnce(
    `load:${url}`,
    `[arena/gltf] Optional hero model "${url}" failed to load — using the ` +
      `procedural fallback. This is expected if the file is intentionally absent; ` +
      `if you just added it, check the export (Draco/meshopt) and path.`,
    err,
  );
}

/**
 * A clip that wouldn't bind. Deliberately NOT phrased as a load failure: the
 * model itself is fine and on screen, only the motion is missing.
 */
function warnAnimationFailed(url: string, clip: string, err: unknown) {
  warnOnce(
    `anim:${url}#${clip}`,
    `[arena/gltf] Animation clip "${clip}" in "${url}" could not be played; the ` +
      `model renders without it. Usually means the clip targets nodes the ` +
      `exported rig doesn't contain.`,
    err,
  );
}

class ModelErrorBoundary extends React.Component<FallbackBoundaryProps, { failed: boolean }> {
  constructor(props: FallbackBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    // Dev-only, deduped: surface a real broken asset without spamming the
    // console on every re-render or for an intentionally-absent file.
    warnModelFailed(this.props.url, err);
  }
  componentDidUpdate(prev: FallbackBoundaryProps) {
    // A new target asset gets a fresh attempt.
    if (prev.url !== this.props.url && this.state.failed) {
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

/**
 * Does this subtree contain anything the renderer will actually draw? A GLB can
 * parse cleanly and still be visually empty — an export with only cameras/lights,
 * a scene whose meshes were culled, or a stripped file with an empty root. Those
 * must count as a failed load, otherwise we'd swap the procedural prop out for
 * nothing.
 */
function hasDrawableContent(root: THREE.Object3D): boolean {
  let drawable = false;
  root.traverse((o) => {
    if (drawable) return;
    const candidate = o as THREE.Mesh & { isPoints?: boolean; isLine?: boolean };
    if (candidate.isMesh || candidate.isPoints || candidate.isLine) drawable = true;
  });
  return drawable;
}

const NO_ANIMATIONS: THREE.AnimationClip[] = [];

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
    // A parsed-but-unusable asset throws here, during render, so the boundary
    // below catches it and restores the procedural fallback. Checked before the
    // clone: SkeletonUtils on a malformed root is what would throw otherwise,
    // with a far less actionable message.
    if (!gltf.scene) {
      throw new UnusableModelError(`"${url}" loaded but exposes no default scene.`);
    }
    if (!hasDrawableContent(gltf.scene)) {
      throw new UnusableModelError(`"${url}" loaded but contains no drawable meshes.`);
    }
    const s = cloneSkeleton(gltf.scene) as THREE.Object3D;
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = !!castShadow;
        m.receiveShadow = !!receiveShadow;
      }
    });
    return s;
  }, [gltf.scene, url, castShadow, receiveShadow]);

  // Bind any baked-in clips to this instance's cloned rig and auto-play them all
  // (idle loops, ambient motion). Assets without animations produce an empty
  // action set and this is a no-op.
  const { actions } = useAnimations(gltf?.animations ?? NO_ANIMATIONS, scene);
  React.useEffect(() => {
    const playing = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    // A clip that targets a node this rig doesn't have throws on play. That's a
    // cosmetic defect in the asset, not a reason to throw away a model that is
    // otherwise fine — so each action is isolated and the mesh still renders
    // (static, or with whichever clips did bind).
    playing.forEach((a) => {
      try {
        a.reset().play();
      } catch (err) {
        warnAnimationFailed(url, a.getClip?.()?.name ?? 'clip', err);
      }
    });
    return () => {
      playing.forEach((a) => {
        try {
          a.stop();
        } catch {
          // unbinding a clip that never started is not an error worth surfacing
        }
      });
    };
  }, [actions, url]);

  // Keyed on the cloned scene: `<primitive>` cannot swap its `object` in place,
  // so without this a re-clone (url or shadow flags changing) would keep showing
  // the stale Object3D.
  return <primitive key={scene.uuid} object={scene} />;
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

  // `enabled === false` is the quality gate; an unregistered/empty slot means
  // there is no url to request at all. Both resolve to the procedural prop
  // without mounting Suspense, so no request is made and nothing can throw.
  if (!enabled || !url) return wrapped;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Boundary sits OUTSIDE Suspense: it must survive the suspension that
          the loading child triggers, and still be mounted to catch the throw
          that a rejected fetch replays on the retry render. */}
      <ModelErrorBoundary fallback={fallback} url={url}>
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
  const url = MODEL_PATHS[model];
  try {
    useGLTF.preload(url, USE_DRACO, USE_MESHOPT);
  } catch (err) {
    // A rejected fetch is NOT reported here — drei resolves that asynchronously
    // and `ArenaModel`'s boundary logs it with better context when the asset is
    // actually rendered. Reaching this catch means `preload` threw synchronously,
    // i.e. the loader itself is misconfigured, which no fallback would explain.
    warnOnce(
      `preload:${url}`,
      `[arena/gltf] preloadArenaModel("${model}") threw synchronously; warm-up ` +
        `was skipped. The arena still renders (procedurally, then upgraded on ` +
        `demand), but the GLTF loader setup looks broken.`,
      err,
    );
  }
}

/**
 * Which hero slots each arena actually renders. Mirrors the `<ArenaModel model=…>`
 * calls in the arena components, so a caller that only knows an arena id (the
 * lobby, which learns `room.arena` before the Canvas mounts) can warm exactly
 * that arena's assets.
 *
 * Keyed by `ThemedArenaId`, the same type as `PRELOAD_ARENAS` in
 * `ArenaEnvironment`: a new arena in the catalog is a compile error here until it
 * declares its hero slots, so it can never end up code-preloaded but silently
 * asset-cold. An arena that stays procedural-first declares `[]` explicitly —
 * that is a statement that it needs no warm-up, not an oversight. Classic is
 * excluded by the type (it is procedural-only and eagerly bundled).
 */
const ARENA_HERO_MODELS: Record<ThemedArenaId, readonly ModelKey[]> = {
  space: ['spaceStation'],
  jungle: ['jungleTree', 'jungleFirefly', 'jungleButterfly'],
  glacier: ['glacierFormation'],
  cyber: ['cyberTower'],
  volcano: ['volcanoTemple'],
};

/**
 * Best-effort warm-up of every hero asset an arena may use. Unknown/classic ids
 * no-op. Fire-and-forget: absent files are the normal case and are covered by
 * `ArenaModel`'s fallback.
 */
export function preloadArenaModels(arenaId?: string | null) {
  if (!isThemedArena(arenaId)) return;
  ARENA_HERO_MODELS[arenaId].forEach(preloadArenaModel);
}
