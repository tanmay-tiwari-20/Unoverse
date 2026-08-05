'use client';

/**
 * ============================================================================
 *  InviteToasts — incoming game invitations.
 * ============================================================================
 *
 * A stack of Accept/Decline cards, each with a countdown ring showing how long
 * the invitation has left. Sits bottom-right so it never overlaps the gameplay
 * toast stack (top-right) or the HUD.
 *
 * The countdown is PRESENTATION ONLY. The server owns the invite's lifetime and
 * sends `social:invite-closed` when it expires; the ring reaching zero just makes
 * the card leave a beat earlier rather than the client deciding it has lapsed.
 * Accepting a lapsed invite is therefore still safe — the server refuses it with
 * "That invite has expired." and the panel shows the reason.
 *
 * The ring animates on a 1Hz interval rather than per frame: a countdown does not
 * need 60 re-renders a second, and this keeps the table's frame budget intact.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, DoorOpen, X } from 'lucide-react';
import { useNow } from '../../hooks/useNow';
import { useGameStore } from '../../store/useGameStore';
import { useSocialStore } from '../../store/useSocialStore';
import { acceptInvite, declineInvite } from '../../lib/social/socialClient';
import { PresetAvatar } from '../profile/PresetAvatar';
import { getArenaMeta } from '../../lib/arenas/registry';
import type { InviteView } from '../../types/social';

/** How often the countdown re-renders. One second is as fine as a ring needs. */
const TICK_MS = 1000;

export const InviteToasts: React.FC = () => {
  const invites = useSocialStore((s) => s.invites);
  const socket = useGameStore((s) => s.socket);

  // One shared clock for every card, ticking only while at least one is up —
  // the shared timer stops entirely once the last invitation clears.
  const now = useNow(TICK_MS, invites.length > 0);

  return (
    <div
      className="fixed bottom-3 right-2 sm:bottom-4 sm:right-4 z-[1500] flex flex-col gap-2 pointer-events-none max-w-[80vw] sm:max-w-sm w-full safe-x"
      role="region"
      aria-label="Game invitations"
      aria-live="polite"
    >
      <AnimatePresence>
        {invites.map((invite) => (
          <InviteCard
            key={invite.id}
            invite={invite}
            now={now}
            onAccept={() => acceptInvite(socket, invite.id)}
            onDecline={() => declineInvite(socket, invite.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

function InviteCard({
  invite, now, onAccept, onDecline,
}: {
  invite: InviteView;
  now: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const total = Math.max(1, invite.expiresAt - invite.createdAt);
  const left = Math.max(0, invite.expiresAt - now);
  const seconds = Math.ceil(left / 1000);
  const fraction = Math.max(0, Math.min(1, left / total));

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.94, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className="pointer-events-auto panel-arcade bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl p-3 flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-3">
        {/* Avatar with the countdown ring around it — the timer lives where the
            eye already is, instead of taking its own row. */}
        <span className="relative shrink-0" aria-hidden="true">
          <PresetAvatar avatarKey={invite.from.avatarUrl} size={40} />
          <svg className="absolute -inset-1 -rotate-90" viewBox="0 0 48 48" width={48} height={48}>
            <circle
              cx={24} cy={24} r={22}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={3}
            />
            <circle
              cx={24} cy={24} r={22}
              fill="none"
              stroke={fraction > 0.34 ? '#a3e635' : '#fb923c'}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 22}
              strokeDashoffset={2 * Math.PI * 22 * (1 - fraction)}
              style={{ transition: `stroke-dashoffset ${TICK_MS}ms linear, stroke 300ms linear` }}
            />
          </svg>
        </span>

        <div className="min-w-0 flex-1">
          <div className="font-rounded font-bold text-white text-sm truncate flex items-baseline gap-1.5">
            <span className="truncate">{invite.from.displayName}</span>
            <span className="font-rounded text-[0.6rem] text-white/35 shrink-0">#{invite.from.tag}</span>
          </div>
          <div className="font-rounded text-[0.68rem] text-white/55 truncate flex items-center gap-1">
            <DoorOpen size={11} className="text-white/40 shrink-0" />
            Invited you
            {invite.arena ? ` · ${getArenaMeta(invite.arena).name}` : ''}
          </div>
        </div>

        <span
          className="font-arcade text-sm text-white/60 shrink-0 tabular-nums"
          aria-label={`${seconds} seconds left to respond`}
        >
          {seconds}s
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="btn-arcade flex-1 bg-gradient-to-b from-lime-400 to-green-600 text-white py-2.5 text-[0.68rem] uppercase cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <Check size={13} /> Accept
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="btn-arcade flex-1 bg-gradient-to-b from-neutral-600 to-neutral-800 text-white py-2.5 text-[0.68rem] uppercase cursor-pointer inline-flex items-center justify-center gap-1.5"
        >
          <X size={13} /> Decline
        </button>
      </div>
    </motion.div>
  );
}

export default InviteToasts;
