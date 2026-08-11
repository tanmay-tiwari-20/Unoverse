"use client";

import { useParams, useSearchParams } from "next/navigation";
import LobbyRoom from "../../../components/lobby/LobbyRoom";

/**
 * Room route — WEB TARGET ONLY.
 *
 * `page.web.tsx`, not `page.tsx`: `pageExtensions` in `next.config.ts` only
 * recognises `web.tsx` as a route file in a web build, so this dynamic segment
 * simply does not exist in the CrazyGames build. That is the point — a static
 * export cannot emit a `[roomId]` route without knowing every room code up
 * front, and room codes are minted at runtime by the server.
 *
 * The CrazyGames build reaches the same `<LobbyRoom>` through `app/page.cg.tsx`
 * instead, off the root document's query string. See `lib/platform/routes.ts`.
 *
 * Everything route-shaped lives here; everything room-shaped lives in
 * `<LobbyRoom>`, which is shared verbatim between both targets.
 */
export default function LobbyPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  return (
    <LobbyRoom
      roomId={params?.roomId as string}
      name={searchParams?.get("name") ?? null}
    />
  );
}
