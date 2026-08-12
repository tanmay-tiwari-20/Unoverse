'use client';

import { useRouter } from 'next/navigation';
import { IS_CRAZYGAMES_BUILD } from '../lib/platform/target';
import { cgPush, cgReplace } from '../lib/platform/cgNavigation';

/**
 * ============================================================================
 *  The navigation seam. Next's router on web, the History API on CrazyGames.
 * ============================================================================
 *
 * Every screen change in the app goes through this instead of `useRouter`, because
 * the two targets cannot navigate the same way:
 *
 *   WEB          Next's App Router, unchanged — real routes, real RSC payloads,
 *                `/lobby/[roomId]` server-rendered as it always has been.
 *   CRAZYGAMES   `history.pushState` on the one document the static package has.
 *                Next's own client navigation would try to fetch an RSC payload
 *                from the game-files domain ROOT and hard-navigate away from the
 *                game when it 404s; see `lib/platform/cgNavigation.ts` for the
 *                full mechanism.
 *
 * A build-time branch, like the rest of the platform seam: `IS_CRAZYGAMES_BUILD` is
 * decided by `NEXT_PUBLIC_PLATFORM` when the bundle is compiled, so a web build
 * returns `useRouter()` and a CrazyGames build returns the History API one, with no
 * runtime detection anywhere.
 *
 * BOTH ARMS ARE NEVERTHELESS PRESENT IN BOTH BUNDLES. Turbopack does not propagate
 * the constant across module boundaries — it survives minification as the binding
 * `IS_CRAZYGAMES_BUILD`, not as `true`/`false` — so neither arm is eliminated as
 * dead code, and the unused one is merely never evaluated. That is only a few bytes
 * here, but it is worth knowing before writing a check that greps a bundle for the
 * other target's URLs: `scripts/build-crazygames.mjs` records why such a check
 * cannot work.
 *
 * WHY `useRouter()` IS CALLED UNCONDITIONALLY. The constant is known at build time
 * but a hook behind it is still a conditional hook to React and to
 * `react-hooks/rules-of-hooks`. On CrazyGames the instance is simply unused, which
 * costs nothing — `useRouter` only reads a context.
 *
 * BOTH BRANCHES RETURN A STABLE REFERENCE (Next's router instance is a singleton;
 * the CrazyGames one is a module constant), so callers can keep putting the result
 * in a dependency array without re-running effects, which is what the existing
 * `[router]` deps already rely on.
 */

/**
 * The two verbs the app actually uses. Deliberately narrower than
 * `AppRouterInstance`: `back`, `forward`, `refresh` and `prefetch` are unused
 * everywhere in this codebase, and `refresh`/`prefetch` have no meaning in a
 * one-document static package — a narrow type is what keeps them from being
 * reached for by accident on a target that cannot serve them.
 */
export interface PlatformRouter {
  /** Navigate to `href`, adding a history entry. */
  push(href: string): void;
  /** Navigate to `href`, replacing the current history entry. */
  replace(href: string): void;
}

const CG_ROUTER: PlatformRouter = { push: cgPush, replace: cgReplace };

export const usePlatformRouter = (): PlatformRouter => {
  const router = useRouter();
  return IS_CRAZYGAMES_BUILD ? CG_ROUTER : router;
};

export default usePlatformRouter;
