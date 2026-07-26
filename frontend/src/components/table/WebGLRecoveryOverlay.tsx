'use client';

import React from 'react';
import { MonitorX, RefreshCw } from 'lucide-react';

import { useRenderHealthStore } from '../../store/useRenderHealthStore';

/**
 * User-facing half of WebGL context-loss handling.
 *
 * Sits in the DOM next to the `<Canvas>` (its counterpart, `WebGLContextGuard`,
 * is inside the canvas and can only render 3D). When the GPU context drops, the
 * canvas freezes on its last frame with no error and no visual cue — this
 * overlay is what turns that silent freeze into something a player can act on.
 *
 * Crucially it only covers the 3D layer: the HUD, chat and connection banner
 * around it stay live, and the socket connection is untouched, so the round
 * continues on the server and the table repaints the moment the browser hands
 * the context back.
 */
export const WebGLRecoveryOverlay: React.FC = () => {
  const webglLost = useRenderHealthStore((s) => s.webglLost);
  const webglRestorable = useRenderHealthStore((s) => s.webglRestorable);

  if (!webglLost) return null;

  return (
    <div
      role="alert"
      className="absolute inset-0 z-[900] flex flex-col items-center justify-center gap-4 bg-slate-950/90 px-6 text-center backdrop-blur-sm"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
        <MonitorX className="h-7 w-7 text-amber-400" />
      </div>

      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="font-arcade text-xl tracking-wide text-slate-50">
          Graphics interrupted
        </h2>
        <p className="text-sm leading-relaxed text-slate-400">
          {webglRestorable
            ? "Your device paused 3D rendering to free up memory. It usually comes back on its own in a moment — you're still in the game."
            : '3D rendering is unavailable on this device right now. Reloading may resolve it.'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:bg-amber-400 active:scale-95"
      >
        <RefreshCw className="h-4 w-4" />
        Reload Game
      </button>
    </div>
  );
};
