/**
 * ============================================================================
 *  CrazyGames adapter — THE ONLY MODULE THAT TOUCHES THE PLATFORM SDK.
 * ============================================================================
 *
 * Reached exclusively through the dynamic import in `platform/index.ts`, which
 * sits behind a build-time constant. Nothing may import this file statically:
 * doing so would pull the SDK loader — and its script URL — into the web bundle
 * and defeat the entire arrangement.
 *
 * HOW THIS FILE HANDLES FAILURE, everywhere, without exception: every method
 * guards the SDK member it needs and wraps the call, returning the same safe
 * default the web no-op would. The platform is a third party embedded in an
 * iframe; an SDK that is missing, half-initialised, blocked by an extension, or
 * throwing `{code, message}` must cost the player a *feature*, never a game.
 * That is why there is a `safe()` helper below and why it is used unfailingly.
 *
 * TWO GATES DECIDE WHETHER THIS ADAPTER GOES LIVE:
 *   1. build-time — `NEXT_PUBLIC_PLATFORM=crazygames` (in `index.ts`)
 *   2. run-time   — `SDK.environment !== 'disabled'` (here, in `init`)
 * A CrazyGames build served somewhere unexpected fails the second gate, reports
 * `isReady: false`, and the resolver keeps the web no-ops instead of adopting a
 * platform that cannot answer.
 */

import type {
  PlatformAdapter,
  PlatformEnvironment,
  PlatformRoomInfo,
  PlatformSettings,
  PlatformUser,
} from './adapter';
import { platformAdaptersState } from './platformAdaptersState';
import {
  loadCrazyGamesSdk,
  type CrazyGamesSdk,
  type CrazyGamesSettings,
  type CrazyGamesUser,
} from './crazyGamesSdk';

const DEFAULT_SETTINGS: PlatformSettings = { disableChat: false, muteAudio: false };

/** Unsubscribe placeholder returned when a listener could not be attached. */
const noopUnsubscribe = () => {};

/**
 * Run an SDK call, swallowing anything it throws.
 *
 * The SDK rejects with `{code, message}` objects rather than `Error`s, so there
 * is nothing useful to branch on at these call sites — every failure code means
 * the same thing here ("that didn't work, carry on"). Handling them uniformly is
 * the honest response, not a shortcut.
 */
const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Async twin of `safe`, for the promise-returning half of the SDK. */
const safeAsync = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

/** Normalise the SDK's settings shape, treating "absent" as "not restricted". */
const toSettings = (raw: CrazyGamesSettings | undefined): PlatformSettings => ({
  disableChat: raw?.disableChat === true,
  muteAudio: raw?.muteAudio === true,
});

/** Normalise the SDK user to the two fields Unoverse actually renders. */
const toUser = (raw: CrazyGamesUser | null | undefined): PlatformUser | null =>
  raw?.username
    ? { username: raw.username, profilePictureUrl: raw.profilePictureUrl ?? null }
    : null;

export const createCrazyGamesAdapter = (): PlatformAdapter => {
  let sdk: CrazyGamesSdk | null = null;
  let ready = false;
  let environment: PlatformEnvironment = 'disabled';
  let instantMultiplayer = false;

  /**
   * Last known platform preferences.
   *
   * Cached because `getSettings()` is synchronous — it is read from render paths
   * and from the audio gate — while the SDK delivers updates through a listener.
   * The cache is the listener's output, never a guess.
   */
  let settings: PlatformSettings = DEFAULT_SETTINGS;

  /** The room currently published to the platform, for the withdraw path. */
  let publishedRoomId: string | null = null;

  /**
   * Mirror the platform's mute preference into the runtime audio gate.
   *
   * Deliberately NOT written into the user's settings store: `masterVolume` is
   * the player's own saved preference, and overwriting it would both destroy
   * that value and restore the wrong one on unmute. The gate is combined at the
   * point where volume is read instead.
   */
  const publishMute = () => {
    platformAdaptersState.setPlatformMuted(settings.muteAudio);
  };

  return {
    get environment() {
      return environment;
    },
    get isReady() {
      return ready;
    },
    get isInstantMultiplayer() {
      return instantMultiplayer;
    },

    async init() {
      sdk = await loadCrazyGamesSdk();
      if (!sdk) return; // Script blocked or never arrived — stay unready.

      // v3 requires an explicit init before any other call is legal.
      const initialised = await safeAsync(async () => {
        await sdk?.init?.();
        return true;
      }, false);
      if (!initialised) return;

      environment = sdk.environment ?? 'disabled';

      // `local` is the SDK's own development mode and behaves like the portal
      // with stubbed responses, so it is treated as live. `disabled` means the
      // APIs are genuinely unavailable and we must not pretend otherwise.
      if (environment === 'disabled') return;

      instantMultiplayer = sdk.game?.isInstantMultiplayer === true;
      settings = toSettings(sdk.game?.settings);
      publishMute();

      ready = true;
    },

    // ---- Loading lifecycle -------------------------------------------------
    loadingStart() {
      safe(() => sdk?.game?.loadingStart?.(), undefined);
    },
    loadingStop() {
      safe(() => sdk?.game?.loadingStop?.(), undefined);
    },

    // ---- Gameplay lifecycle ------------------------------------------------
    gameplayStart() {
      safe(() => sdk?.game?.gameplayStart?.(), undefined);
    },
    gameplayStop() {
      safe(() => sdk?.game?.gameplayStop?.(), undefined);
    },

    happytime() {
      safe(() => sdk?.game?.happytime?.(), undefined);
    },

    // ---- Identity ----------------------------------------------------------
    async getUser() {
      if (!sdk?.user?.isUserAccountAvailable) return null;
      return safeAsync(async () => toUser(await sdk?.user?.getUser?.()), null);
    },

    /**
     * Fetch a fresh signed token for the backend to verify.
     *
     * Never cached, by instruction and by sense: these are short-lived, and a
     * stored copy is a credential sitting in memory long after it was needed.
     * Callers ask for one at the moment they authenticate.
     */
    async getUserToken() {
      if (!sdk?.user?.isUserAccountAvailable) return null;
      return safeAsync(async () => (await sdk?.user?.getUserToken?.()) ?? null, null);
    },

    onAuthChange(cb) {
      const user = sdk?.user;
      if (!user?.addAuthListener) return noopUnsubscribe;

      const handler = (raw: CrazyGamesUser | null) => {
        try {
          cb(toUser(raw));
        } catch {
          // A throwing subscriber must not break the SDK's listener chain.
        }
      };

      const attached = safe(() => {
        user.addAuthListener?.(handler);
        return true;
      }, false);
      if (!attached) return noopUnsubscribe;

      return () => safe(() => user.removeAuthListener?.(handler), undefined);
    },

    // ---- Platform preferences ----------------------------------------------
    getSettings() {
      return settings;
    },

    onSettingsChange(cb) {
      const game = sdk?.game;
      if (!game?.addSettingsChangeListener) return noopUnsubscribe;

      const handler = (raw: CrazyGamesSettings) => {
        settings = toSettings(raw);
        publishMute();
        try {
          cb(settings);
        } catch {
          /* see onAuthChange */
        }
      };

      const attached = safe(() => {
        game.addSettingsChangeListener?.(handler);
        return true;
      }, false);
      if (!attached) return noopUnsubscribe;

      return () => safe(() => game.removeSettingsChangeListener?.(handler), undefined);
    },

    // ---- Rooms & invites ---------------------------------------------------
    updateRoom(info: PlatformRoomInfo) {
      publishedRoomId = info.roomId;
      safe(
        () =>
          sdk?.game?.updateRoom?.({
            roomId: info.roomId,
            isJoinable: info.isJoinable,
            inviteParams: info.inviteParams,
          }),
        undefined,
      );
    },

    /**
     * Withdraw the room.
     *
     * Expressed as "the room you know about is no longer joinable" rather than
     * through a dedicated teardown call, because `updateRoom` is the documented
     * surface and inventing a method to fit our port would be worse than using
     * the one that exists. The player-visible effect is the one that matters:
     * the platform stops routing newcomers here.
     */
    clearRoom() {
      if (!publishedRoomId) return;
      const roomId = publishedRoomId;
      publishedRoomId = null;
      safe(
        () => sdk?.game?.updateRoom?.({ roomId, isJoinable: false, inviteParams: {} }),
        undefined,
      );
    },

    getInviteParam(key: string) {
      return safe(() => sdk?.game?.getInviteParam?.(key) ?? null, null);
    },

    async inviteLink(params: Record<string, string>) {
      return safeAsync(async () => {
        const link = await sdk?.game?.inviteLink?.(params);
        return typeof link === 'string' && link ? link : null;
      }, null);
    },

    onJoinRoom(cb) {
      const game = sdk?.game;
      if (!game?.addJoinRoomListener) return noopUnsubscribe;

      const handler = (params: Record<string, string>) => {
        try {
          cb(params ?? {});
        } catch {
          /* see onAuthChange */
        }
      };

      const attached = safe(() => {
        game.addJoinRoomListener?.(handler);
        return true;
      }, false);
      if (!attached) return noopUnsubscribe;

      return () => safe(() => game.removeJoinRoomListener?.(handler), undefined);
    },

    // ---- Storage -----------------------------------------------------------
    // The platform's data module is synchronous; the port is async because the
    // web engine may not be. Wrapping is free and keeps one shape for callers.
    async getItem(key: string) {
      return safe(() => sdk?.data?.getItem?.(key) ?? null, null);
    },

    async setItem(key: string, value: string) {
      // Over-quota (1 MB) and a disabled data module both throw. Neither is
      // worth failing a session over — the write is simply lost, exactly as a
      // localStorage quota error would be.
      safe(() => sdk?.data?.setItem?.(key, value), undefined);
    },

    async removeItem(key: string) {
      safe(() => sdk?.data?.removeItem?.(key), undefined);
    },

    // ---- Ads ---------------------------------------------------------------
    async hasAdblock() {
      return safeAsync(async () => (await sdk?.ad?.hasAdblock?.()) === true, false);
    },

    /**
     * Show a between-matches ad and resolve once the game may carry on.
     *
     * THE RESOLUTION CONTRACT IS THE IMPORTANT PART: this resolves whether the
     * ad played, was unfilled, was blocked, was on cooldown, or errored in a way
     * nobody anticipated. The caller has one resume path, cannot distinguish the
     * cases, and therefore cannot accidentally grant a reward for an ad that
     * never ran. Nothing here rewards anything — that is by design, not omission.
     *
     * Muting is handled here rather than at the call site so no future caller
     * can forget it: Unoverse keeps running underneath the ad (it is real-time
     * multiplayer — the table does not pause for one player), so audio bleeding
     * over an ad is a real and easy mistake.
     */
    showMidgameAd(hooks: { onStart?: () => void; onFinish?: () => void }): Promise<void> {
      const requestAd = sdk?.ad?.requestAd;
      if (!requestAd) return Promise.resolve();

      return new Promise<void>((resolve) => {
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          platformAdaptersState.setAdPlaying(false);
          try {
            hooks.onFinish?.();
          } catch {
            /* the resume path must run even if the caller's hook throws */
          }
          resolve();
        };

        const started = safe(() => {
          requestAd.call(sdk?.ad, 'midgame', {
            adStarted: () => {
              platformAdaptersState.setAdPlaying(true);
              try {
                hooks.onStart?.();
              } catch {
                /* an ad that started must still be able to finish */
              }
            },
            adFinished: finish,
            adError: finish,
          });
          return true;
        }, false);

        // A synchronous throw from `requestAd` means no callback will ever come.
        if (!started) finish();
      });
    },
  };
};

export default createCrazyGamesAdapter;
