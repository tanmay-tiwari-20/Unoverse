'use client';

/**
 * ============================================================================
 *  PlatformProvider — brings the platform up, once, for the whole app.
 * ============================================================================
 *
 * Mounted in the root layout. Renders nothing: it exists so that exactly one
 * place in the app owns platform initialisation and the subscriptions that have
 * to outlive any single route.
 *
 * On web every call in here is a no-op that returns immediately, so the cost to
 * the self-hosted build is one effect that does nothing.
 *
 * WHY THE SUBSCRIPTIONS LIVE HERE and not in the components that consume them:
 * the platform can change its mind at any moment (a player toggling mute or chat
 * in the portal UI, signing in mid-session), and those signals must be captured
 * whether or not the component that cares happens to be mounted. A listener
 * attached inside the lobby would miss a change made on the home screen.
 */

import React, { useEffect } from 'react';
import { getPlatform, initPlatform } from '../../lib/platform';
import { setPlatformSettingsSnapshot } from '../../lib/platform/usePlatformSettings';
import { usePlatformSignIn } from '../../hooks/usePlatformSignIn';

export const PlatformProvider: React.FC = () => {
  // Platform sign-in lives at the root for the same reason the listeners do: the
  // player can sign in from the portal chrome at any moment, on any screen.
  usePlatformSignIn();

  useEffect(() => {
    let cancelled = false;
    let unsubscribeSettings: (() => void) | null = null;

    // Bracket the work we actually control at boot. `initPlatform` is
    // idempotent, so React re-invoking this effect in development cannot start
    // the SDK twice — but the loading pair must still be balanced per run.
    const platform = getPlatform();
    platform.loadingStart();

    void initPlatform().then((adapter) => {
      adapter.loadingStop();
      if (cancelled) return;

      // Seed from the platform's current answer, then follow it. Seeding first
      // matters: a player who already had mute on before opening the game gets
      // silence from the start rather than after their first toggle.
      setPlatformSettingsSnapshot(adapter.getSettings());
      unsubscribeSettings = adapter.onSettingsChange(setPlatformSettingsSnapshot);
    });

    return () => {
      cancelled = true;
      unsubscribeSettings?.();
    };
  }, []);

  return null;
};

export default PlatformProvider;
