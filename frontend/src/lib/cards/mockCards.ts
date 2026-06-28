import { CardColor, CardValue, CardItem, createCard } from './cardEngine';

// Generates the exact 7-card sample hand requested:
// Red 5, Blue Reverse, Yellow Skip, Wild, Green 8, Red Draw Two, Blue 1
export const generatePhase3DemoHand = (): CardItem[] => {
  return [
    createCard('red', '5'),
    createCard('blue', 'reverse'),
    createCard('yellow', 'skip'),
    createCard('wild', 'wild'),
    createCard('green', '8'),
    createCard('red', 'draw_two'),
    createCard('blue', '1'),
  ];
};

/**
 * Returns a set of default opponent card configurations
 * simulating card counts for other seated players.
 */
export const getOpponentDemoCardCounts = (seatNumber: number): number => {
  // Give each seat a slightly different card count for visual variety
  const counts: Record<number, number> = {
    1: 7, // Local player
    2: 5,
    3: 8,
    4: 6,
    5: 9,
    6: 4,
  };
  return counts[seatNumber] || 5;
};
