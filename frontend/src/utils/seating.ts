/**
 * Seating utility for the 2.5D UNO tabletop layout.
 *
 * Maps visual seat slots to screen-percentage coordinates for the HTML overlays
 * (nameplates, reactions, winner spotlight). The local player is always anchored
 * at bottom-center (visual slot 0) and opponents are distributed around the
 * table. Layouts for 1-6 players are hand-tuned; larger counts are computed with
 * the SAME angular convention as the 3D scene (angle = 2π·slot/n, +x = screen
 * right, +z = screen bottom), so the HTML overlay and the WebGL seats always
 * point at the same player.
 */

export interface SeatCoords {
  left: string;
  top: string;
  rotation: number; // rotation in degrees
}

// Hand-tuned layouts read better than a pure formula at small counts (a
// 2-player game wants a clean top/bottom; 4 players want the cardinal points).
const FIXED_LAYOUTS: Record<number, SeatCoords[]> = {
  1: [
    { left: '50%', top: '85%', rotation: 0 }
  ],
  2: [
    { left: '50%', top: '85%', rotation: 0 },    // Bottom Center (Local)
    { left: '50%', top: '25%', rotation: 0 }     // Top Center (Opponent)
  ],
  3: [
    { left: '50%', top: '85%', rotation: 0 },    // Bottom Center (Local)
    { left: '78%', top: '30%', rotation: 0 },    // Top Right (Opponent)
    { left: '22%', top: '30%', rotation: 0 }     // Top Left (Opponent)
  ],
  4: [
    { left: '50%', top: '85%', rotation: 0 },    // Bottom Center (Local)
    { left: '82%', top: '48%', rotation: 0 },    // Right Center (Opponent)
    { left: '50%', top: '22%', rotation: 0 },    // Top Center (Opponent)
    { left: '18%', top: '48%', rotation: 0 }     // Left Center (Opponent)
  ],
  5: [
    { left: '50%', top: '85%', rotation: 0 },    // Bottom Center (Local)
    { left: '82%', top: '56%', rotation: 0 },    // Bottom Right (Opponent)
    { left: '75%', top: '28%', rotation: 0 },    // Top Right (Opponent)
    { left: '25%', top: '28%', rotation: 0 },    // Top Left (Opponent)
    { left: '18%', top: '56%', rotation: 0 }     // Bottom Left (Opponent)
  ],
  6: [
    { left: '50%', top: '85%', rotation: 0 },    // Bottom Center (Local)
    { left: '82%', top: '58%', rotation: 0 },    // Bottom Right (Opponent)
    { left: '80%', top: '32%', rotation: 0 },    // Top Right (Opponent)
    { left: '50%', top: '20%', rotation: 0 },    // Top Center (Opponent)
    { left: '20%', top: '32%', rotation: 0 },    // Top Left (Opponent)
    { left: '18%', top: '58%', rotation: 0 }     // Bottom Left (Opponent)
  ]
};

/**
 * Computed layout for 7+ players, mirroring the 3D scene's seat placement:
 * slot i sits at angle 2π·i/n where slot 0 (angle 0) is the local player at the
 * bottom, increasing slots go to the RIGHT first, and only slot 0 ever occupies
 * the bottom position. Screen mapping: left = 50 + sin(θ)·rx (right positive),
 * top = 50 + cos(θ)·ry (bottom positive).
 */
const computeLayout = (numPlayers: number): SeatCoords[] => {
  const rx = 34; // horizontal radius, % of viewport
  const ry = 32; // vertical radius, % of viewport
  const slots: SeatCoords[] = [{ left: '50%', top: '85%', rotation: 0 }];
  for (let i = 1; i < numPlayers; i++) {
    const angle = (Math.PI * 2 * i) / numPlayers;
    const left = 50 + Math.sin(angle) * rx;
    const top = 50 + Math.cos(angle) * ry;
    slots.push({ left: `${left.toFixed(2)}%`, top: `${top.toFixed(2)}%`, rotation: 0 });
  }
  return slots;
};

const getLayout = (numPlayers: number): SeatCoords[] => {
  const n = Math.max(1, Math.round(numPlayers));
  return FIXED_LAYOUTS[n] ?? computeLayout(n);
};

/**
 * Maps a player's seat number to one of the visual slots. The local player is
 * always rendered at bottom-center (visual slot 0); others are placed
 * sequentially around the table relative to the local seat.
 *
 * @param seatNumber Player's seat number (1-based)
 * @param localSeatNumber The seat number of the local user
 * @param numPlayers Total number of ACTIVE players in the current configuration
 */
export const getSeatCoords = (
  seatNumber: number,
  localSeatNumber: number,
  numPlayers: number = 6
): SeatCoords => {
  const n = Math.max(1, Math.round(numPlayers));
  const visualSlotIndex = ((seatNumber - localSeatNumber) % n + n) % n;
  const layout = getLayout(n);
  return layout[visualSlotIndex] || layout[0];
};

/**
 * Returns all visual slot coordinates for a given player count, 1-indexed.
 */
export const getAllVisualSlots = (
  numPlayers: number = 6
): Record<number, { left: string; top: string; rotation: number }> => {
  const layout = getLayout(numPlayers);
  const result: Record<number, { left: string; top: string; rotation: number }> = {};
  layout.forEach((coords, idx) => {
    result[idx + 1] = coords;
  });
  return result;
};
