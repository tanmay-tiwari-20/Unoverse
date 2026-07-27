/**
 * Arena ids — server-side mirror of the frontend `lib/arenas` catalog.
 *
 * The server never renders an arena; it only needs to validate the id a host
 * picks, resolve the `random` selection to a concrete id ONCE at creation (so
 * every client agrees), and store it on the room so it rides `publicRoom` to all
 * players and spectators. Keep `ARENA_IDS` in sync with the frontend registry.
 */

export type ArenaId = 'classic' | 'space' | 'jungle' | 'glacier' | 'cyber' | 'volcano';

export const ARENA_IDS: ArenaId[] = ['classic', 'space', 'jungle', 'glacier', 'cyber', 'volcano'];

export const DEFAULT_ARENA: ArenaId = 'classic';

export const isArenaId = (x: unknown): x is ArenaId =>
  typeof x === 'string' && (ARENA_IDS as string[]).includes(x);

/** Coerce any value into a valid concrete arena id (unknown/missing → default). */
export const resolveArena = (x?: string | null): ArenaId => (isArenaId(x) ? x : DEFAULT_ARENA);

/** Random concrete arena (excludes `classic` so "Random" always yields a themed world). */
export const pickRandomArena = (): ArenaId => {
  const pool = ARENA_IDS.filter((id) => id !== 'classic');
  return pool[Math.floor(Math.random() * pool.length)] ?? DEFAULT_ARENA;
};

/**
 * Resolve a host selection into a concrete arena id. `random` is resolved here,
 * on the server, at creation time so the stored value is concrete and identical
 * for every client. Anything unrecognized falls back to the default.
 */
export const resolveSelection = (sel?: string | null): ArenaId => {
  if (sel === 'random') return pickRandomArena();
  return resolveArena(sel);
};
