'use client';

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useViewport } from '../../hooks/useViewport';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useDialogA11y } from '../../hooks/useDialogA11y';

/**
 * Landscape preference nudge for portrait phones at the game table. The 3D
 * scene and card fan are designed for landscape (the camera math in portrait
 * clamps FOV at 90° and still retreats), so we gently guide phones that way.
 *
 * Shown ONLY when:
 *  - isMobile (not tablets — a tablet in portrait has enough short-edge room)
 *  - isPortrait
 *  - allowPortrait is still false (the user hasn't opted into portrait mode)
 *
 * Escape hatch: "Play in portrait" button. Some users have rotation locked at
 * the OS level, some physically cannot rotate their device, and a hard gate
 * would be an accessibility failure. The choice persists so it is asked once,
 * not every round.
 */
export const RotateDevicePrompt: React.FC = () => {
  const { isMobile, isPortrait } = useViewport();
  const allowPortrait = useSettingsStore((s) => s.allowPortrait);
  const setAllowPortrait = useSettingsStore((s) => s.setAllowPortrait);

  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = isMobile && isPortrait && !allowPortrait;

  // Focus-trapping and ARIA for the modal state; Escape intentionally does not
  // dismiss it (only the escape-hatch button does), matching ColorPickerDialog.
  useDialogA11y(dialogRef, isOpen, undefined, { closeOnEscape: false });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-md p-6 select-none">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rotate-prompt-title"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-6 sm:p-8 flex flex-col items-center gap-6 w-full max-w-sm text-center pointer-events-auto"
      >
        {/* Animated rotate icon */}
        <motion.div
          animate={{ rotate: [0, -90, -90, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', times: [0, 0.3, 0.7, 1] }}
          className="w-20 h-20 rounded-full bg-gradient-to-b from-yellow-400 to-amber-600 flex items-center justify-center shadow-lg"
        >
          <RotateCcw size={40} className="text-white" strokeWidth={2.5} />
        </motion.div>

        {/* Heading + reason */}
        <div>
          <h2
            id="rotate-prompt-title"
            className="font-arcade text-2xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm mb-2"
          >
            Turn Sideways
          </h2>
          <p className="font-rounded font-semibold text-white/90 text-sm leading-relaxed">
            Landscape mode gives you a better view of the table, your cards, and your opponents.
          </p>
        </div>

        {/* Escape hatch — the choice persists so it is honoured for good */}
        <button
          onClick={() => setAllowPortrait(true)}
          className="btn-arcade bg-gradient-to-b from-neutral-700 to-neutral-900 text-white uppercase text-sm px-6 py-2.5"
        >
          Play in Portrait
        </button>
      </motion.div>
    </div>
  );
};

export default RotateDevicePrompt;
