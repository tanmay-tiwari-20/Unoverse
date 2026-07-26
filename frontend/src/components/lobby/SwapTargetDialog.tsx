'use client';

import React, { useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useDialogA11y } from '../../hooks/useDialogA11y';

/**
 * Seven-O house rule: after playing a 7 the player picks whose hand to take.
 * Like the colour prompt this is a forced choice — modal, focus-trapped, and
 * not dismissible with Escape.
 *
 * Card counts come from the store's per-seat hands, which for opponents are
 * face-down placeholders synthesised from the server's authoritative counts.
 */
export const SwapTargetDialog: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const swapChooserId = useGameStore((s) => s.swapChooserId);
  const playerCards = useGameStore((s) => s.playerCards);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const { chooseSwapTarget } = useSocket();

  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = gameStatus === 'awaiting_swap_target' && !!player && swapChooserId === player.id;
  useDialogA11y(dialogRef, isOpen, undefined, { closeOnEscape: false });

  if (!isOpen || !player) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-dialog-title"
        className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-5 sm:p-6 flex flex-col items-center gap-5 w-full max-w-sm text-center pointer-events-auto max-h-[90dvh] overflow-y-auto"
      >
        <div>
          <h3 id="swap-dialog-title" className="font-arcade text-2xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm inline-flex items-center gap-2">
            <ArrowLeftRight size={22} /> Seven Swap
          </h3>
          <p className="font-rounded font-semibold text-white/80 text-xs mt-1">
            Choose a player to swap your entire hand with
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 w-full">
          {room?.players
            .filter((p) => p.id !== player.id)
            .map((p) => {
              const cardCount = playerCards[p.seatNumber]?.length ?? 0;
              return (
                <button
                  key={p.id}
                  disabled={isProcessing}
                  onClick={() => chooseSwapTarget(p.id)}
                  aria-label={`Swap hands with ${p.name}, ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`}
                  className="btn-arcade bg-gradient-to-b from-blue-400 to-blue-600 text-white py-3 px-4 text-sm uppercase disabled:cursor-not-allowed inline-flex items-center justify-between gap-2"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="font-rounded text-[10px] bg-black/30 px-2 py-0.5 rounded-full shrink-0">
                    {cardCount} cards
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default SwapTargetDialog;
