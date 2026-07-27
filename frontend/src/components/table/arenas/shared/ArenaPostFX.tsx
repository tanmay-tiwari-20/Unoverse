'use client';

/**
 * ArenaPostFX — the single, global bloom pass for the themed arenas.
 *
 * Bloom is the biggest lever on the "AAA" look: it makes neon, lava, auroras,
 * energy cores and stars actually glow instead of just being bright pixels. It
 * is deliberately mounted ONCE, as a sibling of the arena and the gameplay
 * layers in `RoomEnvironment.Scene`, so it composites the whole frame after
 * everything else has drawn.
 *
 * Cost control — this is the rule that keeps gameplay FPS sacred:
 *   - It renders NOTHING unless the effective quality tier is `high`. On medium/
 *     low, or the instant `AdaptiveQuality` downgrades a struggling device from
 *     high, this component returns `null` and the EffectComposer unmounts, so the
 *     scene falls straight back to the plain forward render. Every arena is
 *     authored to still look good without it (strong emissives + additive halos).
 *   - Bloom is luminance-thresholded (`luminanceThreshold`), so only genuinely
 *     bright emissive/additive pixels bloom. The lit, non-emissive card and seat
 *     surfaces stay crisp — bloom never washes out the gameplay read.
 *
 * Per-arena presets tune how punchy the glow is: electric worlds (cyber, space,
 * volcano) bloom hard; natural worlds (jungle, glacier) stay gentle; the classic
 * tavern barely blooms so the warm lamp doesn't blow out.
 */

import React from 'react';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { ArenaId } from '../../../../lib/arenas/types';
import { resolveArena } from '../../../../lib/arenas/registry';
import { EffectiveQuality } from '../../../../hooks/useEffectiveQuality';

interface BloomPreset {
  intensity: number;
  /** Pixels above this luminance bloom. Lower = more of the scene glows. */
  threshold: number;
  /** Softness of the threshold knee. */
  smoothing: number;
}

const BLOOM_PRESETS: Record<ArenaId, BloomPreset> = {
  classic: { intensity: 0.35, threshold: 0.85, smoothing: 0.3 },
  space: { intensity: 0.95, threshold: 0.6, smoothing: 0.25 },
  jungle: { intensity: 0.5, threshold: 0.75, smoothing: 0.3 },
  glacier: { intensity: 0.7, threshold: 0.7, smoothing: 0.3 },
  cyber: { intensity: 1.15, threshold: 0.5, smoothing: 0.2 },
  volcano: { intensity: 1.05, threshold: 0.55, smoothing: 0.25 },
};

export function ArenaPostFX({
  arenaId,
  quality,
  isLandingPage,
}: {
  arenaId?: ArenaId | string | null;
  quality: EffectiveQuality;
  isLandingPage?: boolean;
}) {
  // Bloom only ever runs on the top tier. This is also the adaptive-downgrade
  // escape hatch: the moment the monitored FPS pulls the effective tier below
  // high, this whole pass unmounts and rendering returns to the cheap path.
  if (quality.tier !== 'high') return null;

  const id = resolveArena(isLandingPage ? 'classic' : arenaId);
  const preset = BLOOM_PRESETS[id];

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        mipmapBlur
        intensity={preset.intensity}
        luminanceThreshold={preset.threshold}
        luminanceSmoothing={preset.smoothing}
      />
    </EffectComposer>
  );
}

export default ArenaPostFX;
