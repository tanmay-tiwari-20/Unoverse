'use client';

/**
 * ============================================================================
 *  SocialRow — the one row geometry behind every social list.
 * ============================================================================
 *
 * Friends, search results and pending requests are all "a person plus one or two
 * actions", so they share this row rather than each restating the layout. That is
 * what keeps the hierarchy identical across all three tabs:
 *
 *     [avatar+presence]  Username  #PlayerID          [ actions ]
 *                        status / context line
 *
 * The identity block is a button that opens the full profile; the actions sit
 * outside it so a tap on "Remove" can never be read as a tap on the name.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { PresetAvatar } from '../profile/PresetAvatar';
import { PresenceDot } from './PresenceDot';
import { PlayerIdTag } from './PlayerIdTag';
import type { PresenceStatus } from '../../types/social';

export interface SocialRowProps {
  profileId: string;
  displayName: string;
  avatarUrl?: string | null;
  status: PresenceStatus;
  /** Live halo on the presence dot. */
  live?: boolean;
  /** The status/context line under the name. Already formatted. */
  meta?: React.ReactNode;
  /** Tailwind text-colour class for the meta line — comes from PresenceDot's
   *  single source of truth so the dot and the words always agree. */
  metaClass?: string;
  onOpenProfile: (profileId: string) => void;
  /** Right-aligned action controls. */
  children?: React.ReactNode;
}

export const SocialRow: React.FC<SocialRowProps> = ({
  profileId,
  displayName,
  avatarUrl,
  status,
  live = false,
  meta,
  metaClass = 'text-white/45',
  onOpenProfile,
  children,
}) => (
  <motion.div
    layout="position"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ type: 'spring', damping: 26, stiffness: 320 }}
    className="ui-card ui-card-hover flex items-center gap-2.5 px-2 py-1.5 sm:px-2.5"
  >
    <button
      type="button"
      onClick={() => onOpenProfile(profileId)}
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
      aria-label={`View ${displayName}'s profile`}
    >
      <span className="relative shrink-0">
        <PresetAvatar avatarKey={avatarUrl} size={36} className="!border-2" />
        {/* Presence sits on the avatar, not in the text — one glance answers
            "can I play with them right now?" */}
        <span className="absolute -bottom-0.5 -right-0.5">
          <PresenceDot status={status} size={11} halo={live} />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="font-rounded truncate text-[13px] font-bold text-white">
            {displayName}
          </span>
          <PlayerIdTag id={profileId} size="text-[10px]" />
        </span>
        <span
          className={`font-rounded mt-[1px] block truncate text-[10px] font-bold leading-tight ${metaClass}`}
        >
          {meta}
        </span>
      </span>
    </button>

    {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
  </motion.div>
);

export default SocialRow;
