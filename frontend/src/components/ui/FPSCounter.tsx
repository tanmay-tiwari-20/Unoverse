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
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1 rounded-lg shadow-lg flex flex-col items-center">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">FPS</span>
        <span className={`text-sm font-mono font-black ${fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
          {fps}
        </span>
      </div>
    </div>
  );
};
