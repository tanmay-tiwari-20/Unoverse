'use client';

/**
 * ============================================================================
 *  PresenceDot — the one place a presence status becomes a colour and a word.
 * ============================================================================
 *
 * Every friend card, search row and profile header renders status through this
 * component, so "Playing" is the same amber everywhere and a new status only has
 * to be styled once.
 *
 * The status itself is NEVER derived here. It arrives already decided by the
 * server (`PresenceView.status`), which reads it from the socket it holds and the
 * room it owns. This file only picks a swatch and a label.
 */

import React from 'react';
import type { PresenceStatus } from '../../types/social';

/** Colour + wording for each status, ordered most → least reachable. */
const LOOK: Record<PresenceStatus, { dot: string; text: string; label: string; ring: string }> = {
  playing: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Playing', ring: 'shadow-[0_0_0_3px_rgba(251,191,36,0.22)]' },
  lobby: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'In Lobby', ring: 'shadow-[0_0_0_3px_rgba(56,189,248,0.22)]' },
  watching: { dot: 'bg-violet-400', text: 'text-violet-300', label: 'Watching', ring: 'shadow-[0_0_0_3px_rgba(167,139,250,0.22)]' },
  online: { dot: 'bg-lime-400', text: 'text-lime-300', label: 'Online', ring: 'shadow-[0_0_0_3px_rgba(163,230,53,0.22)]' },
  away: { dot: 'bg-yellow-500/80', text: 'text-yellow-200/80', label: 'Away', ring: '' },
  offline: { dot: 'bg-white/25', text: 'text-white/40', label: 'Offline', ring: '' },
};

/** True when a status means "reachable right now" — used for pulse + ordering. */
export function isLive(status: PresenceStatus): boolean {
  return status !== 'offline' && status !== 'away';
}

export function presenceLabel(status: PresenceStatus): string {
  return LOOK[status].label;
}

export function presenceTextClass(status: PresenceStatus): string {
  return LOOK[status].text;
}

export interface PresenceDotProps {
  status: PresenceStatus;
  /** Diameter in px. Defaults to a card-sized 9. */
  size?: number;
  /** Adds a soft halo — used on avatars, skipped in dense text rows. */
  halo?: boolean;
  className?: string;
}

/**
 * A single status swatch. Decorative: the adjacent text carries the meaning, so
 * this is hidden from assistive tech rather than announced twice.
 */
export const PresenceDot: React.FC<PresenceDotProps> = ({
  status,
  size = 9,
  halo = false,
  className = '',
}) => {
  const look = LOOK[status];
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full border-2 border-black/45 shrink-0 ${look.dot} ${halo ? look.ring : ''} ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default PresenceDot;
