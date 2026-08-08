'use client';

/**
 * ============================================================================
 *  PlayerIdTag — the one place a Player ID becomes visible text.
 * ============================================================================
 *
 * A Player ID is the permanent, server-minted identity of a profile. Display
 * names are NOT unique — two players may both be "Tanmay" — so every surface
 * that lists players (friends, search, requests, invites, player cards,
 * profiles) renders the ID beside the name to tell them apart.
 *
 * The styling is deliberately recessive: smaller, muted, tabular. The name is
 * what a player reads; the ID is what they check when two names collide. Both
 * variants keep that hierarchy — `copyable` only adds the affordance, not weight.
 */

import React from 'react';
import { Check, Copy } from 'lucide-react';

export interface PlayerIdTagProps {
  /** The permanent Player ID. Rendered with a leading `#`. */
  id: string | null | undefined;
  /** Turns the tag into a click-to-copy button. Used on profile headers. */
  copyable?: boolean;
  /** Tailwind text-size class. Defaults to the dense-row size. */
  size?: string;
  className?: string;
}

export const PlayerIdTag: React.FC<PlayerIdTagProps> = ({
  id,
  copyable = false,
  size = 'text-[0.62rem]',
  className = '',
}) => {
  const [copied, setCopied] = React.useState(false);
  if (!id) return null;

  const label = `#${id}`;
  const base = `font-rounded text-white/40 tabular-nums shrink-0 ${size} ${className}`;

  if (!copyable) {
    return (
      <span className={base} title={`Player ID ${label}`}>
        {label}
      </span>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context, denied permission) — the
      // id is short enough to read and retype, so this stays a silent no-op.
    }
  };

  return (
    <button
      onClick={copy}
      className={`${base} inline-flex items-center gap-1 hover:text-white/70 transition-colors cursor-pointer`}
      title={`Copy Player ID ${label}`}
      aria-label={`Copy Player ID ${id}`}
    >
      {label}
      {copied ? <Check size={11} className="text-lime-400" /> : <Copy size={11} className="opacity-60" />}
    </button>
  );
};

export default PlayerIdTag;
