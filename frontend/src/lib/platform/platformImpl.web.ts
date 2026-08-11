/**
 * ============================================================================
 *  Platform implementation seam — WEB side. Deliberately empty.
 * ============================================================================
 *
 * `next.config.ts` aliases `@platform-impl` to this file for every build that is
 * not `NEXT_PUBLIC_PLATFORM=crazygames`, which is what keeps the CrazyGames
 * adapter out of the self-hosted bundle.
 *
 * WHY AN ALIAS RATHER THAN JUST THE `IS_CRAZYGAMES_BUILD` BRANCH: a bundler
 * decides its module graph before it folds constants, so
 * `if (false) await import('./crazyGamesAdapter')` still EMITS that chunk — and
 * Turbopack merged it with a module the lobby loads eagerly, which shipped the
 * SDK URL to web players. Dead code is not the same as absent code. Swapping the
 * module at resolution time is the only way to make it genuinely absent.
 *
 * Returning `null` means "this build has no platform implementation", and the
 * resolver keeps the web no-op adapter.
 */

import type { PlatformAdapter } from './adapter';

export const createPlatformAdapter = (): PlatformAdapter | null => null;
