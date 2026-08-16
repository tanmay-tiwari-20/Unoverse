'use client';

/**
 * ArenaEnvironment — chooses and mounts the active themed world.
 *
 * This is the seam between "which arena" (a synced room field) and "the 3D
 * world" (a heavy, shader-and-mesh-laden component). Every themed arena beyond
 * the classic tavern is `React.lazy`-split so only the selected arena's code and
 * shaders are ever downloaded and compiled — a room in the Volcano never pays
 * for the Space Station's chunk. While a lazy chunk loads, `<Suspense>` shows an
 * arena-neutral placeholder (bare play surface, flat light) rather than a themed
 * world, so the table is never empty for a frame and never flashes the wrong
 * arena. `preloadArena` lets a caller warm the chunk once the id is known, so in
 * practice the placeholder is rarely seen at all.
 *
 * The arena is siblings-with, not a parent of, the seats/cards/camera/controls
 * (those live next to `<ArenaEnvironment>` in `Scene`), so nothing here can alter
 * gameplay geometry — it only swaps the world around the fixed play surface.
 */

import React, { Suspense } from 'react';
import * as THREE from 'three';
import { ArenaId, ThemedArenaId } from '../../../lib/arenas/types';
import { isThemedArena, resolveArena } from '../../../lib/arenas/registry';
import ClassicArena from './ClassicArena';
import { ArenaProps, PlaySurface, useDisposable } from './shared/ArenaKit';

/**
 * `ThemedArenaId` (every arena that ships as its own chunk — the registry minus
 * the eagerly-bundled default) and its `isThemedArena` guard both live in the
 * arena registry, because the asset warm-up map in `shared/gltf` is keyed by the
 * same type. Adding an arena to the catalog is therefore a compile error here
 * until it has a lazy component and a preload thunk, and in `gltf` until it has
 * a hero-asset entry — neither map can silently drift out of the catalog.
 */

// Lazily-loaded themed arenas. Each is its own chunk; the dynamic import is only
// evaluated when that arena id is selected.
const SpaceStationArena = React.lazy(() => import('./SpaceStationArena'));
const JungleArena = React.lazy(() => import('./JungleArena'));
const GlacierArena = React.lazy(() => import('./GlacierArena'));
const CyberCityArena = React.lazy(() => import('./CyberCityArena'));
const VolcanoArena = React.lazy(() => import('./VolcanoArena'));

const LAZY_ARENAS: Record<ThemedArenaId, React.LazyExoticComponent<React.ComponentType<ArenaProps>>> = {
  space: SpaceStationArena,
  jungle: JungleArena,
  glacier: GlacierArena,
  cyber: CyberCityArena,
  volcano: VolcanoArena,
};

// Chunk-preload thunks. Each fires the SAME literal-path `import()` as its
// `React.lazy` counterpart above — the bundler can only match a chunk to a
// preload when the import path is an explicit string literal (per the Next.js
// lazy-loading guide), so these cannot be collapsed into one variable-path
// helper. `React.lazy` de-dupes: a warm-up `import()` and the later render
// resolve the same module promise, so the arena's chunk is compiled before the
// Canvas mounts and the neutral fallback never has to stand in. Code only — no
// model or texture prefetch happens here.
const PRELOAD_ARENAS: Record<ThemedArenaId, () => Promise<unknown>> = {
  space: () => import('./SpaceStationArena'),
  jungle: () => import('./JungleArena'),
  glacier: () => import('./GlacierArena'),
  cyber: () => import('./CyberCityArena'),
  volcano: () => import('./VolcanoArena'),
};

/**
 * Warm the code chunk for an arena as soon as its id is known (e.g. the lobby
 * learns `room.arena`), so the themed world is ready by the time the Canvas
 * mounts. Classic needs no chunk; unknown ids resolve to Classic and no-op.
 * Failures are swallowed — this is a best-effort optimization, and the render
 * path's `Suspense` + `ArenaModel` error boundaries still cover a genuine load
 * failure.
 */
export function preloadArena(arenaId?: ArenaId | string | null): void {
  const id = resolveArena(arenaId);
  if (!isThemedArena(id)) return;
  void PRELOAD_ARENAS[id]().catch(() => {});
}

/**
 * Arena-neutral loading fallback. Shown only in the brief window before a
 * themed arena's chunk finishes compiling. It reproduces just the fixed play
 * surface (same height/footprint every arena shares) under flat neutral light,
 * with no themed decor, sky, or edge glow — so a non-classic room never flashes
 * the Classic Tavern world. Once the real arena resolves, Suspense swaps this
 * out and the material below is disposed with the component.
 */
function ArenaFallback() {
  const surfaceMaterial = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0 }),
    [],
  );
  return (
    <group>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 4]} intensity={0.8} />
      <PlaySurface surfaceMaterial={surfaceMaterial} />
    </group>
  );
}

function SceneReadyNotifier({ onReady }: { onReady?: () => void }) {
  const fired = React.useRef(false);
  // React Three Fiber hook to wait for the first rendered frame of the mounted arena
  React.useEffect(() => {
    if (!fired.current && onReady) {
      fired.current = true;
      onReady();
    }
  }, [onReady]);
  return null;
}

export interface ArenaEnvironmentProps extends ArenaProps {
  /** Concrete or raw arena id; anything unknown resolves to the classic default. */
  arenaId?: ArenaId | string | null;
  /** Callback fired once the active arena is mounted and rendered */
  onReady?: () => void;
}

export function ArenaEnvironment({ arenaId, onReady, ...props }: ArenaEnvironmentProps) {
  const id = resolveArena(arenaId);

  // Classic (and any unknown id) renders synchronously — no Suspense, no chunk.
  if (!isThemedArena(id)) {
    return (
      <>
        <ClassicArena {...props} />
        <SceneReadyNotifier key={id} onReady={onReady} />
      </>
    );
  }

  const Themed = LAZY_ARENAS[id];

  return (
    <Suspense fallback={<ArenaFallback />}>
      <Themed {...props} />
      <SceneReadyNotifier key={id} onReady={onReady} />
    </Suspense>
  );
}

export default ArenaEnvironment;

