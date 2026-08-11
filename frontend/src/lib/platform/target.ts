/**
 * ============================================================================
 *  Build-time platform target.
 * ============================================================================
 *
 * Unoverse ships from ONE codebase to two places: the self-hosted web build and
 * the CrazyGames build. Which one you get is decided by `NEXT_PUBLIC_PLATFORM`
 * at build time, never at runtime.
 *
 * WHY BUILD-TIME MATTERS. Next inlines `NEXT_PUBLIC_*` into the bundle, so in a
 * web build `PLATFORM_TARGET === 'crazygames'` is the literal `false` and every
 * CrazyGames branch behind it is dropped as dead code by the minifier. Combined
 * with the CrazyGames adapter being reached exclusively through a *dynamic*
 * import (see `./index`), that is what keeps the platform SDK entirely out of
 * the web bundle rather than merely unused within it.
 *
 * THE DEFAULT IS DELIBERATE. Anything other than the exact string
 * `'crazygames'` — including an unset variable, a typo, or an empty value —
 * resolves to `'web'`. A missing environment variable can therefore never ship
 * a CrazyGames build to your own domain; the failure mode is "behaves like the
 * normal site", which is the safe direction.
 */

export type PlatformTarget = 'web' | 'crazygames';

/** The target this bundle was built for. A compile-time constant. */
export const PLATFORM_TARGET: PlatformTarget =
  process.env.NEXT_PUBLIC_PLATFORM === 'crazygames' ? 'crazygames' : 'web';

/**
 * True only in a CrazyGames build. Prefer this over comparing the string, so
 * the dead-code elimination above has a single, obvious predicate to fold.
 *
 * NOTE: this says which build you are running, NOT whether the CrazyGames SDK
 * is actually usable. A CrazyGames build served somewhere unexpected still has
 * to degrade gracefully, which is what the adapter's own environment guard
 * handles (`SDK.environment` may be `local | crazygames | disabled`).
 */
export const IS_CRAZYGAMES_BUILD = PLATFORM_TARGET === 'crazygames';
