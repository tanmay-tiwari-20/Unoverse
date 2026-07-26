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

  if (gameStatus === 'playing') {
    return isMyTurn ? (
      <span className="font-arcade text-xs bg-gradient-to-b from-lime-400 to-green-600 border-[3px] border-white text-white px-4 py-1.5 rounded-full shadow-[0_4px_0_0_rgba(0,0,0,0.3)] uppercase tracking-wide animate-pulse inline-flex items-center gap-1.5">
        <Star size={14} className="fill-white" /> Your Turn!
        <TurnTimer className="ml-1 text-[11px] no-underline normal-case not-italic" />
      </span>
    ) : (
      <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-blue-300 px-3 py-1 rounded-full shadow-md inline-flex items-center gap-1.5">
        Waiting for {room?.players.find((p) => p.id === currentPlayerId)?.name || `Seat ${currentPlayerSeat}`}...
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  if (gameStatus === 'awaiting_color_selection') {
    return (
      <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-yellow-300 px-3.5 py-1.5 rounded-full shadow-md inline-flex items-center gap-1.5">
        Waiting for color selection...
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  if (gameStatus === 'awaiting_swap_target') {
    return (
      <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-fuchsia-300 px-3.5 py-1.5 rounded-full shadow-md inline-flex items-center gap-1.5">
        <ArrowLeftRight size={12} />
        {swapChooserId === player?.id ? 'Choose a player to swap hands with...' : 'Waiting for Seven-Swap...'}
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  return null;
};

export default GameView;
