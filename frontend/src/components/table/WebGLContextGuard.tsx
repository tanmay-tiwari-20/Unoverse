'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

import { useRenderHealthStore } from '../../store/useRenderHealthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { logger } from '../../utils/logger';

/**
 * Survives WebGL context loss.
 *
 * A lost context is the most common hard failure on the devices this game has to
 * run on: integrated GPUs under memory pressure, phones backgrounded for a while,
 * driver resets, or the browser reclaiming a context because too many are open.
 * It does NOT throw, so React Error Boundaries never see it — the canvas just
 * freezes on its last frame, which historically looked identical to the game
 * hanging.
 *
 * Two things have to happen for recovery to be possible at all:
 *
 *  1. `preventDefault()` on `webglcontextlost`. Without it the browser is under
 *     no obligation to ever fire `webglcontextrestored`, and the context is gone
 *     for good. This single call is what makes the loss recoverable.
 *  2. The loss must be surfaced to the DOM layer, since this component lives
 *     inside the `<Canvas>` and can only render 3D. It writes to the render
 *     health store; `WebGLRecoveryOverlay` renders the user-facing part.
 *
 * On restore we also drop a quality tier: a context lost under memory pressure
 * that immediately returns to the same workload tends to be lost again.
 */
export const WebGLContextGuard: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleLost = (event: Event) => {
      // Tell the browser we intend to recover — see (1) above.
      event.preventDefault();
      logger.error('[WebGL] Rendering context lost. Attempting recovery…');
      useRenderHealthStore.getState().reportContextLost(true);
    };

    const handleRestored = () => {
      logger.info('[WebGL] Rendering context restored.');
      useRenderHealthStore.getState().reportContextRestored();

      // Come back gentler than we left. Whatever pressure cost us the context is
      // usually still present, and re-entering at the same tier tends to lose it
      // again; the adaptive monitor will climb back if the device proves stable.
      const settings = useSettingsStore.getState();
      if (settings.adaptiveQuality && settings.autoTier !== 'low') {
        settings.setAutoTier(settings.autoTier === 'high' ? 'medium' : 'low');
      }

      // Textures and buffers are re-uploaded lazily; force a frame so the table
      // repaints immediately instead of on the next state change.
      invalidate();
    };

    const handleCreationError = (event: Event) => {
      logger.error('[WebGL] Context creation failed.', event);
      // No context was created, so there is nothing to restore — the overlay
      // offers a reload rather than asking the user to wait.
      useRenderHealthStore.getState().reportContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', handleRestored as EventListener, false);
    canvas.addEventListener('webglcontextcreationerror', handleCreationError as EventListener, false);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', handleRestored as EventListener);
      canvas.removeEventListener('webglcontextcreationerror', handleCreationError as EventListener);
    };
  }, [gl, invalidate]);

  return null;
};
