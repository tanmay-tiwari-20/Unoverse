"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import HomeScreen from "../components/home/HomeScreen";
import LobbyRoom from "../components/lobby/LobbyRoom";
import { LOBBY_PARAM } from "../lib/platform/routes";
import { installCgHistorySync } from "../lib/platform/cgNavigation";

/**
 * ============================================================================
 *  Root route — CRAZYGAMES TARGET ONLY. The whole game, one document.
 * ============================================================================
 *
 * The CrazyGames package is a static zip served from a plain file host, so it
 * has exactly one HTML document: `index.html` at the package root. Every screen
 * is reached by changing the query string on that document, never the path.
 *
 * WHY: a static host has no rewrite rules. `/lobby` would 404 the instant a
 * player refreshed mid-game or the portal reloaded the iframe, and relative
 * `./_next/...` asset URLs only resolve correctly while the document sits at the
 * package root. Staying on one document makes both problems structurally
 * impossible rather than merely unlikely. The rationale is written up in
 * `lib/platform/routes.ts`, which owns the URL shape.
 *
 * `pageExtensions` in `next.config.ts` makes this file a route only in a
 * CrazyGames build; the web build resolves `page.web.tsx` instead and never
 * bundles the lobby into its home-screen chunk.
 *
 * BOTH SCREENS ARE THE SHARED ONES. `<HomeScreen>` and `<LobbyRoom>` are the same
 * components the web routes render — this file only chooses between them.
 */
function RootScreen() {
  // Back/forward. Next's own popstate handling covers every entry
  // `usePlatformRouter` creates; this only repairs one it would refuse to restore,
  // which would otherwise leave the URL and the screen disagreeing with no way
  // back. Installed here because this is the one document the package has, so it
  // is mounted for as long as the game is running.
  useEffect(() => installCgHistorySync(), []);

  // Reactive to client-side navigation, which is what makes a push into and out of
  // a room re-render this switch: on this target the URL is moved with
  // `history.pushState`, which Next turns into a router restore, and
  // `useSearchParams` is derived from the router's canonical URL. In a static
  // export the params are empty during prerender and populate on the client, hence
  // the boundary below.
  const searchParams = useSearchParams();

  const roomId = searchParams.get(LOBBY_PARAM);
  if (roomId) {
    return <LobbyRoom roomId={roomId} name={searchParams.get("name")} />;
  }

  return <HomeScreen />;
}

/**
 * `useSearchParams` in a prerendered route client-renders everything up to the
 * nearest Suspense boundary, so one is declared here explicitly rather than left
 * to the framework. The fallback is deliberately empty: the portal is showing its
 * own loading overlay at this point (`PlatformProvider` opens the loading span
 * before anything else), and the body's own dark background is what shows
 * through — a second spinner underneath the platform's would just be noise.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RootScreen />
    </Suspense>
  );
}
