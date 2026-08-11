/**
 * ============================================================================
 *  PlatformAdapters — runtime-only, platform-owned, never persisted.
 * ============================================================================
 *
 * A tiny module-scoped store for state the adapter manages on the game's
 * behalf. Everything in here is deliberately RUNTIME-ONLY:
 *
 *   • platformMuted — the platform muted the game (a `muteAudio` preference or
 *     an ad is covering the screen). The volume read site combines this with the
 *     player's own settings; it is NEVER written back into the settings store,
 *     because overwriting `masterVolume = 0` would destroy a saved preference
 *     and unmuting would restore the wrong value.
 *   • adPlaying — whether an ad is on screen right now. `gameplayStop` +
 *     `platformMuted` while it runs; the game resumes identically whether the ad
 *     finished or errored, so both call sites land on the same path.
 *
 * Why a manual module store rather than a zustand slice? The two consumers
 * (sound manager, voice chat) are not React components — they read values from
 * non-render code, so a subscription store buys nothing. The plain module
 * pattern matches how `soundManager` already works.
 */

const state = {
  /** Platform-level mute (preference or ad). Combined at the read site. */
  platformMuted: false,
  /** An ad is currently covering the screen. */
  adPlaying: false,
};

export const platformAdaptersState = {
  isMuted: () => state.platformMuted,
  isAdPlaying: () => state.adPlaying,

  /** Called by the adapter when the platform mute preference changes. */
  setPlatformMuted(muted: boolean) {
    state.platformMuted = muted;
    notify();
  },

  /** Called by the ad flow around `requestAd`. */
  setAdPlaying(playing: boolean) {
    state.adPlaying = playing;
    notify();
  },
};

// ---------------------------------------------------------------------------
// Change notification. The voice mesh has to re-apply its output state when the
// gate flips, because a muted `<audio>` element stays muted until something
// tells it otherwise — unlike the sound manager, which re-reads the gate on
// every play() and therefore needs no subscription.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A broken subscriber must not stop the others from being told.
    }
  });
};

/** Subscribe to gate changes. Returns an unsubscribe function. */
export const subscribeToPlatformAudioGate = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/**
 * THE audio gate. True when the platform requires silence — either the player
 * set the platform's mute preference, or an ad is on screen.
 *
 * Both audio paths consult this: the Web Audio graph in `soundManager` and the
 * WebRTC `<audio>` elements in `useVoiceChat`. Voice does not pass through the
 * sound manager, so a gate applied in only one place would leave teammates
 * audible over an ad.
 */
export const isPlatformAudioMuted = (): boolean =>
  state.platformMuted || state.adPlaying;

export default platformAdaptersState;
