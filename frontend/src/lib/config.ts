/**
 * ============================================================================
 *  Central client configuration.
 * ============================================================================
 *
 * Single source for the values that were previously read (and defaulted) in
 * several places at once. `NEXT_PUBLIC_BACKEND_URL` in particular used to be
 * inlined with its own `|| 'http://localhost:3001'` fallback in three separate
 * modules, so a change to the default meant changing it three times and any
 * drift was invisible.
 *
 * `NEXT_PUBLIC_*` values are inlined by Next at BUILD time, which is exactly
 * what makes the platform target below a compile-time constant rather than a
 * runtime branch.
 */

/**
 * Backend origin, without a trailing slash. Every REST call and the Socket.IO
 * connection resolve through here.
 *
 * Each deployment points at its own backend: the web build at Backend A, the
 * CrazyGames build at Backend B. Nothing in the client assumes they are the
 * same host, and no URL is hardcoded anywhere else.
 */
export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
).replace(/\/$/, '');
