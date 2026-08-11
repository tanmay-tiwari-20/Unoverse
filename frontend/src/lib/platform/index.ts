/**
 * ============================================================================
 *  Platform resolver — the only place that decides which adapter is live.
 * ============================================================================
 *
 * THE RESOLUTION SEAM IS THE WHOLE POINT. `@platform-impl` is aliased by
 * `next.config.ts` to a real implementation on CrazyGames and to a stub that
 * returns `null` everywhere else, so the SDK-touching code is not merely
 * unreachable in a web build — it is not in the module graph.
 *
 * That distinction is load-bearing and was learned the hard way: a
 * `if (IS_CRAZYGAMES_BUILD) await import('./crazyGamesAdapter')` branch still
 * emitted the chunk, because a bundler builds its graph before it folds
 * constants — and Turbopack then merged that chunk with a module the lobby loads
 * eagerly. The SDK's URL shipped to web players inside dead code. Aliasing at
 * resolution time is what actually removes it.
 *
 * The import stays DYNAMIC so the platform implementation is a separate chunk
 * rather than part of the initial payload.
 *
 * TWO ACCESSORS, ON PURPOSE:
 *   • `initPlatform()`  async, called once from the root provider.
 *   • `getPlatform()`   sync, safe to call from anywhere at any time.
 *
 * `getPlatform()` returns the web no-op adapter until the real one has loaded,
 * which is what lets non-React call sites (the sound manager, the socket
 * listeners) consult the platform without awaiting anything or caring whether
 * init has finished yet.
 */

import type { PlatformAdapter } from './adapter';
import { webAdapter } from './webAdapter';
import { IS_CRAZYGAMES_BUILD } from './target';

let active: PlatformAdapter = webAdapter;
let initPromise: Promise<PlatformAdapter> | null = null;

/**
 * The live adapter. Never null, never throws — before init completes (or after
 * it fails) this is the no-op web adapter, so every caller has something safe
 * to talk to from the first frame.
 */
export const getPlatform = (): PlatformAdapter => active;

/**
 * Resolve and initialise the platform for this build. Idempotent: repeated
 * calls return the same promise, so React double-invoking an effect in
 * development cannot initialise the SDK twice.
 */
export const initPlatform = (): Promise<PlatformAdapter> => {
  initPromise ??= (async () => {
    if (IS_CRAZYGAMES_BUILD) {
      try {
        const mod = await import('@platform-impl');
        const adapter = mod.createPlatformAdapter();
        if (adapter) {
          await adapter.init();
          // Only adopt the platform adapter once it actually came up. A
          // CrazyGames build served outside the portal keeps the web no-ops
          // instead of failing every subsequent call.
          if (adapter.isReady) active = adapter;
        }
      } catch {
        // Chunk failed to load, SDK missing, init rejected — stay on no-ops.
      }
    } else {
      await webAdapter.init();
    }
    return active;
  })();

  return initPromise;
};

export type {
  PlatformAdapter,
  PlatformEnvironment,
  PlatformRoomInfo,
  PlatformSettings,
  PlatformUser,
} from './adapter';
export { CAPABILITIES } from './capabilities';
export type { PlatformCapabilities } from './capabilities';
export { PLATFORM_TARGET, IS_CRAZYGAMES_BUILD } from './target';
export type { PlatformTarget } from './target';
