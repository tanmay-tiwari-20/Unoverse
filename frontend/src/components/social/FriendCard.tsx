'use client';

/**
 * ============================================================================
 *  FriendCard — one row in the friends list.
 * ============================================================================
 *
 * Deliberately dumb. Every button it offers is offered because the SERVER said
 * so: `presence.joinable` decides whether Join is enabled, `presence.roomCode`
 * decides whether Join exists at all, and the presence status decides the label.
 * Nothing here re-derives a rule, so the card can never offer an action the
 * server would refuse.
 *
 * Memoized on its props: a presence tick for one friend re-renders that one row,
 * not the whole list.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, Mailbox, Send, UserMinus } from 'lucide-react';
import { PresetAvatar } from '../profile/PresetAvatar';
import { PresenceDot, isLive, presenceLabel, presenceTextClass } from './PresenceDot';
import { PlayerIdTag } from './PlayerIdTag';
import { formatRelative } from '../../lib/profile/format';
import type { FriendSummary, PresenceView } from '../../types/social';

export interface FriendCardProps {
  friend: FriendSummary;
  presence: PresenceView;
  /** Live outgoing invite expiry for this friend, if any. */
  invitedUntil?: number;
  /** Epoch ms used for "last seen" — passed in so a list shares one clock. */
  now: number;
  onOpenProfile: (profileId: string) => void;
  onInvite: (profileId: string) => void;
  onJoin: (profileId: string) => void;
  onRemove: (profileId: string) => void;
  /** True while the viewer is in a room and can therefore invite. */
  canInvite: boolean;
}

const FriendCardBase: React.FC<FriendCardProps> = ({
  friend,
  presence,
  invitedUntil,
  now,
  onOpenProfile,
  onInvite,
  onJoin,
  onRemove,
  canInvite,
}) => {
  const live = isLive(presence.status);
  const invited = typeof invitedUntil === 'number' && invitedUntil > now;
  // Join only appears when the server handed back a room to join. `joinable`
  // then decides enabled vs. disabled, so a full table still shows the affordance
  // (greyed) rather than silently hiding it.
  const showJoin = Boolean(presence.roomCode);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className="chip-arcade bg-white/5 hover:bg-white/[0.09] transition-colors flex items-center gap-3 py-2.5 px-3"
    >
      {/* Identity — the whole block opens the full profile. */}
      <button
        type="button"
        onClick={() => onOpenProfile(friend.profileId)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
        aria-label={`View ${friend.displayName}'s profile`}
      >
        <span className="relative shrink-0">
          <PresetAvatar avatarKey={friend.avatarUrl} size={40} />
          <span className="absolute -bottom-0.5 -right-0.5">
            <PresenceDot status={presence.status} size={12} halo={live} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="font-rounded font-bold text-white text-sm truncate">{friend.displayName}</span>
            <PlayerIdTag id={friend.profileId} className="text-white/35" />
          </span>
          <span className={`block font-rounded text-[0.66rem] truncate ${presenceTextClass(presence.status)}`}>
            {presenceLabel(presence.status)}
            {presence.status === 'offline' && presence.lastSeenAt
              ? ` · ${formatRelative(presence.lastSeenAt, now)}`
              : ''}
            {presence.arena && live ? ` · ${presence.arena}` : ''}
          </span>
        </span>
      </button>

      {/* Actions. */}
      <div className="flex items-center gap-1.5 shrink-0">
        {showJoin && (
          <button
            type="button"
            onClick={() => onJoin(friend.profileId)}
            disabled={!presence.joinable}
            title={
              presence.joinable
                ? presence.joinAsSpectator
                  ? 'Join as spectator'
                  : 'Join game'
                : 'That room can’t take anyone else right now'
            }
            className={`chip-arcade w-8 h-8 flex items-center justify-center transition-opacity ${
              presence.joinable
                ? 'bg-gradient-to-b from-lime-400 to-green-600 text-white cursor-pointer'
                : 'bg-white/5 text-white/25 cursor-not-allowed'
            }`}
            aria-label={`Join ${friend.displayName}`}
          >
            <DoorOpen size={14} />
          </button>
        )}

        {live && canInvite && (
          <button
            type="button"
            onClick={() => onInvite(friend.profileId)}
            disabled={invited}
            title={invited ? 'Invite sent' : 'Invite to your table'}
            className={`chip-arcade w-8 h-8 flex items-center justify-center ${
              invited
                ? 'bg-white/5 text-yellow-300/70 cursor-not-allowed'
                : 'bg-gradient-to-b from-sky-500 to-blue-700 text-white cursor-pointer'
            }`}
            aria-label={invited ? `Invite already sent to ${friend.displayName}` : `Invite ${friend.displayName}`}
          >
            {invited ? <Mailbox size={14} /> : <Send size={14} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => onRemove(friend.profileId)}
          title="Remove friend"
          className="chip-arcade w-8 h-8 flex items-center justify-center bg-white/5 text-white/40 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
          aria-label={`Remove ${friend.displayName} from friends`}
        >
          <UserMinus size={14} />
        </button>
      </div>
    </motion.div>
  );
};

/**
 * Memoized on the fields that actually change the render. A presence sweep that
 * re-sends identical views therefore costs nothing, and one friend coming online
 * re-renders exactly one row.
 */
export const FriendCard = React.memo(FriendCardBase, (a, b) =>
  a.friend === b.friend &&
  a.presence === b.presence &&
  a.invitedUntil === b.invitedUntil &&
  a.canInvite === b.canInvite &&
  // `now` only feeds relative timestamps, which are minute-grained.
  Math.abs(a.now - b.now) < 30_000
);

export default FriendCard;
