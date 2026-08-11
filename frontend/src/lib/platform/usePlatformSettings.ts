'use client';

/**
 * ============================================================================
 *  Platform preferences, made observable to React.
 * ============================================================================
 *
 * The adapter holds the live values and learns about changes through an SDK
 * listener — neither of which React can see. This module is the bridge: a
 * module-scoped snapshot the provider pushes into, read through
 * `useSyncExternalStore` so a mid-session toggle on the platform re-renders the
 * components that care.
 *
 * `useSyncExternalStore` and not a zustand store because these values are not
 * the player's and must never be persisted. They are the *platform's* current
 * instruction — the moment they were written into a saved store, they would
 * outlive the session that issued them.
 *
 * SNAPSHOT IDENTITY IS LOAD-BEARING: `getSnapshot` must return the same object
 * until something genuinely changes, or React re-renders forever. Hence the
 * field comparison in the setter rather than an unconditional assignment.
 */

import { useSyncExternalStore } from 'react';
import type { PlatformSettings } from './adapter';

const DEFAULTS: PlatformSettings = { disableChat: false, muteAudio: false };

let snapshot: PlatformSettings = DEFAULTS;

const listeners = new Set<() => void>();

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const getSnapshot = (): PlatformSettings => snapshot;

/**
 * Server snapshot: always the defaults.
 *
 * The platform is a browser-side concern, so the server cannot know its
 * preferences. Rendering "not restricted" and correcting on the client after
 * init matches how the rest of the platform layer behaves — safe default first,
 * real answer a tick later.
 */
const getServerSnapshot = (): PlatformSettings => DEFAULTS;

/** Push new platform preferences. Called by the platform provider only. */
export const setPlatformSettingsSnapshot = (next: PlatformSettings): void => {
  if (
    next.disableChat === snapshot.disableChat &&
    next.muteAudio === snapshot.muteAudio
  ) {
    return;
  }
  snapshot = { disableChat: next.disableChat, muteAudio: next.muteAudio };
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // One broken subscriber must not stop the rest from being told.
    }
  });
};

/** Current platform preferences, re-rendering on change. */
export const usePlatformSettings = (): PlatformSettings =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

/**
 * Whether the platform has asked us to hide chat entirely.
 *
 * Always `false` on web — no platform, nothing to restrict.
 */
export const usePlatformDisablesChat = (): boolean =>
  usePlatformSettings().disableChat;
