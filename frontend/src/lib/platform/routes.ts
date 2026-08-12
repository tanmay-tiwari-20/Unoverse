/**
 * ============================================================================
 *  Platform routes — the URL shape a room lives at, per build target.
 * ============================================================================
 *
 * The two builds reach the SAME lobby implementation through two different URL
 * shapes, because they are served by two different kinds of host:
 *
 *   WEB          /lobby/<CODE>?name=<NAME>     a real route, server-rendered
 *   CRAZYGAMES   ?lobby=<CODE>&name=<NAME>     the current document, client-only
 *
 * WHY CRAZYGAMES STAYS ON THE ROOT DOCUMENT. The portal build is a static
 * package uploaded as a zip; it is served from a plain file host at an unknown
 * subdirectory, with no rewrite rules of any kind. Two consequences decide this
 * shape:
 *
 *   1. A HARD LOAD OF ANY PATH BUT THE ROOT IS A 404. Client-side navigation to
 *      `/lobby` is fine — it never hits the network — but the moment a player
 *      refreshes mid-game, or the portal reloads the iframe, the browser asks
 *      the file host for `/lobby` and gets nothing. Keeping every screen on
 *      `index.html` makes refresh-mid-game work by construction.
 *   2. RELATIVE ASSET PATHS RESOLVE AGAINST THE DOCUMENT. A bundle served from
 *      a subdirectory must reference `./_next/...`, which only resolves to the
 *      right place while the document itself sits at the package root.
 *
 * WHY THE CRAZYGAMES HREFS HAVE NO LEADING SLASH. They are document-relative, not
 * root-absolute, because the package is served from a subdirectory whose name is
 * not known at build time — `/?lobby=CODE` names the game-files domain's ROOT,
 * which belongs to the file host and not to us. `?lobby=CODE` names the query of
 * whatever document we are already in. `lib/platform/cgNavigation.ts` enforces
 * that property rather than trusting it, and explains why an escaped URL is fatal
 * rather than merely wrong.
 *
 * WHY THE PARAM IS `lobby` AND NOT `room`. `?room=` already means something on
 * CrazyGames: it is the invite parameter the portal round-trips through
 * `SDK.game.getInviteParam('room')`, and it can appear on the game URL without
 * a `name` alongside it. If it doubled as our own "you are in a room" state, an
 * inbound invite would render the lobby with no player name, which bounces
 * straight back to the home screen. Keeping the two names distinct keeps the two
 * concerns orthogonal: `room` is the platform's inbound invite, handled once by
 * `usePlatformEntry`; `lobby` is our own client-side location.
 *
 * NOTHING HERE NORMALISES THE CODE. Callers pass exactly the string they already
 * passed before this helper existed — the web build's URLs are unchanged, down to
 * the casing.
 */

import { IS_CRAZYGAMES_BUILD } from './target';

/** Query parameter naming the room the CrazyGames build is currently showing. */
export const LOBBY_PARAM = 'lobby';

/**
 * The home screen.
 *
 * On web, the root route. On CrazyGames, "this document with no query at all" —
 * `'?'` resolves to an empty search, which `cgNavigation`'s normaliser turns into
 * the bare document path, so the player lands back on the home screen without the
 * URL ever naming a path the file host would have to serve.
 */
export const HOME_HREF = IS_CRAZYGAMES_BUILD ? '?' : '/';

/**
 * The URL that renders `roomId`'s table with the player seated as `name`.
 *
 * A compile-time branch: in a web build the CrazyGames arm folds away, so the
 * emitted string is byte-identical to the template it replaced.
 */
export const lobbyHref = (roomId: string, name: string): string =>
  IS_CRAZYGAMES_BUILD
    ? `?${LOBBY_PARAM}=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}`
    : `/lobby/${roomId}?name=${encodeURIComponent(name)}`;
