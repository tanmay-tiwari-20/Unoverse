/**
 * Calculates the index of the next player in the turn order.
 * Works with any number of players (2 to 6) and supports clockwise/counter-clockwise play.
 * 
 * @param currentIndex The array index of the current active player (0 to N-1)
 * @param direction The direction of play ('clockwise' | 'counter-clockwise')
 * @param numPlayers The total number of players in the game
 * @param skipCount How many positions to advance (1 for normal turn change, 2 for Skip card)
 */
export const getNextPlayerIndex = (
  currentIndex: number,
  direction: 'clockwise' | 'counter-clockwise',
  numPlayers: number,
  skipCount: number = 1
): number => {
  if (numPlayers <= 0) return 0;

  // In a 2-player game, Skip, Reverse, Draw Two, and Wild Draw Four all result in 
  // the other player being skipped, giving the current player another turn immediately.
  if (numPlayers === 2 && skipCount > 1) {
    return currentIndex;
  }

  const delta = direction === 'clockwise' ? skipCount : -skipCount;
  
  // Safe JavaScript modulo that handles negative results correctly
  return (currentIndex + delta + numPlayers * 10) % numPlayers;
};
