/**
 * Arena registry — the single source of truth for which arenas exist, their
 * ordering in the picker, the default, and the helpers used to validate and
 * resolve arena ids coming off the network or the UI.
 *
 * Mirrors the shape of `lib/houseRules.ts` (a catalog + normalization helpers)
 * so arena handling reads like the rest of the room-config code.
 */

import { ArenaId, ArenaMeta, ArenaSelection, ThemedArenaId } from './types';

export const DEFAULT_ARENA: ArenaId = 'classic';

/** Full catalog. Order here is the order shown in the picker. */
export const ARENAS: Record<ArenaId, ArenaMeta> = {
  classic: {
    id: 'classic',
    name: 'Classic Tavern',
    description: 'The original cozy table under a warm hanging lamp.',
    accent: '#ffcc77',
    accent2: '#8a5a2b',
    gradient: ['#2a1c12', '#160d08', '#050301'],
    motif: 'tavern',
  },
  space: {
    id: 'space',
    name: 'Space Station',
    description: 'A command deck adrift among nebulae, planets and stars.',
    accent: '#5fd0ff',
    accent2: '#7a5cff',
    gradient: ['#0a1230', '#0a0a2a', '#01020a'],
    motif: 'stars',
  },
  jungle: {
    id: 'jungle',
    name: 'Amazon Jungle',
    description: 'An ancient moss-covered rock deep in a sunlit rainforest.',
    accent: '#8ff06a',
    accent2: '#f2c14e',
    gradient: ['#1b3a17', '#123010', '#071505'],
    motif: 'leaves',
  },
  glacier: {
    id: 'glacier',
    name: 'Frozen Glacier',
    description: 'A carved ice arena beneath shimmering northern lights.',
    accent: '#a8ecff',
    accent2: '#6ad6a8',
    gradient: ['#13314a', '#102a44', '#061423'],
    motif: 'aurora',
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber City',
    description: 'A floating holo-platform above a rain-soaked neon megacity.',
    accent: '#ff4fd8',
    accent2: '#4ff0ff',
    gradient: ['#1a0a2e', '#12082a', '#05010f'],
    motif: 'neon',
  },
  volcano: {
    id: 'volcano',
    name: 'Volcano Temple',
    description: 'An obsidian altar ringed by rivers of molten lava.',
    accent: '#ff7a2f',
    accent2: '#ff3b2f',
    gradient: ['#3a1206', '#260a04', '#0c0301'],
    motif: 'lava',
  },
};

/** Picker order. */
export const ARENA_LIST: ArenaMeta[] = [
  ARENAS.classic,
  ARENAS.space,
  ARENAS.jungle,
  ARENAS.glacier,
  ARENAS.cyber,
  ARENAS.volcano,
];

/** All concrete ids. */
export const ARENA_IDS: ArenaId[] = ARENA_LIST.map((a) => a.id);

/** Type guard: is `x` a known concrete arena id? */
export const isArenaId = (x: unknown): x is ArenaId =>
  typeof x === 'string' && (ARENA_IDS as string[]).includes(x);

/**
 * Every arena that is not the default — i.e. every arena that ships as its own
 * lazy chunk and may carry hero `.glb` assets. Derived from the catalog rather
 * than written out, so it cannot drift from `ARENAS`.
 */
export const THEMED_ARENA_IDS = ARENA_IDS.filter(
  (id) => id !== DEFAULT_ARENA,
) as ThemedArenaId[];

/**
 * Type guard for the loading path: narrows a concrete id (or any raw value off
 * the network) to a themed arena, so the `Record<ThemedArenaId, …>` preload maps
 * can be indexed without a cast. Classic and unknown ids are excluded.
 */
export const isThemedArena = (x: unknown): x is ThemedArenaId =>
  isArenaId(x) && x !== DEFAULT_ARENA;

/**
 * Coerce any value (a network field, a persisted string, `undefined`) into a
 * valid concrete arena id. Unknown / missing → the default. `random` is NOT
 * resolved here — it must be resolved once, at creation, via `pickRandomArena`,
 * so all clients agree; anything unrecognized simply falls back to the default.
 */
export const resolveArena = (x?: string | null): ArenaId =>
  isArenaId(x) ? x : DEFAULT_ARENA;

/**
 * Pick a concrete arena at random for the `random` selection. Deterministic
 * agreement across clients is achieved by resolving this ONCE on the server at
 * room creation and syncing the concrete result — never by resolving per client.
 */
export const pickRandomArena = (): ArenaId => {
  // Exclude `classic` from random so "Random" always yields a themed world.
  const pool = ARENA_IDS.filter((id) => id !== 'classic');
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? DEFAULT_ARENA;
};

/** Resolve a selection (`random` or a concrete id) to a concrete id. */
export const resolveSelection = (sel?: ArenaSelection | string | null): ArenaId => {
  if (sel === 'random') return pickRandomArena();
  return resolveArena(sel ?? undefined);
};

export const getArenaMeta = (id?: string | null): ArenaMeta => ARENAS[resolveArena(id)];
