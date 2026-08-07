'use client';

import React from 'react';
import { Eye, Users } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { RoomRoster } from '../ui/RoomRoster';
import { HudControls } from './HudControls';

export interface LobbyHeaderProps {
  onOpenInvite: () => void;
  onToggleMic: () => void;
}

/**
 * Top HUD bar overlaying the table. Left: room identity (invite code, roster,
 * local spectator badge). Right: the voice/chat/settings/exit controls.
 *
 * The bar itself is `pointer-events-none` so the 3D table stays draggable
 * between the two clusters; each cluster re-enables pointer events for itself.
 */
export const LobbyHeader: React.FC<LobbyHeaderProps> = ({ onOpenInvite, onToggleMic }) => {
  const room = useGameStore((s) => s.room);
  const isSpectator = useGameStore((s) => s.isSpectator);

  // z-40 beats GameHUD's z-20 context. Both are positioned with a z-index, so
  // each forms its own stacking context and the roster dropdown's inner z-50
  // cannot escape this header — with equal z-index the later element in the DOM
  // (GameHUD, and the lobby action bar inside it) would paint over the dropdown.
  return (
    <header className="absolute top-0 left-0 right-0 hud-pad flex justify-between items-start z-40 pointer-events-none gap-2">
      {/* Top Left: Compact Lobby Panel + Roster */}
      {room && (
        <div className="pointer-events-auto flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={onOpenInvite}
              className="group chip-arcade flex items-center gap-1.5 sm:gap-2 bg-gradient-to-b from-neutral-800 to-black hover:border-yellow-400 px-2.5 py-1.5 sm:px-3.5 sm:py-2 cursor-pointer transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
              title="Invite Friends"
              aria-label={`Room code ${room.code}. Open invitation options`}
            >
              <span className="font-arcade text-[10px] sm:text-xs text-white tracking-wider whitespace-nowrap">
                <span className="text-yellow-300 uppercase tracking-widest mr-1 opacity-90">Invite</span>
                {room.code}
              </span>
              <div className="transition-colors ml-0.5 sm:ml-1 text-white/80 group-hover:text-yellow-300">
                <Users size={13} />
              </div>
            </button>

            {/* Players n/max · Spectators — authoritative roster */}
            <RoomRoster />
          </div>

          {/* Persistent local-role indicator: you are watching, not playing */}
          {isSpectator && (
            <span
              className="chip-arcade flex items-center gap-1.5 bg-gradient-to-b from-cyan-600 to-cyan-800 px-2.5 py-1 sm:px-3 sm:py-1.5"
              role="status"
            >
              <Eye size={12} className="text-white" aria-hidden="true" />
              <span className="font-arcade text-[9px] sm:text-[10px] text-white uppercase tracking-widest">
                Spectating
              </span>
            </span>
          )}
        </div>
      )}

      {/* Top Right: Essential Actions */}
      <HudControls onToggleMic={onToggleMic} />
    </header>
  );
};

export default LobbyHeader;
