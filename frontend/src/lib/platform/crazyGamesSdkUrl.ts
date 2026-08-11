/**
 * The CrazyGames SDK v3 bundle URL — the one string that identifies the portal
 * integration.
 *
 * It lives in its own module so that BOTH places that need it can share one
 * source of truth without either pulling the other in: the document-level script
 * tag (`platformHead.crazygames.tsx`) and the runtime loader that waits for the
 * global (`crazyGamesSdk.ts`) must agree on the URL exactly, or the loader would
 * inject a second copy of the SDK alongside the one already in the HTML.
 *
 * Both importers are reached only through build-time module aliases
 * (`@platform-head`, `@platform-impl`), so nothing in a web build imports this
 * file and the URL is absent from that output as a matter of module resolution
 * rather than minifier behaviour.
 */
export const CRAZYGAMES_SDK_SRC = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
