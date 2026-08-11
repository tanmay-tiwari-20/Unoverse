/**
 * ============================================================================
 *  Web adapter — the self-hosted build. Every method is a no-op.
 * ============================================================================
 *
 * This is what makes the platform layer free on web: there is no SDK, no
 * network call, no listener and no async work anywhere in this file, so wiring
 * the adapter into the shared code costs the web build nothing but a function
 * call that returns immediately.
 *
 * Storage is the one method with real behaviour, and it deliberately delegates
 * to `localStorage` so the persisted stores keep working exactly as they do
 * today when they route through the platform port.
 */

import type { PlatformAdapter, PlatformSettings, PlatformUser } from './adapter';

const NO_SETTINGS: PlatformSettings = { disableChat: false, muteAudio: false };

/** Unsubscribe placeholder for the listener methods no platform backs here. */
const noopUnsubscribe = () => {};

export const webAdapter: PlatformAdapter = {
  environment: 'web',
  isReady: true,
  isInstantMultiplayer: false,

  async init() {
    // Nothing to bring up. Present so callers need no platform branch.
  },

  loadingStart() {},
  loadingStop() {},
  gameplayStart() {},
  gameplayStop() {},
  happytime() {},

  async getUser(): Promise<PlatformUser | null> {
    // Web identity is Unoverse's own profile system, not a platform account.
    return null;
  },

  async getUserToken() {
    return null;
  },

  onAuthChange() {
    return noopUnsubscribe;
  },

  getSettings() {
    return NO_SETTINGS;
  },

  onSettingsChange() {
    return noopUnsubscribe;
  },

  updateRoom() {},
  clearRoom() {},

  getInviteParam() {
    // Web invites travel as `?room=CODE` and are read by the landing route
    // itself — there is no platform layer to consult here.
    return null;
  },

  async inviteLink() {
    // Signals "no platform link"; the invite UI keeps using its own URL.
    return null;
  },

  onJoinRoom() {
    return noopUnsubscribe;
  },

  async getItem(key: string) {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Private mode / storage disabled — treat as "nothing stored".
      return null;
    }
  },

  async setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota or private mode. Preferences are not worth failing a session over.
    }
  },

  async removeItem(key: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* see setItem */
    }
  },

  async hasAdblock() {
    // No ads on the web build, so the answer can't matter.
    return false;
  },

  async showMidgameAd() {
    // No ads on web. Resolving immediately means the caller's resume path runs
    // exactly as it would after a real ad, with no special-casing.
  },
};

export default webAdapter;
