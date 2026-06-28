/**
 * Rebuilt seating utility for the 2.5D UNO Real tabletop layout.
 * Defines visual seat coordinates as percentages of the table viewport for 1 to 6 players.
 */

export interface SeatCoords {
  left: string;
  top: string;
  rotation: number; // rotation in degrees
}

const LAYOUTS: Record<number, SeatCoords[]> = {
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
 * Maps a player's seat number (1-6) from the server to one of the visual slots.
 * Ensures the local player is always rendered at bottom-center (Slot 1), and others
 * are mapped sequentially without rotating the table coordinates.
 * 
 * @param seatNumber Player's seat number (1 to 6)
 * @param localSeatNumber The seat number of the local user (1 to 6)
 * @param numPlayers Total number of seats/players in the active configuration
 */
export const getSeatCoords = (
  seatNumber: number,
  localSeatNumber: number,
  numPlayers: number = 6
): SeatCoords => {
  const visualSlotIndex = (seatNumber - localSeatNumber + numPlayers) % numPlayers;
  const layout = LAYOUTS[numPlayers] || LAYOUTS[6];
  return layout[visualSlotIndex] || layout[0];
};

/**
 * Returns all static visual slot coordinates for a given player count.
 */
export const getAllVisualSlots = (
  numPlayers: number = 6
): Record<number, { left: string; top: string; rotation: number }> => {
  const layout = LAYOUTS[numPlayers] || LAYOUTS[6];
  const result: Record<number, { left: string; top: string; rotation: number }> = {};
  layout.forEach((coords, idx) => {
    result[idx + 1] = coords;
  });
  return result;
};
