'use client';

/**
 * ============================================================================
 *  SocialLayer — the single mount point for the whole social UI.
 * ============================================================================
 *
 * One component to drop into a page. It renders the drawer, the profile modal,
 * the invitation cards and the notification stack, and it owns the one piece of
 * behaviour that cannot live in a plain socket callback: ROUTING.
 *
 * WHY ROUTING IS HERE. `social:join-target` arrives in `socialClient`, which has
 * no router — it is a module, not a component. So it emits the ordinary
 * `join-room` (keeping the game's join gate authoritative) and parks the
 * destination in `pendingJoin`. This component watches that field and performs
 * the `router.push`, which is exactly the same navigation the landing page does
 * when you create or join a room by code. No new join path is introduced.
 *
 * MOUNTING. Safe to mount on more than one route — only one route is ever
 * mounted at a time, and all state lives in the store, so nothing is duplicated
 * or lost across a navigation. The socket listeners are attached once by
 * `useSocket`, independently of whether this is on screen.
 */

import React, { useEffect } from 'react';
import { usePlatformRouter } from '../../hooks/usePlatformRouter';
import { useGameStore } from '../../store/useGameStore';
import { useProfileStore } from '../../store/useProfileStore';
import { useSocialStore } from '../../store/useSocialStore';
import { lobbyHref } from '../../lib/platform/routes';
import { FriendsPanel } from './FriendsPanel';
import { PlayerProfileModal } from './PlayerProfileModal';
import { InviteToasts } from './InviteToasts';
import { SocialToasts } from './SocialToasts';

export const SocialLayer: React.FC = () => {
  const router = usePlatformRouter();

  const pendingJoin = useSocialStore((s) => s.pendingJoin);
  const setPendingJoin = useSocialStore((s) => s.setPendingJoin);
  const setPanelOpen = useSocialStore((s) => s.setPanelOpen);
  const openProfile = useSocialStore((s) => s.openProfile);

  // Navigate to a destination the server resolved. `join-room` has already been
  // emitted by `socialClient`; this only moves the browser to the route that
  // renders it, using the same URL shape the landing page builds.
  useEffect(() => {
    if (!pendingJoin) return;
    const name = useProfileStore.getState().displayName?.trim();
    setPendingJoin(null);
    // Close whatever the player was looking at — they're going somewhere now.
    setPanelOpen(false);
    openProfile(null);
    if (!name) return;
    router.push(lobbyHref(pendingJoin.roomCode, name));
  }, [pendingJoin, router, setPendingJoin, setPanelOpen, openProfile]);

  // A social panel left open across a disconnect would show a stale graph, so
  // the drawer closes when the connection drops. The graph itself is left alone:
  // `social:hello` on reconnect replaces it wholesale.
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  useEffect(() => {
    if (connectionStatus === 'disconnected') setPanelOpen(false);
  }, [connectionStatus, setPanelOpen]);

  return (
    <>
      <FriendsPanel />
      <PlayerProfileModal />
      <InviteToasts />
      <SocialToasts />
    </>
  );
};

export default SocialLayer;
