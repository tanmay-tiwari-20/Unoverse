/**
 * 3D table sizing driven by the ACTIVE player count.
 *
 * The seating angles in the WebGL scene already fan out with the player count, but
 * the table footprint and camera framing must adapt too — otherwise a 2-player
 * game looks sparse on a huge table and a 10-player game crowds avatars together
 * and crops the far seats. These helpers are the single source of truth for that
 * adaptation so the table mesh, the seat ring and the opponent-hand ring all scale
 * together and stay aligned.
 *
 * Spectators are never passed in here — only active players affect the geometry.
 */

// Base ellipse radii of the tabletop (matches the authored GameTable mesh at the
// reference count). Everything scales relative to these.
export const BASE_TABLE_RX = 1.15;
export const BASE_TABLE_RZ = 0.75;

// The player count the base geometry was authored for. At this count scale = 1.
const REFERENCE_COUNT = 6;

/**
 * Horizontal scale factor for the table + seating rings. Compact for small games,
 * gently larger for big ones. Clamped so the table never collapses or grows out of
 * the camera's reach; the camera pull-back (below) covers the rest.
 */
export const getTableScale = (numPlayers: number): number => {
  const n = Math.max(2, Math.round(numPlayers));
  // ~0.82 at 2 players, 1.0 at 6, ~1.22 at 10 — a mild, monotonic growth.
  const scale = 0.72 + n * 0.047;
  return Math.min(1.28, Math.max(0.8, scale));
};

/** Non-uniform scale applied to the GameTable group: widen the footprint in X/Z,
 *  leave height (Y) untouched so the table stays at human height. */
export const getTableGroupScale = (numPlayers: number): [number, number, number] => {
  const s = getTableScale(numPlayers);
  return [s, 1, s];
};

/** Scaled seat-ring radii for the human silhouettes (they sit back from the edge). */
export const getSeatRingRadii = (numPlayers: number): { rX: number; rZ: number } => {
  const s = getTableScale(numPlayers);
  return { rX: (BASE_TABLE_RX + 0.3) * s, rZ: (BASE_TABLE_RZ + 0.3) * s };
};

/** Scaled radii for placing opponent hand groups at the table edge. */
export const getHandRingRadii = (numPlayers: number): { rX: number; rZ: number } => {
  const s = getTableScale(numPlayers);
  return { rX: BASE_TABLE_RX * s, rZ: BASE_TABLE_RZ * s };
};

/**
 * Extra camera pull-back (added to the base Z distance) for larger tables so all
 * seats stay in frame as the footprint grows. Zero at the reference count and
 * below; grows with each additional seat past it.
 */
export const getCameraDistanceBoost = (numPlayers: number): number => {
  const n = Math.max(2, Math.round(numPlayers));
  if (n <= REFERENCE_COUNT) return 0;
  return (n - REFERENCE_COUNT) * 0.22;
};
