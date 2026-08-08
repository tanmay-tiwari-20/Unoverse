'use client';

import React from 'react';
import { Eye, Users } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { Scoreboard } from '../ui/Scoreboard';
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
 *
 * Both corners share one material (`.ui-hud-glass`) and one height
 * (`--ui-tap`). Previously the invite chip, the scoreboard chip and the six
 * control buttons each had their own arcade shell, so the top of the table read
 * as eight separate objects; now it reads as two clusters.
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
      {/* Top Left: room identity + roster */}
      {room && (
        <div className="pointer-events-auto flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={onOpenInvite}
              className="ui-hud-glass ui-hud-pill group flex cursor-pointer items-center gap-1.5 border-white/15 px-2.5 transition-colors hover:border-yellow-400/70 sm:gap-2 sm:px-3"
              style={{ height: 'var(--ui-tap)' }}
              title="Invite Friends"
              aria-label={`Room code ${room.code}. Open invitation options`}
            >
              <Users size={13} className="shrink-0 text-white/70 transition-colors group-hover:text-yellow-300" />
              <span className="font-arcade whitespace-nowrap text-[10px] tracking-wider text-white sm:text-xs">
                <span className="mr-1 uppercase tracking-widest text-yellow-300/90">Invite</span>
                {room.code}
              </span>
            </button>

            {/* Seats + spectators, expanding into the full scoreboard */}
            <Scoreboard />
          </div>

          {/* Persistent local-role indicator: you are watching, not playing */}
          {isSpectator && (
            <span
              className="ui-hud-glass ui-hud-pill inline-flex items-center gap-1.5 border-cyan-300/40 px-2.5 py-1"
              role="status"
            >
              <Eye size={12} className="text-cyan-300" aria-hidden="true" />
              <span className="font-arcade text-[9px] uppercase tracking-widest text-cyan-100 sm:text-[10px]">
                Spectating
              </span>
            </span>
          )}
        </div>
      )}

      {/* Top Right: essential actions */}
      <HudControls onToggleMic={onToggleMic} />
    </header>
  );
};

export default LobbyHeader;
