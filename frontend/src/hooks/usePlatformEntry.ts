'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { initPlatform, CAPABILITIES } from '../lib/platform';
import { lobbyHref } from '../lib/platform/routes';
import { useProfileStore } from '../store/useProfileStore';
import { BACKEND_URL } from '../lib/config';
import { logger } from '../utils/logger';

/**
 * ============================================================================
 *  Platform entry — invites and Instant Multiplayer.
 * ============================================================================
 *
 * Two ways CrazyGames can put a player somewhere other than the home screen:
 *
 *   1. AN INVITE. Either present at launch (`getInviteParam('room')`) or arriving
 *      mid-session when a friend's invite is accepted (`onJoinRoom`).
 *   2. INSTANT MULTIPLAYER. The portal asks us to drop the player straight into
 *      a joinable room.
 *
 * Both end at the SAME lobby the web build uses, through `lobbyHref` — which is
 * the platform's own URL shape for it (`/?lobby=CODE` in the static CrazyGames
 * package, `/lobby/CODE` on web) rendering the SAME `<LobbyRoom>`. There is no
 * second join path, no second room concept, and no platform branch inside the
 * lobby itself — this hook only decides where to navigate.
 *
 * INSTANT MULTIPLAYER CREATES A **PRIVATE** ROOM, not a Quick Play one. Quick
 * Play drops you into a public lobby with strangers; the platform's contract is
 * "a joinable place for this player and the friends they invite", which is a
 * private room advertised through `updateRoom()`. The room publisher then makes
 * it visible to the platform, so the invite loop closes without Unoverse ever
 * matchmaking the player into someone else's table.
 *
 * The home screen is left intact for every other case — a CrazyGames player who
 * arrives normally sees exactly what a web player sees.
 */
export const usePlatformEntry = (): void => {
  const router = useRouter();

  // Guards against a double navigation: React may run this effect twice in
  // development, and a late invite must not fight a navigation already underway.
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!CAPABILITIES.instantMultiplayer) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    /** The name to seat this player under, from their profile when they have one. */
    const seatName = (): string => {
      const { displayName } = useProfileStore.getState();
      return (displayName || 'Player').trim().slice(0, 20);
    };

    const goToRoom = (code: string) => {
      if (cancelled || navigatedRef.current) return;
      navigatedRef.current = true;
      router.push(lobbyHref(code.toUpperCase(), seatName()));
    };

    /**
     * Create the private room Instant Multiplayer expects. Failure is not fatal:
     * the player simply lands on the home screen and can start a game themselves,
     * which is strictly better than an error on an otherwise blank first frame.
     */
    const startInstantMultiplayer = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arena: 'random', visibility: 'private' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.code) goToRoom(data.code);
      } catch (err) {
        logger.warn('[Platform] Instant Multiplayer room creation failed:', err);
      }
    };

    void initPlatform().then((platform) => {
      if (cancelled) return;

      // A mid-session invite acceptance can arrive at any time, so the listener
      // is attached before anything else is decided.
      unsubscribe = platform.onJoinRoom((params) => {
        const code = params?.room;
        if (typeof code === 'string' && code) goToRoom(code);
      });

      // An invite present at launch wins over Instant Multiplayer: the player
      // followed a link to a SPECIFIC table, and sending them to a fresh room
      // instead would silently discard what they clicked on.
      const invited = platform.getInviteParam('room');
      if (invited) {
        goToRoom(invited);
        return;
      }

      if (platform.isInstantMultiplayer) void startInstantMultiplayer();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router]);
};
