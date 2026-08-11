'use client';

import { useEffect, useState } from 'react';
import { getPlatform, CAPABILITIES } from '../lib/platform';

/**
 * ============================================================================
 *  The shareable link for a room, resolved per platform.
 * ============================================================================
 *
 * On the web this is the `?room=CODE` deep link the landing page already reads.
 * On CrazyGames it must be the platform's own invite link — a raw link to our
 * domain would take the recipient out of the portal, which is exactly what the
 * platform's invite API exists to prevent.
 *
 * Returns the web link immediately and swaps in the platform link once it
 * resolves, so the invite sheet always has something real to show and copy. If
 * the platform cannot produce one, the web link stands rather than leaving the
 * player with nothing to send.
 *
 * `enabled` lets the caller hold off until the sheet is actually open — no point
 * asking the platform for a link nobody has asked to see.
 */
export const usePlatformInviteLink = (roomCode: string, enabled = true): string => {
  const code = roomCode.toUpperCase();

  const webLink =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/?room=${encodeURIComponent(code)}`;

  // Stored WITH the code it belongs to, so a room change falls back to the web
  // link immediately instead of briefly offering an invite to the previous room.
  const [resolved, setResolved] = useState<{ code: string; link: string } | null>(null);

  useEffect(() => {
    if (!enabled || !code || !CAPABILITIES.platformInvites) return;

    let cancelled = false;
    void getPlatform()
      .inviteLink({ room: code })
      .then((platformLink) => {
        if (!cancelled && platformLink) setResolved({ code, link: platformLink });
      });

    return () => {
      cancelled = true;
    };
  }, [code, enabled]);

  return resolved?.code === code ? resolved.link : webLink;
};
