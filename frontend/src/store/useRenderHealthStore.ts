import { create } from 'zustand';

/**
 * Health of the WebGL renderer.
 *
 * Deliberately separate from the settings and game stores: this is neither a
 * preference nor game state, it is "can the GPU still draw for us right now".
 * A lost context is not a React error — nothing throws, the canvas simply stops
 * updating — so no Error Boundary can see it. `WebGLContextGuard` listens for
 * the raw canvas events and records the result here; the DOM layer outside the
 * `<Canvas>` reads it to show a recovery overlay.
 */
interface RenderHealthState {
  /** True between `webglcontextlost` and `webglcontextrestored`. */
  webglLost: boolean;
  /**
   * Whether the browser signalled the context can come back. Drivers that reset
   * without offering restoration (or a `webglcontextcreationerror`) leave this
   * false, which is the difference between "hold on a moment" and "reload".
   */
  webglRestorable: boolean;
  /** Increments on each successful restore, so scenes can force a remount. */
  restoreCount: number;

  reportContextLost: (restorable: boolean) => void;
  reportContextRestored: () => void;
}

export const useRenderHealthStore = create<RenderHealthState>((set) => ({
  webglLost: false,
  webglRestorable: false,
  restoreCount: 0,

  reportContextLost: (restorable) => set({ webglLost: true, webglRestorable: restorable }),
  reportContextRestored: () => set((state) => ({
    webglLost: false,
    webglRestorable: false,
    restoreCount: state.restoreCount + 1,
  })),
}));
