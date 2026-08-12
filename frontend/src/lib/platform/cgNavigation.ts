/**
 * ============================================================================
 *  CrazyGames navigation — one document, query string only, no network.
 * ============================================================================
 *
 * WHY THIS EXISTS. App Router client navigation does not stay in the browser. In
 * an `output: 'export'` build, `router.push()` first fetches the target route's
 * RSC payload from `<pathname>.txt`, and that URL is built from
 * `location.origin` — see `appendSuffixToPathname` in
 * `next/dist/client/components/segment-cache/fetch-server-response.js`, which
 * appends `index.txt` for a directory-style path. The CrazyGames package is
 * served from a SUBDIRECTORY of the portal's game-files domain, so
 * `router.push('/?lobby=CODE')` asks for
 * `https://unoverse.game-files.crazygames.com/index.txt` — outside the uploaded
 * package, 404 — and Next's fallback for a payload it cannot fetch is
 * `doMpaNavigation`, i.e. a hard `location.assign()` to the domain ROOT. The game
 * disappears mid-navigation and the browser lands on the file host's index.
 *
 * `assetPrefix: '.'` cannot help. It rewrites `_next/*` ASSET urls; a route URL
 * is not an asset URL and is never prefixed.
 *
 * WHAT THIS DOES INSTEAD. Next patches `history.pushState`/`replaceState` and
 * turns them into an `ACTION_RESTORE` dispatch (`app-router.js`). That reducer
 * restores the router tree stashed in the history entry and issues NO request:
 * `restore-reducer.js` runs `startPPRNavigation` with
 * `FreshnessPolicy.HistoryTraversal`, whose reuse-the-cache-node path sets
 * `needsDynamicRequest = false` at every level, so the resulting task has a null
 * `dynamicRequestTree` and `spawnDynamicRequests` returns immediately. It also
 * sets `canonicalUrl` — and `useSearchParams()` is derived from `canonicalUrl` —
 * so `app/page.cg.tsx` re-renders and swaps `<HomeScreen>` for `<LobbyRoom>`
 * with zero network traffic and no reload.
 *
 * SO THE HISTORY API IS THE ROUTER ON THIS TARGET, and it is deliberately reached
 * through Next's PATCHED one: calling the original `pushState` would move the URL
 * without telling the router, and `useSearchParams()` would keep returning the
 * previous query. Everything here therefore goes through `window.history.*`.
 *
 * Nothing in this module is used by the web build — see `hooks/usePlatformRouter`
 * for the seam. The web build keeps Next's router, its `/lobby/[roomId]` route,
 * and its RSC navigation exactly as they are.
 */

/**
 * Resolve `href` against the CURRENT document, keeping only its query and hash.
 *
 * Two structural guarantees, both of which matter more than the convenience:
 *
 *   1. THE PACKAGE CANNOT BE ESCAPED. Whatever a caller passes — `?lobby=X`, a
 *      bare `/`, a full absolute URL — the pathname of the result is the pathname
 *      the document is already at. There is no href any caller can construct that
 *      navigates out of the uploaded package. That matters because the portal
 *      serves us from a subdirectory whose name is not known at build time, so
 *      "the root" belongs to the file host, not to us.
 *   2. NO PATH IS EVER INVENTED. A static file host has exactly one document to
 *      give us: `index.html` at the package root. A pushed pathname that is not
 *      the current one would 404 the moment the player refreshed or the portal
 *      reloaded the iframe. Because the URL only ever differs in its query,
 *      refresh-mid-game keeps working by construction.
 *
 * `HOME_HREF` is `'?'` on this target, which resolves to an empty search and so
 * returns the bare document path — no stray trailing `?` left in the URL bar.
 */
const sameDocumentUrl = (href: string): string => {
  const url = new URL(href, window.location.href);
  return `${window.location.pathname}${url.search}${url.hash}`;
};

/** Navigate, adding a history entry. The CrazyGames analogue of `router.push`. */
export const cgPush = (href: string): void => {
  window.history.pushState(null, '', sameDocumentUrl(href));
};

/** Navigate in place. The CrazyGames analogue of `router.replace`. */
export const cgReplace = (href: string): void => {
  window.history.replaceState(null, '', sameDocumentUrl(href));
};

/**
 * Keep the router in step with history entries Next will not restore by itself.
 *
 * Back/forward already work without this: Next listens for `popstate` and
 * dispatches a traversal for every entry it recognises, and every entry we create
 * IS one it recognises — `cgPush`/`cgReplace` go through the patched History API,
 * which stamps its `__NA` marker and the current router tree onto the new entry
 * before writing it.
 *
 * An entry WITHOUT that marker is one Next's handler returns early on, leaving the
 * router rendering the previous screen while the URL bar claims otherwise — a
 * dead end, because every later back/forward lands on entries it does understand
 * and the player never sees the screen the URL names. Only history written before
 * hydration finished, or by something outside the app, can be in that state, so
 * this is a safety net rather than a path we use. It is cheap and the failure it
 * covers is not recoverable by the player, hence keeping it.
 *
 * The repair is to re-assert the URL the browser has ALREADY restored through the
 * patched `replaceState`, so the router adopts it: no entry is added, nothing is
 * fetched, and the page is not reloaded. `restore-reducer` handles the missing
 * tree by keeping the one it has, which is exactly right here — same document,
 * same route, only the query moved.
 *
 * Returns its own cleanup, so an effect can `return installCgHistorySync()`.
 */
export const installCgHistorySync = (): (() => void) => {
  const onPopState = (): void => {
    if (window.history.state?.__NA) return;
    cgReplace(window.location.href);
  };

  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
};
