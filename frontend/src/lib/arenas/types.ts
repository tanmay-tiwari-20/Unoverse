/**
 * Arena / Map system — shared definitions.
 *
 * An "arena" is a fully themed 3D world (sky, lighting, fog, platform, seating
 * props, decor, particles) that a room is played in. Crucially it changes ONLY
 * the environment: gameplay, networking, camera, seats, cards and the HUD are
 * identical in every arena. The play surface always sits at the same world
 * height and footprint (see `components/table/arenas/shared/ArenaKit`), so cards
 * and piles land exactly where they always have.
 *
 * This module holds only lightweight, serializable metadata — the id enum used
 * for network sync and the presentational data that drives the procedural
 * preview thumbnails. The heavy Three.js scene for each arena lives in
 * `components/table/arenas/*` and is code-split / lazy-loaded per arena.
 */

/** The concrete set of themed worlds. `classic` is the original tavern. */
export type ArenaId = 'classic' | 'space' | 'jungle' | 'glacier' | 'cyber' | 'volcano';

/** Selection value: a concrete arena, or `random` (resolved to a concrete id at
 *  room creation on the server so every client agrees). */
export type ArenaSelection = ArenaId | 'random';

/**
 * Presentational metadata for an arena. Everything the selection UI needs to
 * render a preview + label without loading the 3D scene. `gradient`/`accent`
 * are deliberately colour-matched to the in-scene theme so the thumbnail reads
 * as the same world.
 */
export interface ArenaMeta {
  id: ArenaId;
  /** Short display name, e.g. "Space Station". */
  name: string;
  /** One-line description for the picker. */
  description: string;
  /** Primary accent (glow / border / highlights) — CSS colour. */
  accent: string;
  /** Secondary accent used for gradients and motifs — CSS colour. */
  accent2: string;
  /** Background gradient stops (top → bottom) for the procedural preview card. */
  gradient: [string, string, string];
  /** Icon motif drawn on the preview. Keyed, rendered by `ArenaPreview`. */
  motif: 'tavern' | 'stars' | 'leaves' | 'aurora' | 'neon' | 'lava';
}
