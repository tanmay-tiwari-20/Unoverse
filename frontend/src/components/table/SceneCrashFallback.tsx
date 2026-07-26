'use client';

import React from 'react';
import { Box, RefreshCw } from 'lucide-react';

/**
 * What replaces the 3D table when the WebGL scene itself fails to render.
 *
 * The important property is what it *isn't*: it isn't a full-page error screen.
 * The socket stays connected, the round keeps running on the server, and the 2D
 * hand HUD keeps rendering on top of this, so a player whose GPU can't run the
 * scene can still see their cards and take their turn. Retrying re-mounts only
 * the canvas — worth attempting, since a first-frame failure is often a
 * transient driver or memory condition.
 */
export const SceneCrashFallback: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
      <Box className="h-7 w-7 text-slate-400" />
    </div>

    <div className="flex max-w-sm flex-col gap-1.5">
      <h2 className="font-arcade text-xl tracking-wide text-slate-100">
        3D table unavailable
      </h2>
      <p className="text-sm leading-relaxed text-slate-400">
        This device couldn&apos;t render the 3D scene. You can still play — your
        cards and every action are below.
      </p>
    </div>

    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-100 transition hover:bg-white/20 active:scale-95"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Retry 3D
    </button>
  </div>
);
