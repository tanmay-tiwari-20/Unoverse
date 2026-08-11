/**
 * ============================================================================
 *  Document-level platform tags — CRAZYGAMES.
 * ============================================================================
 *
 * The portal requires its SDK to be loaded by the game's own HTML document, and
 * the static package has exactly one: the generated `index.html`. This renders
 * that tag.
 *
 * WHY A PLAIN `<script>` AND NOT `next/script`:
 *
 * `<Script strategy="beforeInteractive">` does not put a script element in the
 * exported HTML. It emits a preload link plus a queue entry —
 * `(self.__next_s=self.__next_s||[]).push([src,{}])` — which the Next client
 * runtime drains to create the element. The SDK still loads early, but the
 * document does not *contain* `<script src="…crazygames-sdk-v3.js">`, and the
 * portal's requirement is about the document. It would also mean the SDK element
 * only exists once Next's own runtime has booted.
 *
 * React hoists an `async` script with a `src` into `<head>` while rendering, so
 * the tag lands in the prerendered `index.html` regardless of where this
 * component sits in the tree, and the browser fetches it in parallel with the
 * first chunk rather than after it.
 *
 * `async` is safe here because nothing races the SDK: `crazyGamesSdk.ts` waits
 * for `window.CrazyGames.SDK` to appear (and the adapter treats every call as
 * possibly-absent), so an SDK that arrives a few hundred milliseconds late is
 * indistinguishable from one that was there all along.
 *
 * This is the CrazyGames arm of the `@platform-head` alias; the web build
 * resolves `platformHead.web.tsx` instead and therefore contains neither this
 * component nor the SDK URL it references.
 *
 * The runtime loader in `crazyGamesSdk.ts` still works exactly as before: it
 * checks for an existing tag with this same `src` (shared via
 * `crazyGamesSdkUrl.ts`), finds the one rendered here, and simply waits for
 * `window.CrazyGames.SDK` instead of injecting a second copy. That is also what
 * keeps a CrazyGames build served OUTSIDE the portal working — the tag is
 * present, the SDK reports `environment: 'local'`, and the adapter degrades on
 * its own terms.
 */

import React from 'react';
import { CRAZYGAMES_SDK_SRC } from './crazyGamesSdkUrl';

export const PlatformHead: React.FC = () => (
  <script src={CRAZYGAMES_SDK_SRC} async />
);

export default PlatformHead;
