/**
 * ============================================================================
 *  Persistence engine for the platform in use.
 * ============================================================================
 *
 * Zustand's `persist` middleware takes a storage engine, so swapping WHERE
 * preferences live is a one-line change per store rather than a platform branch
 * inside each one.
 *
 *   web         → localStorage (exactly today's behaviour, same keys)
 *   crazygames  → the platform's own key/value store, so preferences follow the
 *                 player across devices
 *
 * ONE ENGINE AT A TIME, deliberately. On CrazyGames the platform store is the
 * save — we do not also mirror to localStorage, because two independent copies
 * of the same preferences diverge the moment a player switches device, and the
 * platform's guidance is to rely on its module rather than keep a parallel local
 * save of the same data.
 *
 * WHAT MUST NEVER COME THROUGH HERE: bearer credentials. The profile secret and
 * the per-seat reconnect secrets stay out of platform storage — they are proof
 * of ownership, and on CrazyGames the platform token is the identity anyway.
 * `useProfileStore` enforces that in its own `partialize`.
 *
 * Async is the reason this file exists at all: the platform store is
 * promise-based where localStorage is synchronous. Returning promises from every
 * method satisfies both, and `persist` handles the async case natively — with
 * the consequence that rehydration lands a tick later, so anything reading a
 * persisted store on first paint must tolerate defaults for one frame.
 */

import type { StateStorage } from 'zustand/middleware';
import { getPlatform } from './index';
import { CAPABILITIES } from './capabilities';

/**
 * Storage engine bound to the active platform.
 *
 * Failures are swallowed to a null / no-op rather than thrown: a quota error or
 * a disabled data module must degrade to "preferences did not persist this
 * session", never to a crash inside store rehydration.
 */
export const platformStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await getPlatform().getItem(name);
    } catch {
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await getPlatform().setItem(name, value);
    } catch {
      /* see above */
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await getPlatform().removeItem(name);
    } catch {
      /* see above */
    }
  },
};

/**
 * Whether a store should route its persistence through the platform.
 *
 * Web keeps zustand's built-in localStorage engine untouched — the point is that
 * the self-hosted build's persistence path is not just equivalent but literally
 * unchanged, including its synchronous rehydration timing.
 */
export const usePlatformStorage = CAPABILITIES.platformStorage;

export default platformStorage;
