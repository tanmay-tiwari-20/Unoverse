'use client';

/**
 * ArenaEnvironment — chooses and mounts the active themed world.
 *
 * This is the seam between "which arena" (a synced room field) and "the 3D
 * world" (a heavy, shader-and-mesh-laden component). Every themed arena beyond
 * the classic tavern is `React.lazy`-split so only the selected arena's code and
 * shaders are ever downloaded and compiled — a room in the Volcano never pays
 * for the Space Station's chunk. While a lazy chunk loads, `<Suspense>` shows the
 * ClassicArena as a lightweight, already-loaded fallback so the table is never
 * empty for a frame.
 *
 * The arena is siblings-with, not a parent of, the seats/cards/camera/controls
 * (those live next to `<ArenaEnvironment>` in `Scene`), so nothing here can alter
 * gameplay geometry — it only swaps the world around the fixed play surface.
 */

import React, { Suspense } from 'react';
import { ArenaId } from '../../../lib/arenas/types';
import { resolveArena } from '../../../lib/arenas/registry';
import ClassicArena from './ClassicArena';
import { ArenaProps } from './shared/ArenaKit';

// Lazily-loaded themed arenas. Each is its own chunk; the dynamic import is only
// evaluated when that arena id is selected.
const SpaceStationArena = React.lazy(() => import('./SpaceStationArena'));
const JungleArena = React.lazy(() => import('./JungleArena'));
const GlacierArena = React.lazy(() => import('./GlacierArena'));
const CyberCityArena = React.lazy(() => import('./CyberCityArena'));
const VolcanoArena = React.lazy(() => import('./VolcanoArena'));

const LAZY_ARENAS: Partial<Record<ArenaId, React.LazyExoticComponent<React.ComponentType<ArenaProps>>>> = {
  space: SpaceStationArena,
  jungle: JungleArena,
  glacier: GlacierArena,
  cyber: CyberCityArena,
  volcano: VolcanoArena,
};

export interface ArenaEnvironmentProps extends ArenaProps {
  /** Concrete or raw arena id; anything unknown resolves to the classic default. */
  arenaId?: ArenaId | string | null;
}

export function ArenaEnvironment({ arenaId, ...props }: ArenaEnvironmentProps) {
  const id = resolveArena(arenaId);
  const Themed = id === 'classic' ? null : LAZY_ARENAS[id];

  // Classic (and any unknown id) renders synchronously — no Suspense, no chunk.
  if (!Themed) {
    return <ClassicArena {...props} />;
  }

  return (
    <Suspense fallback={<ClassicArena {...props} />}>
      <Themed {...props} />
    </Suspense>
  );
}

export default ArenaEnvironment;
