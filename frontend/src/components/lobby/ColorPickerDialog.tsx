'use client';

import React, { useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import type { CardColor } from '../../lib/cards/cardEngine';

/**
 * The four choices, in the exact grid order the table has always shown them.
 * Gradients are written out in full so Tailwind's scanner keeps the classes.
 */
const COLOR_CHOICES: { color: CardColor; label: string; classes: string }[] = [
  { color: 'red', label: 'Red', classes: 'from-red-400 to-red-600 text-white' },
  { color: 'blue', label: 'Blue', classes: 'from-blue-400 to-blue-600 text-white' },
  { color: 'green', label: 'Green', classes: 'from-lime-400 to-green-600 text-white' },
  { color: 'yellow', label: 'Yellow', classes: 'from-yellow-300 to-amber-500 text-neutral-900' },
];

/**
 * Wild-card colour prompt. A *forced* choice: it is modal and traps focus, but
 * Escape deliberately does not dismiss it — the round cannot continue until the
 * server has a colour (and the turn timer will pick one if the player stalls).
 */
export const ColorPickerDialog: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const colorChooserId = useGameStore((s) => s.colorChooserId);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const setIsProcessing = useGameStore((s) => s.setIsProcessing);
  const { chooseColor } = useSocket();

  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = gameStatus === 'awaiting_color_selection' && !!player && colorChooserId === player.id;
  useDialogA11y(dialogRef, isOpen, undefined, { closeOnEscape: false });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-dialog-title"
        className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-5 sm:p-6 flex flex-col items-center gap-5 sm:gap-6 w-full max-w-sm text-center pointer-events-auto max-h-[90dvh] overflow-y-auto"
      >
        <div>
          <h3 id="color-dialog-title" className="font-arcade text-2xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm">Choose Color</h3>
          <p className="font-rounded font-semibold text-white/80 text-xs mt-1">Pick the active color for the Wild card</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full">
          {COLOR_CHOICES.map(({ color, label, classes }) => (
            <button
              key={color}
              disabled={isProcessing}
              onClick={() => {
                setIsProcessing(true);
                chooseColor(color);
              }}
              className={`btn-arcade bg-gradient-to-b ${classes} py-5 text-base uppercase disabled:cursor-not-allowed`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPickerDialog;
