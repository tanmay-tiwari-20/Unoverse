/**
 * ============================================================================
 *  Public-asset URLs, resolved for the host this build is served from.
 * ============================================================================
 *
 * Everything under `public/` is referenced in source as an absolute path
 * (`/models/space/station.glb`), which is correct for the self-hosted site: it
 * is served from its own origin root.
 *
 * The CrazyGames build is not. It is uploaded as a zip and served from an
 * unknown subdirectory of the portal's game-files domain, so `/models/...` would
 * resolve against that domain's root and 404. `assetPrefix` in `next.config.ts`
 * covers `_next/*` and nothing else — Next explicitly does not rewrite `public/`
 * references — so these paths need their own resolution, which is this module.
 *
 * WHY RESOLVE AT CALL TIME rather than rewriting the literals at build time: the
 * subdirectory is not known when the package is built, only when it is served.
 * `document.baseURI` is the one thing that knows, and it is only knowable in the
 * browser. Every caller here is already client-only (the audio graph, the GLTF
 * loader), so there is nothing to resolve during prerender.
 */

import { IS_CRAZYGAMES_BUILD } from './platform/target';

/**
 * Resolve a `public/`-relative path to something this build can fetch.
 *
 * Web: returned untouched, so the self-hosted build makes exactly the requests
 * it made before. CrazyGames: resolved against the document, which puts it
 * inside the uploaded package wherever the portal happens to have unpacked it.
 *
 * An empty path stays empty — callers use falsiness to mean "no asset here",
 * and resolving `''` against the document would hand them the page itself.
 */
export const assetPath = (path: string): string => {
  if (!IS_CRAZYGAMES_BUILD || !path) return path;

  const relative = path.replace(/^\/+/, '');

  // Prerender has no document. The relative form is still correct there — it is
  // what the browser would resolve anyway — and no caller fetches during SSR.
  if (typeof document === 'undefined') return relative;

  return new URL(relative, document.baseURI).href;
};
