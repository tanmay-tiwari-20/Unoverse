'use client';

import { useEffect } from 'react';
import { getPlatform, initPlatform, CAPABILITIES } from '../lib/platform';
import { useProfileStore } from '../store/useProfileStore';

/**
 * ============================================================================
 *  Platform sign-in — exchange a platform token for the Unoverse identity.
 * ============================================================================
 *
 * On CrazyGames the player may already be signed in to the platform. If so, we
 * ask the SDK for a short-lived token and let the BACKEND decide which Unoverse
 * profile it proves — the client never claims an identity for itself.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *  • It never shows an auth prompt. A player who is not signed in keeps playing
 *    as a guest exactly as they do on the web; interrupting them with a platform
 *    login on load is the behaviour the integration review ruled out.
 *  • It never overwrites an identity with nothing. A failed or absent token
 *    leaves whatever profile the player already had — a platform hiccup must not
 *    cost someone their stats.
 *  • It never stores the token. It is requested, sent once, and dropped;
 *    `getUserToken()` is called again next time authentication is needed.
 *
 * `onAuthChange` covers signing in mid-session, which is the case that actually
 * matters: the player starts as a guest, signs into CrazyGames, and should come
 * back as their real profile without a reload.
 */
export const usePlatformSignIn = (): void => {
  useEffect(() => {
    // Web builds have no platform accounts; the whole path is inert there, and
    // the capability check keeps this hook honest rather than relying on the
    // adapter's no-ops to silently do nothing.
    if (!CAPABILITIES.platformInvites) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const exchange = async () => {
      const platform = getPlatform();
      if (!platform.isReady) return;
      const token = await platform.getUserToken();
      if (!token || cancelled) return;
      await useProfileStore.getState().signInWithPlatformToken(token);
    };

    // Wait for init rather than reading `getPlatform()` immediately: this hook
    // mounts in the same tick as the provider that initialises the platform, so
    // asking for a token first would always find the no-op adapter.
    void initPlatform().then(() => {
      if (cancelled) return;
      void exchange();
      unsubscribe = getPlatform().onAuthChange((user) => {
        // Sign-OUT is not acted on: the player keeps the Unoverse profile they
        // are mid-session with. Dropping their identity here would eject them
        // from a running match over a platform-side event.
        if (user) void exchange();
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
};
