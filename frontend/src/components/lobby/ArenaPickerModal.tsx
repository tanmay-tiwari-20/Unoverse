'use client';

/**
 * ArenaPickerModal — the in-lobby arena re-picker.
 *
 * Mirrors HouseRulesModal: the host edits, everyone else gets a live read-only
 * view, and the choice locks once the game leaves the lobby. Selecting an arena
 * commits optimistically (`setRoom({...room, arena})`) and emits `update-arena`;
 * the server re-broadcasts the authoritative room to everyone. `random` is sent
 * as-is and resolved to a concrete world server-side.
 */

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Lock, Globe2, Eye } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { resolveArena, getArenaMeta } from '../../lib/arenas/registry';
import { ArenaSelection } from '../../lib/arenas/types';
import { ArenaGrid } from './ArenaPreview';

export const ArenaPickerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const addToast = useGameStore((s) => s.addToast);
  const { updateArena } = useSocket();
  const modalRef = useRef<HTMLDivElement>(null);

  useDialogA11y(modalRef, isOpen, onClose);

  const isHost = !!player?.isHost;
  const locked = gameStatus !== 'lobby';
  const canEdit = isHost && !locked;
  const current = resolveArena(room?.arena);

  if (!isOpen) return null;

  const commit = (sel: ArenaSelection) => {
    if (!canEdit) return;
    // Optimistic update for a concrete pick so the host's world swaps instantly;
    // `random` waits for the server to choose so all clients agree on the result.
    if (sel !== 'random' && room) {
      useGameStore.getState().setRoom({ ...room, arena: sel });
      addToast(`Arena set to ${getArenaMeta(sel).name}`, 'info');
    }
    updateArena(sel);
  };

  const handleOutside = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6"
      onClick={handleOutside}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="arena-picker-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-3xl bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[92dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b-2 border-white/15 bg-cyan-600/15">
          <h2
            id="arena-picker-title"
            className="font-arcade text-lg sm:text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2"
          >
            <Globe2 size={20} className="text-white" /> Arena
          </h2>
          <button
            onClick={onClose}
            className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer"
            aria-label="Close arena picker"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status banner */}
        <div
          className={`px-5 sm:px-6 py-2.5 flex items-center gap-2 text-[11px] font-rounded font-bold uppercase tracking-wider border-b border-white/10 ${
            locked ? 'bg-amber-500/10 text-amber-300' : isHost ? 'bg-lime-500/10 text-lime-300' : 'bg-blue-500/10 text-blue-300'
          }`}
        >
          {locked ? (
            <>
              <Lock size={13} /> Arena is locked once the match starts
            </>
          ) : isHost ? (
            <>
              <Globe2 size={13} /> You are the host — the world syncs to everyone instantly
            </>
          ) : (
            <>
              <Eye size={13} /> Only the host can change the arena — view only
            </>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
          <ArenaGrid value={current} onChange={commit} disabled={!canEdit} includeRandom={canEdit} />
        </div>
      </motion.div>
    </div>
  );
};

export default ArenaPickerModal;
