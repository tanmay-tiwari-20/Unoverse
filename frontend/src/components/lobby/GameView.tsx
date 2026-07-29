'use client';

import React from 'react';
import { ArrowLeftRight, Star } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useIsMyTurn } from '../../hooks/useIsMyTurn';
import { TurnTimer } from '../table/TurnTimer';

/**
 * In-round status pill: whose turn it is, or which forced choice the table is
 * waiting on. Purely a mirror of the authoritative `gameStatus` — it never
 * decides anything, it only reports what the server already said.
 */
export const GameView: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const currentPlayerSeat = useGameStore((s) => s.currentPlayerSeat);
  const swapChooserId = useGameStore((s) => s.swapChooserId);
  const isMyTurn = useIsMyTurn();

  // Shared frosted-glass shell so every state reads as one calm banner; the
  // accent (ring + text tint + dot) is the only thing that changes between
  // states, keeping the hierarchy quiet until it's your turn.
  const shell =
    'font-rounded font-bold text-[11px] sm:text-[10px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ' +
    'bg-slate-950/55 backdrop-blur-md border shadow-lg select-none whitespace-nowrap';

  if (gameStatus === 'playing') {
    return isMyTurn ? (
      // Your turn: the one moment worth emphasising — brighter glass, emerald
      // accent ring and a soft pulse. Still glass, not a loud solid gradient.
      <span className={`${shell} border-emerald-300/50 ring-1 ring-emerald-300/30 text-emerald-50 hud-pop-in`}>
        <Star size={13} className="fill-emerald-300 text-emerald-300" />
        <span className="font-arcade uppercase tracking-wide text-emerald-50">Your Turn</span>
        <TurnTimer className="ml-0.5 text-[10px]" />
      </span>
    ) : (
      <span className={`${shell} border-white/12 text-slate-200`}>
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400/80 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[42vw]">
          {room?.players.find((p) => p.id === currentPlayerId)?.name || `Seat ${currentPlayerSeat}`}&rsquo;s turn
        </span>
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  if (gameStatus === 'awaiting_color_selection') {
    return (
      <span className={`${shell} border-amber-300/35 text-amber-100`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-300/90 shrink-0" aria-hidden="true" />
        Choosing a color&hellip;
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  if (gameStatus === 'awaiting_swap_target') {
    return (
      <span className={`${shell} border-fuchsia-300/35 text-fuchsia-100`}>
        <ArrowLeftRight size={12} className="text-fuchsia-200" />
        {swapChooserId === player?.id ? 'Pick a player to swap hands' : 'Waiting for Seven-Swap…'}
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  return null;
};

export default GameView;
