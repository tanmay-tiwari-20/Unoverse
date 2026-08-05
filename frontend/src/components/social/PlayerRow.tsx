'use client';

/**
 * ============================================================================
 *  PlayerRow — the shared row for search results and pending requests.
 * ============================================================================
 *
 * Search rows and request rows differ only in which action buttons they carry,
 * so they share one row and take their buttons as children. Keeping them
 * together means the avatar/name/status geometry can never drift between the
 * two tabs.
 *
 * As with `FriendCard`, the SERVER decides what is possible: search rows read
 * `relationship` and `canSendRequest` straight from the payload rather than
 * inferring a state from the friend list.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { PresetAvatar } from '../profile/PresetAvatar';
import { PresenceDot, isLive, presenceLabel, presenceTextClass } from './PresenceDot';
import { formatRelative } from '../../lib/profile/format';
import type { PlayerSummary, PresenceView } from '../../types/social';

export interface PlayerRowProps {
  player: PlayerSummary;
  /** Live presence when known, else the summary's own snapshot value. */
  presence?: PresenceView;
  /** Small line under the name replacing the status text (e.g. "Sent 2h ago"). */
  subtitle?: string;
  now: number;
  onOpenProfile: (profileId: string) => void;
  /** Action buttons, right-aligned. */
  children?: React.ReactNode;
}

const PlayerRowBase: React.FC<PlayerRowProps> = ({
  player,
  presence,
  subtitle,
  now,
  onOpenProfile,
  children,
}) => {
  const view = presence ?? player.presence;
  const live = isLive(view.status);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className="chip-arcade bg-white/5 hover:bg-white/[0.09] transition-colors flex items-center gap-3 py-2.5 px-3"
    >
      <button
        type="button"
        onClick={() => onOpenProfile(player.profileId)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
        aria-label={`View ${player.displayName}'s profile`}
      >
        <span className="relative shrink-0">
          <PresetAvatar avatarKey={player.avatarUrl} size={40} />
          <span className="absolute -bottom-0.5 -right-0.5">
            <PresenceDot status={view.status} size={12} halo={live} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="font-rounded font-bold text-white text-sm truncate">{player.displayName}</span>
            <span className="font-rounded text-[0.62rem] text-white/35 shrink-0">#{player.tag}</span>
          </span>
          {subtitle ? (
            <span className="block font-rounded text-[0.66rem] text-white/45 truncate">{subtitle}</span>
          ) : (
            <span className={`block font-rounded text-[0.66rem] truncate ${presenceTextClass(view.status)}`}>
              {presenceLabel(view.status)}
              {view.status === 'offline' && view.lastSeenAt
                ? ` · ${formatRelative(view.lastSeenAt, now)}`
                : ''}
            </span>
          )}
        </span>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">{children}</div>
    </motion.div>
  );
};

export const PlayerRow = React.memo(PlayerRowBase);

export default PlayerRow;
