/**
 * ============================================================================
 *  Platform implementation seam — CRAZYGAMES side.
 * ============================================================================
 *
 * `next.config.ts` aliases `@platform-impl` here only when
 * `NEXT_PUBLIC_PLATFORM=crazygames`. In every other build this file is not in
 * the module graph at all, so nothing it transitively imports — the adapter, the
 * SDK loader, the SDK's URL — can reach the output.
 *
 * See `platformImpl.web.ts` for why the alias exists rather than a plain branch.
 */

import type { PlatformAdapter } from './adapter';
import { createCrazyGamesAdapter } from './crazyGamesAdapter';

export const createPlatformAdapter = (): PlatformAdapter | null =>
  createCrazyGamesAdapter();
