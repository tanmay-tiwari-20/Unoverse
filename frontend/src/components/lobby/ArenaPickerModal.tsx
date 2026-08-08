'use client';

/**
 * ArenaPickerModal — the in-lobby arena re-picker.
 *
 * Mirrors HouseRulesModal: the host edits, everyone else gets a live read-only
 * view, and the choice locks once the game leaves the lobby. Selecting an arena
 * commits optimistically (`setRoom({...room, arena})`) and emits `update-arena`;
 * the server re-broadcasts the authoritative room to everyone. `random` is sent
 * as-is and resolved to a concrete world server-side.
 *
 * The shell, scrim, focus trap, Escape handling and viewport-safe sizing all
 * come from the shared kit `Modal` now, so this file is only the arena-specific
 * parts: who may edit, and the grid.
 */

import React from 'react';
import { Eye, Globe2, Lock } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { resolveArena, getArenaMeta } from '../../lib/arenas/registry';
import { ArenaSelection } from '../../lib/arenas/types';
import { ArenaGrid } from './ArenaPreview';
import { Modal, ModalBody, ModalHeader, Notice } from '../ui/kit';

export const ArenaPickerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const addToast = useGameStore((s) => s.addToast);
  const { updateArena } = useSocket();

  const isHost = !!player?.isHost;
  const locked = gameStatus !== 'lobby';
  const canEdit = isHost && !locked;
  const current = resolveArena(room?.arena);
  const currentMeta = getArenaMeta(room?.arena);

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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      labelledBy="arena-picker-title"
      /* Kept at the old stacking height so Settings and the help modals still
         layer above this one, exactly as before. */
      zIndex={1100}
    >
      <ModalHeader
        id="arena-picker-title"
        title="Arena"
        /* The current world named in the header means a read-only viewer gets
           their answer without hunting for the highlighted card. */
        subtitle={
          <>
            Now playing in{' '}
            <span className="font-bold" style={{ color: currentMeta.accent }}>
              {currentMeta.name}
            </span>
          </>
        }
        icon={<Globe2 size={18} aria-hidden="true" />}
        onClose={onClose}
        closeLabel="Close arena picker"
      />

      <ModalBody>
        {locked ? (
          <Notice tone="warn" icon={<Lock size={13} aria-hidden="true" />}>
            The arena is locked while a match is in progress.
          </Notice>
        ) : isHost ? (
          <Notice tone="good" icon={<Globe2 size={13} aria-hidden="true" />}>
            You are the host — pick a world and it syncs to everyone instantly.
          </Notice>
        ) : (
          <Notice tone="info" icon={<Eye size={13} aria-hidden="true" />}>
            Only the host can change the arena. This is a live, view-only list.
          </Notice>
        )}

        <ArenaGrid value={current} onChange={commit} disabled={!canEdit} includeRandom={canEdit} />
      </ModalBody>
    </Modal>
  );
};

export default ArenaPickerModal;
