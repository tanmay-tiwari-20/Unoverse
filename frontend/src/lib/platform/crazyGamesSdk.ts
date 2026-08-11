/**
 * ============================================================================
 *  CrazyGames SDK v3 — types + loader.
 * ============================================================================
 *
 * The SDK is delivered as a script on `window.CrazyGames.SDK`, not as an npm
 * package, so there is nothing to install and nothing to bundle. This module
 * declares the slice of its surface Unoverse actually uses and resolves the
 * global once it appears.
 *
 * THE SCRIPT TAG IS RENDERED BY THE DOCUMENT, AND ALSO INJECTED FROM HERE.
 *
 * The portal requires the SDK to be loaded by the game's own HTML, so the static
 * CrazyGames build renders the tag into `index.html` (see
 * `platformHead.crazygames.tsx`). This loader is unchanged by that: it looks for
 * an existing tag with the same `src` first, finds that one, and only waits for
 * the global — the injection path below now covers the case where the document
 * did not provide one.
 *
 * Both sides share `CRAZYGAMES_SDK_SRC`, which matters more than it looks: if the
 * two URLs ever drifted, the `querySelector` check would miss and a second copy
 * of the SDK would be loaded over the first.
 *
 * The URL still never reaches a web build. Both importers of
 * `crazyGamesSdkUrl.ts` sit behind build-time module aliases (`@platform-impl`
 * for this file, `@platform-head` for the tag), so the string is absent from the
 * self-hosted output as a fact about module resolution rather than a question
 * about minifier behaviour.
 *
 * Everything here is typed by hand rather than pulled from a package, so the
 * shapes below are a contract we assert — the adapter treats every call as
 * potentially absent at runtime and guards accordingly.
 */

import { CRAZYGAMES_SDK_SRC } from './crazyGamesSdkUrl';

export type CrazyGamesEnvironment = 'local' | 'crazygames' | 'disabled';

export interface CrazyGamesUser {
  username: string;
  profilePictureUrl?: string;
}

export interface CrazyGamesSettings {
  disableChat?: boolean;
  muteAudio?: boolean;
}

export interface CrazyGamesAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

export interface CrazyGamesSdk {
  environment?: CrazyGamesEnvironment;
  init?: () => Promise<void>;

  game?: {
    settings?: CrazyGamesSettings;
    inviteParams?: Record<string, string>;
    isInstantMultiplayer?: boolean;

    loadingStart?: () => void;
    loadingStop?: () => void;
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    happytime?: () => void;

    getInviteParam?: (key: string) => string | null | undefined;
    inviteLink?: (params: Record<string, string>) => Promise<string> | string;
    updateRoom?: (info: {
      roomId: string;
      isJoinable?: boolean;
      inviteParams?: Record<string, string>;
    }) => void;

    addJoinRoomListener?: (cb: (params: Record<string, string>) => void) => void;
    removeJoinRoomListener?: (cb: (params: Record<string, string>) => void) => void;
    addSettingsChangeListener?: (cb: (settings: CrazyGamesSettings) => void) => void;
    removeSettingsChangeListener?: (cb: (settings: CrazyGamesSettings) => void) => void;
  };

  user?: {
    isUserAccountAvailable?: boolean;
    getUser?: () => Promise<CrazyGamesUser | null>;
    getUserToken?: () => Promise<string>;
    addAuthListener?: (cb: (user: CrazyGamesUser | null) => void) => void;
    removeAuthListener?: (cb: (user: CrazyGamesUser | null) => void) => void;
  };

  data?: {
    getItem?: (key: string) => string | null;
    setItem?: (key: string, value: string) => void;
    removeItem?: (key: string) => void;
  };

  ad?: {
    hasAdblock?: () => Promise<boolean>;
    requestAd?: (type: 'midgame' | 'rewarded', callbacks: CrazyGamesAdCallbacks) => void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSdk };
  }
}

/** The v3 SDK bundle. Only ever requested from inside the CrazyGames chunk. */
const SDK_SRC = CRAZYGAMES_SDK_SRC;

/** How long to wait for the script to attach the SDK global before giving up. */
const SDK_WAIT_TIMEOUT_MS = 10_000;
const SDK_POLL_INTERVAL_MS = 100;

/** In-flight/settled load, so repeated calls never inject a second script tag. */
let loadPromise: Promise<CrazyGamesSdk | null> | null = null;

/**
 * Wait for `window.CrazyGames.SDK` to appear, giving up after the timeout.
 *
 * Polling rather than trusting the script's `onload`: the global is attached by
 * the bundle's own execution, and a load event that fires before the global is
 * assigned would leave us reading `undefined`.
 */
const waitForGlobal = (): Promise<CrazyGamesSdk | null> =>
  new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const sdk = window.CrazyGames?.SDK;
      if (sdk) {
        clearInterval(timer);
        resolve(sdk);
        return;
      }
      if (Date.now() - started >= SDK_WAIT_TIMEOUT_MS) {
        clearInterval(timer);
        resolve(null);
      }
    }, SDK_POLL_INTERVAL_MS);
  });

/**
 * Load the CrazyGames SDK and resolve its global.
 *
 * Resolves to `null` rather than rejecting on any failure — blocked script,
 * offline, timeout, or a CrazyGames build simply being served outside the
 * portal. All of those mean the same thing to the caller ("no platform here"),
 * and the correct response is to fall back to no-ops, not to surface an error.
 */
export const loadCrazyGamesSdk = (): Promise<CrazyGamesSdk | null> => {
  loadPromise ??= (async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }
    if (window.CrazyGames?.SDK) return window.CrazyGames.SDK;

    // The portal may have injected the script itself; don't add a second.
    if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = SDK_SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    return waitForGlobal();
  })();

  return loadPromise;
};
