'use client';

/**
 * ============================================================================
 *  SocialToasts — lightweight social notifications.
 * ============================================================================
 *
 * "X came online", "Y accepted your friend request", "Z started playing". Sits
 * BELOW the gameplay toast stack (which owns `top-4 … z-[2500]`) and at a lower
 * z-index, so a social nicety can never cover a turn warning or an error the
 * player has to act on.
 *
 * Deliberately styled a shade quieter than the gameplay toasts: same card
 * geometry and the same spring, but a dark glass fill instead of the saturated
 * red/green/blue gradients, because none of these are urgent.
 *
 * Each notification is clickable — it opens the player's profile — which makes
 * "someone added you" a one-tap path to actually doing something about it. The
 * dismissal timer lives in `socialClient`, so a notification's lifetime is the
 * same whether or not this component happens to be mounted.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DoorOpen, Gamepad2, Mail, UserCheck, UserPlus, Wifi, X } from 'lucide-react';
import { useSocialStore } from '../../store/useSocialStore';
import { PresetAvatar } from '../profile/PresetAvatar';
import type { SocialNotificationKind } from '../../types/social';

/** Icon + sentence for each notification kind. `name` is interpolated by the
 *  caller so the wording stays in one place. */
const COPY: Record<
  SocialNotificationKind,
  { icon: React.ComponentType<{ size?: number; className?: string }>; tint: string; line: (name: string) => string }
> = {
  'friend-request-received': { icon: UserPlus, tint: 'text-sky-300', line: (n) => `${n} sent you a friend request` },
  'friend-request-accepted': { icon: UserCheck, tint: 'text-lime-300', line: (n) => `${n} accepted your friend request` },
  'friend-online': { icon: Wifi, tint: 'text-lime-300', line: (n) => `${n} came online` },
  'friend-playing': { icon: Gamepad2, tint: 'text-amber-300', line: (n) => `${n} started a match` },
  'invite-received': { icon: Mail, tint: 'text-sky-300', line: (n) => `${n} invited you to a game` },
  'invite-declined': { icon: X, tint: 'text-white/50', line: (n) => `${n} declined your invite` },
  'friend-joined-room': { icon: DoorOpen, tint: 'text-violet-300', line: (n) => `${n} joined your room` },
};

export const SocialToasts: React.FC = () => {
  const notifications = useSocialStore((s) => s.notifications);
  const dismiss = useSocialStore((s) => s.dismissNotification);
  const openProfile = useSocialStore((s) => s.openProfile);

  return (
    <div
      // Offset below the gameplay stack, and a lower z so gameplay always wins.
      className="fixed top-16 sm:top-4 right-2 sm:right-4 z-[900] flex flex-col gap-2 pointer-events-none max-w-[72vw] sm:max-w-sm w-full safe-x mt-0 sm:mt-0"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {notifications.map((n) => {
          const copy = COPY[n.kind];
          const Icon = copy.icon;
          return (
            <motion.div
              key={n.id}
              layout="position"
              initial={{ opacity: 0, y: -16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.92, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="pointer-events-auto flex items-center gap-2.5 p-2.5 rounded-2xl border-[3px] border-white/70 bg-gradient-to-b from-neutral-800/95 to-neutral-950/95 backdrop-blur-md shadow-[0_5px_0_0_rgba(0,0,0,0.3)]"
            >
              <button
                type="button"
                onClick={() => {
                  openProfile(n.player.profileId);
                  dismiss(n.id);
                }}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                aria-label={`Open ${n.player.displayName}'s profile`}
              >
                <PresetAvatar avatarKey={n.player.avatarUrl} size={30} />
                <span className="min-w-0 flex-1 flex items-center gap-1.5">
                  <Icon size={13} className={`${copy.tint} shrink-0`} />
                  <span className="font-rounded text-[0.7rem] font-bold text-white/90 leading-tight truncate">
                    {copy.line(n.player.displayName)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                className="text-white/40 hover:text-white transition-colors shrink-0"
                aria-label="Dismiss notification"
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default SocialToasts;
