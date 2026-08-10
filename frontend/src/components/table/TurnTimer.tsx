'use client';

import React from 'react';
import { Timer } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useNow } from '../../hooks/useNow';

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

  // A ticking clock is an external system — this hook gives us the current time
  // on one shared 250ms interval with zero local state.
  const now = useNow(250, !!turnDeadline);

  if (
    !turnDeadline ||
    (gameStatus !== 'playing' && gameStatus !== 'awaiting_color_selection')
  ) {
    return null;
  }

  const secondsLeft = Math.max(0, Math.ceil((turnDeadline - now) / 1000));
  const urgent = secondsLeft <= 10;

  return (
    <span
      className={`inline-flex items-center gap-1 pl-1.5 ml-0.5 border-l border-white/15 font-rounded font-bold tabular-nums ${
        urgent ? 'text-red-300 animate-pulse' : 'text-white/85'
      } ${className}`}
      title="Time left before your turn is auto-played"
    >
      <Timer size={12} className={urgent ? 'text-red-300' : 'text-white/60'} />
      {secondsLeft}s
    </span>
  );
};
