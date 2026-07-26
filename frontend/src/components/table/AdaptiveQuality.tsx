'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

import { useSettingsStore } from '../../store/useSettingsStore';
import { logger } from '../../utils/logger';
import {
  DOWNGRADE_FPS,
  DOWNGRADE_SAMPLES,
  QualityTier,
  SAMPLE_WINDOW_MS,
  UPGRADE_FPS,
  UPGRADE_SAMPLES,
  WARMUP_SAMPLES,
  downgradeTier,
  upgradeTier,
} from '../../lib/quality/qualityTiers';

/**
 * Automatic graphics scaling.
 *
 * Renders nothing. Lives inside the `<Canvas>` so it can count real rendered
 * frames (a DOM-side `requestAnimationFrame` counter, like the FPS overlay uses,
 * measures the browser's frame cadence rather than the renderer's throughput and
 * is misleading when R3F throttles or the tab is occluded).
 *
 * How it decides:
 *
 *  - Framerate is averaged over one-second windows. Single slow frames — a card
 *    flight starting, a texture uploading, a GC pause — are invisible to it by
 *    construction, which is what "sustained low FPS" has to mean if the tier is
 *    not going to flicker during normal play.
 *  - `DOWNGRADE_SAMPLES` consecutive bad windows are required to step down; the
 *    much larger `UPGRADE_SAMPLES` is required to step back up. Recovery is
 *    intentionally slower than protection: being briefly over-conservative costs
 *    a little fidelity, being briefly over-ambitious costs dropped frames during
 *    someone's turn.
 *  - The DOWNGRADE/UPGRADE thresholds have a wide gap between them, so a device
 *    parked in that band simply stays where it is instead of ping-ponging.
 *  - A tier that has failed twice is never re-entered for the rest of the
 *    session. Without this, a device that sits just under the upgrade threshold
 *    would climb, stutter, drop, climb... forever.
 *  - Every tier change restarts a warm-up period, because the frames right after
 *    one (new shadow map size, new render target) are not representative.
 */
export const AdaptiveQuality: React.FC = () => {
  const adaptiveQuality = useSettingsStore((s) => s.adaptiveQuality);
  const setAutoTier = useSettingsStore((s) => s.setAutoTier);
  const invalidate = useThree((s) => s.invalidate);

  const framesRef = useRef(0);
  const windowStartRef = useRef(0);
  const badStreakRef = useRef(0);
  const goodStreakRef = useRef(0);
  const warmupRef = useRef(WARMUP_SAMPLES);
  // How many times each tier has proven unsustainable this session.
  const failuresRef = useRef<Partial<Record<QualityTier, number>>>({});

  useFrame(() => {
    if (!adaptiveQuality) return;

    const now = performance.now();
    if (windowStartRef.current === 0) {
      windowStartRef.current = now;
      return;
    }

    framesRef.current += 1;
    const elapsed = now - windowStartRef.current;
    if (elapsed < SAMPLE_WINDOW_MS) return;

    const fps = (framesRef.current * 1000) / elapsed;
    const frames = framesRef.current;
    framesRef.current = 0;
    windowStartRef.current = now;

    // A window that ran far past its length means the loop was suspended (tab
    // backgrounded, device asleep, debugger paused). The "FPS" it implies is an
    // artifact of that gap, not of rendering cost — throw the sample away.
    if (elapsed > SAMPLE_WINDOW_MS * 2 || frames === 0) {
      badStreakRef.current = 0;
      goodStreakRef.current = 0;
      return;
    }

    // Warm-up: mount and post-tier-change frames are dominated by shader
    // compilation and texture upload, and say nothing about steady state.
    if (warmupRef.current > 0) {
      warmupRef.current -= 1;
      return;
    }

    const current = useSettingsStore.getState().autoTier;

    if (fps < DOWNGRADE_FPS) {
      goodStreakRef.current = 0;
      badStreakRef.current += 1;
      if (badStreakRef.current >= DOWNGRADE_SAMPLES) {
        badStreakRef.current = 0;
        const next = downgradeTier(current);
        if (next !== current) {
          failuresRef.current[current] = (failuresRef.current[current] ?? 0) + 1;
          warmupRef.current = WARMUP_SAMPLES;
          logger.info(
            `[Quality] Sustained ${Math.round(fps)} FPS — lowering graphics from ${current} to ${next}.`
          );
          setAutoTier(next);
          // The tier drives DPR and shadow settings; make sure a frame is
          // scheduled to apply them even if nothing else in the scene changed.
          invalidate();
        }
      }
      return;
    }

    if (fps > UPGRADE_FPS) {
      badStreakRef.current = 0;
      goodStreakRef.current += 1;
      if (goodStreakRef.current >= UPGRADE_SAMPLES) {
        goodStreakRef.current = 0;
        const next = upgradeTier(current);
        // Don't re-enter a tier this device has already failed out of twice.
        if (next !== current && (failuresRef.current[next] ?? 0) < 2) {
          warmupRef.current = WARMUP_SAMPLES;
          logger.info(
            `[Quality] Sustained ${Math.round(fps)} FPS — restoring graphics from ${current} to ${next}.`
          );
          setAutoTier(next);
          invalidate();
        }
      }
      return;
    }

    // Comfortably between the thresholds: stable, leave the tier alone.
    badStreakRef.current = 0;
    goodStreakRef.current = 0;
  });

  return null;
};
