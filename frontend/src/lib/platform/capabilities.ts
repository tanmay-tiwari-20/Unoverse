/**
 * ============================================================================
 *  Platform capabilities — what this build is allowed to surface.
 * ============================================================================
 *
 * The point of this table is that feature gating reads as a CAPABILITY rather
 * than as a platform check. A component asks "may I show a fullscreen button?",
 * not "am I on CrazyGames?" — so the shared UI never accumulates platform
 * conditionals, and adding a third platform later touches this file only.
 *
 * Nothing here removes functionality from the codebase. `useFullscreen` and the
 * PWA registration both still exist and still work; these flags only decide
 * whether they are surfaced. That distinction matters: the web build must keep
 * every feature it has today, byte for byte.
 */

import { IS_CRAZYGAMES_BUILD } from './target';

export interface PlatformCapabilities {
  /**
   * Show Unoverse's own fullscreen toggle. CrazyGames PROHIBITS custom
   * fullscreen buttons — the portal provides its own control — so the two call
   * sites are hidden there while the hook stays intact for web.
   */
  customFullscreen: boolean;

  /**
   * Register the service worker + expose PWA install metadata. Disabled on
   * CrazyGames: a stale `unoverse-cache-v2` inside the portal iframe would
   * serve an old build and be painful to diagnose through an embed.
   */
  pwa: boolean;

  /** Vercel Analytics. Web deployment only — it is our own hosting concern. */
  analytics: boolean;

  /** Platform ads are available (CrazyGames SDK only — never a third party). */
  ads: boolean;

  /**
   * Persist small user preferences through the platform instead of
   * localStorage, so they follow the player across devices.
   */
  platformStorage: boolean;

  /**
   * The platform owns invites: room state is published to it and invite links
   * are minted by it, replacing the `?room=CODE` share link.
   */
  platformInvites: boolean;

  /**
   * The platform may ask us to drop a player straight into a joinable room,
   * skipping the home screen.
   */
  instantMultiplayer: boolean;

  /**
   * WebRTC voice chat.
   *
   * UNVERIFIED ON CRAZYGAMES. `getUserMedia` inside a cross-origin iframe needs
   * `allow="microphone"` on the PORTAL's iframe, which we do not control. Left
   * ON so Preview testing exercises the real path; flip to
   * `!IS_CRAZYGAMES_BUILD` if the permission turns out to be unavailable. The
   * voice hook already degrades honestly (it checks for `getUserMedia` and
   * toasts on denial), so the worst case is a disabled feature, not a break.
   */
  voiceChat: boolean;
}

export const CAPABILITIES: PlatformCapabilities = {
  customFullscreen: !IS_CRAZYGAMES_BUILD,
  pwa: !IS_CRAZYGAMES_BUILD,
  analytics: !IS_CRAZYGAMES_BUILD,
  ads: IS_CRAZYGAMES_BUILD,
  platformStorage: IS_CRAZYGAMES_BUILD,
  platformInvites: IS_CRAZYGAMES_BUILD,
  instantMultiplayer: IS_CRAZYGAMES_BUILD,
  voiceChat: true,
};

export default CAPABILITIES;
