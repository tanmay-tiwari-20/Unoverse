"use client";

import HomeScreen from "../components/home/HomeScreen";

/**
 * Home route — WEB TARGET ONLY.
 *
 * `page.web.tsx`, not `page.tsx`: `pageExtensions` in `next.config.ts` decides
 * which of these two files is a route, so a web build never even parses the
 * CrazyGames root and vice versa. See `page.cg.tsx` for the static counterpart.
 *
 * The screen itself is `<HomeScreen>`, shared verbatim by both targets. This file
 * exists purely to say "on web, the root URL is the home screen and nothing
 * else" — which is exactly what it meant before the CrazyGames target existed.
 */
export default function Page() {
  return <HomeScreen />;
}
