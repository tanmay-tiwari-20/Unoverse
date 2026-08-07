'use client';

/**
 * CreateRoomModal — arena selection shown when creating a room from the landing
 * page. The host picks a world (or Random), then confirms; the page POSTs the
 * chosen selection to `/api/rooms` and navigates to the lobby. Selection is
 * purely presentational here — the server resolves `random` to a concrete world.
 */

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Globe2, Rocket } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { DEFAULT_ARENA } from '../../lib/arenas/registry';
import { ArenaSelection } from '../../lib/arenas/types';
import { ArenaGrid } from './ArenaPreview';

export const CreateRoomModal: React.FC<{
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (arena: ArenaSelection) => void;
}> = ({ isOpen, loading, onClose, onConfirm }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<ArenaSelection>(DEFAULT_ARENA);

  useDialogA11y(modalRef, isOpen, loading ? undefined : onClose);

  if (!isOpen) return null;

  const handleOutside = (e: React.MouseEvent) => {
    if (loading) return;
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 pointer-events-auto"
      onClick={handleOutside}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-3xl bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[92dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b-2 border-white/15 bg-lime-600/15 short:px-4 short:py-2">
          <h2
            id="create-room-title"
            className="font-arcade text-lg sm:text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2"
          >
            <Globe2 size={20} className="text-white" /> Choose Arena
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Cancel room creation"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hint */}
        <div className="px-5 sm:px-6 py-2.5 flex items-center gap-2 text-[11px] font-rounded font-bold uppercase tracking-wider border-b border-white/10 bg-lime-500/10 text-lime-300">
          <Globe2 size={13} /> Pick the world your table will live in — you can change it in the lobby too
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar short:p-4">
          <ArenaGrid value={selection} onChange={setSelection} disabled={loading} includeRandom />
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t-2 border-white/15 bg-black/40 flex justify-end">
          <button
            onClick={() => onConfirm(selection)}
            disabled={loading}
            className="btn-arcade bg-gradient-to-b from-lime-400 to-green-600 text-white py-3 px-6 text-sm uppercase inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Rocket size={16} className="fill-white" /> {loading ? 'Creating…' : 'Create Room'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CreateRoomModal;
