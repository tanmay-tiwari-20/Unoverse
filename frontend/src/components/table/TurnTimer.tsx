'use client';

import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

/**
 * Compact countdown pill driven by the server-authoritative `turnDeadline`
 * (epoch ms). The server auto-resolves a turn when this hits zero, so this is
 * purely a visual cue — it ticks locally but always re-syncs to the deadline.
 *
 * Renders nothing if there is no active deadline (e.g. lobby / ended states).
 */
export const TurnTimer: React.FC<{ className?: string }> = ({ className = '' }) => {
  const turnDeadline = useGameStore((s) => s.turnDeadline);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!turnDeadline || (gameStatus !== 'playing' && gameStatus !== 'awaiting_color_selection')) {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [turnDeadline, gameStatus]);

  if (secondsLeft === null) return null;

  const urgent = secondsLeft <= 10;

  return (
    <span
      className={`inline-flex items-center gap-1 font-rounded font-bold tabular-nums ${
        urgent ? 'text-red-300 animate-pulse' : 'text-white/90'
      } ${className}`}
      title="Time left before your turn is auto-played"
    >
      <Timer size={12} className={urgent ? 'text-red-300' : 'text-white/70'} />
      {secondsLeft}s
    </span>
  );
};
