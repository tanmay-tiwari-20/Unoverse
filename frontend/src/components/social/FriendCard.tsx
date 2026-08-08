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
 * Action hierarchy — the point of the redesign. A friend row used to carry three
 * equally-loud icon buttons and left the player to guess which one mattered. Now
 * exactly ONE action is a labelled button (the thing you most likely want: join
 * them if they're joinable, otherwise invite them), anything else is a quiet icon,
 * and "Remove" is always the quietest control in the row.
 *
 * Memoized on its props: a presence tick for one friend re-renders that one row,
 * not the whole list.
 */

import React from 'react';
import { DoorOpen, Mailbox, Send, UserMinus } from 'lucide-react';
import { SocialRow } from './SocialRow';
import { isLive, presenceLabel, presenceTextClass } from './PresenceDot';
import { Button, IconButton } from '../ui/kit';
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
  const showInvite = live && canInvite;

  // Context line: status, then the single most useful detail — where they are
  // (room code / arena) while live, how long ago while offline.
  const meta = (
    <>
      {presenceLabel(presence.status)}
      {presence.status === 'offline' && presence.lastSeenAt
        ? ` · ${formatRelative(presence.lastSeenAt, now)}`
        : ''}
      {live && presence.roomCode ? ` · #${presence.roomCode}` : ''}
      {live && !presence.roomCode && presence.arena ? ` · ${presence.arena}` : ''}
    </>
  );

  return (
    <SocialRow
      profileId={friend.profileId}
      displayName={friend.displayName}
      avatarUrl={friend.avatarUrl}
      status={presence.status}
      live={live}
      meta={meta}
      metaClass={presenceTextClass(presence.status)}
      onOpenProfile={onOpenProfile}
    >
      {/* Primary: join them if there's a table to join. */}
      {showJoin && (
        <Button
          tone="success"
          size="sm"
          disabled={!presence.joinable}
          onClick={() => onJoin(friend.profileId)}
          icon={<DoorOpen size={13} aria-hidden="true" />}
          title={
            presence.joinable
              ? presence.joinAsSpectator
                ? 'Join as spectator'
                : 'Join their game'
              : 'That room can’t take anyone else right now'
          }
          aria-label={`Join ${friend.displayName}`}
        >
          <span className="tiny:hidden">
            {presence.joinAsSpectator ? 'Watch' : 'Join'}
          </span>
        </Button>
      )}

      {/* Invite: labelled when it's the only action, an icon when Join already
          owns the emphasis. */}
      {showInvite &&
        (showJoin ? (
          <IconButton
            tone={invited ? 'primary' : 'info'}
            disabled={invited}
            onClick={() => onInvite(friend.profileId)}
            label={
              invited
                ? `Invite already sent to ${friend.displayName}`
                : `Invite ${friend.displayName} to your table`
            }
            title={invited ? 'Invite sent' : 'Invite to your table'}
          >
            {invited ? <Mailbox size={14} /> : <Send size={14} />}
          </IconButton>
        ) : (
          <Button
            tone="info"
            size="sm"
            disabled={invited}
            onClick={() => onInvite(friend.profileId)}
            icon={invited ? <Mailbox size={13} /> : <Send size={13} />}
            title={invited ? 'Invite sent' : 'Invite to your table'}
            aria-label={
              invited
                ? `Invite already sent to ${friend.displayName}`
                : `Invite ${friend.displayName} to your table`
            }
          >
            <span className="tiny:hidden">{invited ? 'Sent' : 'Invite'}</span>
          </Button>
        ))}

      {/* Destructive, and therefore the quietest thing in the row. */}
      <IconButton
        onClick={() => onRemove(friend.profileId)}
        label={`Remove ${friend.displayName} from friends`}
        title="Remove friend"
        className="hover:!border-rose-400/40 hover:!bg-rose-500/15 hover:!text-rose-300"
      >
        <UserMinus size={14} />
      </IconButton>
    </SocialRow>
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
