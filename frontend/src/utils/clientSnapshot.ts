/**
 * `useSyncExternalStore` subscriber for values that never change after the first
 * client render — the environment's Fullscreen API support, the landing URL's
 * query string. There is no event to listen for; the point of reading them
 * through the store API at all is `getServerSnapshot`, which keeps the
 * hydration render matching the prerendered HTML instead of tripping a mismatch.
 */
export function subscribeToNothing(): () => void {
  return () => {};
}
