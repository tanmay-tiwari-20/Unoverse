'use client';

import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';

export const FPSCounter: React.FC = () => {
  const { showFPS } = useSettingsStore();
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!showFPS) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const tick = () => {
      const now = performance.now();
      frameCount++;

      if (now >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationFrameId);
  }, [showFPS]);

  if (!showFPS) return null;

  return (
    // High z-index + bottom-left corner keeps it clear of the full-width card
    // HUD (z-100) and the right-side reaction button; the safe-area max() offsets
    // stop it hiding behind mobile browser chrome / the home indicator.
    <div className="fixed z-[1200] pointer-events-none bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))]">
      <div className="bg-black/70 backdrop-blur-md border border-white/15 px-3 py-1 rounded-lg shadow-lg flex flex-col items-center">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">FPS</span>
        <span className={`text-sm font-mono font-black tabular-nums ${fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
          {fps}
        </span>
      </div>
    </div>
  );
};
