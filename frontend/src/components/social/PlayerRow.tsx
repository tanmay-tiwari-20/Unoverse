'use client';

/**
 * ============================================================================
 *  PlayerRow — the shared row for search results and pending requests.
 * ============================================================================
 *
 * Search rows and request rows differ only in which action buttons they carry,
 * so they share one row and take their buttons as children. Both now render
 * through `SocialRow`, which means the avatar / name / Player ID / status
 * geometry is literally the same component the friends list uses and cannot
 * drift between tabs.
 *
 * As with `FriendCard`, the SERVER decides what is possible: search rows read
 * `relationship` and `canSendRequest` straight from the payload rather than
 * inferring a state from the friend list.
 */

import React from 'react';
import { SocialRow } from './SocialRow';
import { isLive, presenceLabel, presenceTextClass } from './PresenceDot';
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

  const meta = subtitle ?? (
    <>
      {presenceLabel(view.status)}
      {view.status === 'offline' && view.lastSeenAt
        ? ` · ${formatRelative(view.lastSeenAt, now)}`
        : ''}
    </>
  );

  return (
    <SocialRow
      profileId={player.profileId}
      displayName={player.displayName}
      avatarUrl={player.avatarUrl}
      status={view.status}
      live={live}
      meta={meta}
      metaClass={subtitle ? 'text-white/45' : presenceTextClass(view.status)}
      onOpenProfile={onOpenProfile}
    >
      {children}
    </SocialRow>
  );
};

export const PlayerRow = React.memo(PlayerRowBase);

export default PlayerRow;
