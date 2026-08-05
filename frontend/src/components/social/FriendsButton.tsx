'use client';

/**
 * ============================================================================
 *  FriendsButton — opens the friends drawer, and carries the attention badge.
 * ============================================================================
 *
 * The badge counts only things that need a DECISION — pending incoming requests
 * and live invitations. A friend merely coming online is a notification, not a
 * task, so it deliberately does not light this up; otherwise the badge would be
 * permanently lit and stop meaning anything.
 *
 * Subscribes to two narrow slices and derives the count in a selector, so a
 * presence tick for a friend never re-renders this button.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useSocialStore } from '../../store/useSocialStore';

export interface FriendsButtonProps {
  /** Extra classes for placement — the button brings its own look, not position. */
  className?: string;
  /** Compact icon-only rendering, for the in-game HUD. */
  compact?: boolean;
}

export const FriendsButton: React.FC<FriendsButtonProps> = ({ className = '', compact = false }) => {
  const setPanelOpen = useSocialStore((s) => s.setPanelOpen);
  const panelOpen = useSocialStore((s) => s.panelOpen);
  // Derived in the selector so this only re-renders when the COUNT changes,
  // not whenever either array is replaced by an identical-length one.
  const attention = useSocialStore((s) => s.incoming.length + s.invites.length);
  const friendsOnline = useSocialStore(
    (s) => s.friends.filter((f) => (s.presence[f.profileId] ?? f.presence).status !== 'offline').length
  );

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => setPanelOpen(!panelOpen)}
      aria-label={
        attention > 0
          ? `Friends — ${attention} need${attention === 1 ? 's' : ''} your attention`
          : 'Friends'
      }
      aria-expanded={panelOpen}
      className={`relative chip-arcade flex items-center justify-center gap-2 bg-gradient-to-b from-neutral-700 to-neutral-900 text-white cursor-pointer ${
        compact ? 'w-10 h-10' : 'h-10 px-3'
      } ${className}`}
    >
      <Users size={16} className="shrink-0" />
      {!compact && (
        <span className="font-rounded font-bold text-[0.7rem] uppercase tracking-wide">
          {friendsOnline > 0 ? `${friendsOnline} online` : 'Friends'}
        </span>
      )}

      {attention > 0 && (
        <motion.span
          key={attention}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 420 }}
          className="absolute -top-1.5 -right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center font-arcade text-[0.58rem] text-white shadow-[0_2px_0_0_rgba(0,0,0,0.35)]"
          aria-hidden="true"
        >
          {attention > 9 ? '9+' : attention}
        </motion.span>
      )}
    </motion.button>
  );
};

export default FriendsButton;
