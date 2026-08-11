import type { NextConfig } from "next";

/**
 * Normalise the platform target to a literal at config time.
 *
 * This exists for dead-code elimination, not for behaviour. `NEXT_PUBLIC_*` vars
 * are only inlined when they are actually SET — leave `NEXT_PUBLIC_PLATFORM`
 * unset and the bundler emits a runtime `process.env` lookup instead of a
 * literal, so `IS_CRAZYGAMES_BUILD` stops being a compile-time constant, the
 * platform branch survives, and the CrazyGames adapter chunk (SDK URL and all)
 * gets emitted into the self-hosted build.
 *
 * Feeding the value through `env` means the comparison in `lib/platform/target.ts`
 * always folds — so an unset var produces a literal `"web"` and the CrazyGames
 * code path is stripped rather than merely unreachable.
 *
 * Anything other than the exact string `"crazygames"` resolves to `"web"`: a typo
 * or a missing variable must never ship a portal build to our own domain.
 */
const PLATFORM_TARGET =
  process.env.NEXT_PUBLIC_PLATFORM === "crazygames" ? "crazygames" : "web";

const IS_CRAZYGAMES = PLATFORM_TARGET === "crazygames";

/**
 * BACKEND B IS NOT OPTIONAL FOR A CRAZYGAMES RELEASE.
 *
 * `lib/config.ts` falls back to `http://localhost:3001` when
 * `NEXT_PUBLIC_BACKEND_URL` is unset, which is right for local work and
 * catastrophic in an uploaded package: every player would silently fail to
 * connect, and the portal build is a zip nobody can hotfix without re-uploading.
 * So a *production* CrazyGames build refuses to start without it. `next dev` is
 * left alone — pointing a local CrazyGames build at a local backend is normal.
 */
if (IS_CRAZYGAMES && process.env.NODE_ENV === "production") {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    throw new Error(
      "NEXT_PUBLIC_BACKEND_URL is required for a production CrazyGames build " +
        "(it is Backend B). Without it the package would ship pointing at " +
        "http://localhost:3001.",
    );
  }
  if (/localhost|127\.0\.0\.1/.test(backend)) {
    throw new Error(
      `NEXT_PUBLIC_BACKEND_URL points at a local address (${backend}). ` +
        "A CrazyGames package must point at Backend B's public origin.",
    );
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PLATFORM: PLATFORM_TARGET,
  },

  /**
   * THE ROUTE SEAM. Which files count as routes is decided per target here, and
   * that is what lets one `app/` directory serve two very different hosts:
   *
   *   `page.web.tsx`  a route in a web build only
   *   `page.cg.tsx`   a route in a CrazyGames build only
   *   `page.tsx`      a route in both (none currently — every route differs)
   *
   * WHY THIS AND NOT A RUNTIME BRANCH. The CrazyGames build is a static export,
   * and `app/lobby/[roomId]` cannot be exported at all: a dynamic segment needs
   * `generateStaticParams`, and room codes are minted by the server at runtime,
   * so there is no set of paths to enumerate. Rather than weaken that route for
   * both targets, the CrazyGames build simply does not have it — it reaches the
   * same `<LobbyRoom>` from the root document instead (see
   * `lib/platform/routes.ts`).
   *
   * It also keeps each build's module graph honest: a file that is not a route
   * here, and that nothing imports, is not in the output at all. The web build
   * never bundles the lobby into its home-screen chunk, and the CrazyGames build
   * never carries a route it cannot serve.
   *
   * THE LIMIT OF THIS MECHANISM: it governs `page`/`layout`/`route` files only.
   * Metadata file conventions (`manifest`, `robots`, `sitemap`, `icon`, …) are
   * matched by basename, and their generated route resolves its module through a
   * separate path that does not understand a multi-segment extension — a
   * `manifest.web.ts` is recognised as `/manifest.webmanifest` and then fails to
   * load ("Cannot find module for page"). `app/manifest.ts` therefore stays
   * shared, and the CrazyGames package drops the manifest (file and `<link>`) in
   * `scripts/build-crazygames.mjs` instead.
   */
  pageExtensions: IS_CRAZYGAMES
    ? ["cg.tsx", "cg.ts", "tsx", "ts", "jsx", "js"]
    : ["web.tsx", "web.ts", "tsx", "ts", "jsx", "js"],

  /**
   * The CrazyGames target is a fully static HTML5 package: `next build` writes an
   * `out/` directory whose root `index.html` is the entire game. No Node runtime,
   * no SSR, no route handlers, no server actions — the portal serves the files
   * and everything else happens in the browser against Backend B over
   * HTTPS/WSS.
   *
   * The web target is untouched by all of this and keeps its normal server build.
   */
  ...(IS_CRAZYGAMES
    ? {
        output: "export" as const,

        /**
         * RELATIVE ASSET URLS, because the package is served from a
         * subdirectory of the portal's game-files domain, not from a domain
         * root. `/_next/...` would resolve against that domain's root and 404;
         * `./_next/...` resolves inside the uploaded package.
         *
         * This is safe here precisely because the CrazyGames build has ONE
         * document, at the package root — relative URLs resolve against the
         * document, so a second HTML file one directory deep would silently
         * break every chunk it loaded. That constraint is the reason
         * `lib/platform/routes.ts` keeps every screen on `index.html`.
         *
         * `assetPrefix` covers `_next/*` only. Next explicitly does not rewrite
         * references to `public/` files, so `/models/*.glb` and `/sounds/*.mp3`
         * are resolved at call time by `lib/assetPath.ts` instead.
         */
        assetPrefix: ".",

        /**
         * No image optimizer exists in a static package. Nothing currently uses
         * `next/image` (the one remote avatar is a plain `<img>`), so this
         * changes no output today — it is here so that adding one later fails as
         * a broken image on web review rather than as a cryptic export error.
         */
        images: { unoptimized: true },
      }
    : {}),

  turbopack: {
    resolveAlias: {
      /**
       * The platform implementation seam. `lib/platform/index.ts` dynamically
       * imports `@platform-impl`; which module that is gets decided here, once,
       * at build time.
       *
       * This is what keeps the CrazyGames SDK out of the self-hosted build.
       * Guarding the import with a build-time boolean is NOT sufficient — the
       * module graph is built before constants are folded, so the adapter chunk
       * was still emitted (and merged into an eagerly-loaded chunk) even with the
       * branch removed. Swapping the module at resolution time makes it absent.
       *
       * tsconfig maps `@platform-impl` to the CrazyGames module so both sides of
       * the seam are always typechecked, whichever one a given build resolves.
       */
      "@platform-impl": IS_CRAZYGAMES
        ? "./src/lib/platform/platformImpl.crazygames.ts"
        : "./src/lib/platform/platformImpl.web.ts",

      /**
       * The DOCUMENT seam, same idea one level up. The portal requires its SDK
       * to be loaded by the game's own HTML, so the CrazyGames arm renders a
       * `beforeInteractive` script tag into the exported `index.html` while the
       * web arm renders nothing.
       *
       * Unlike `@platform-impl` this one is imported STATICALLY by
       * `app/layout.tsx` — a tag that must be in the prerendered HTML cannot
       * arrive on a promise. Resolution-time swapping is therefore the only
       * thing keeping the SDK URL out of the web document, which is exactly what
       * it does.
       */
      "@platform-head": IS_CRAZYGAMES
        ? "./src/lib/platform/platformHead.crazygames.tsx"
        : "./src/lib/platform/platformHead.web.tsx",
    },
  },
};

export default nextConfig;
