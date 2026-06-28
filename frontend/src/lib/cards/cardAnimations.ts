import { getSeatCoords } from '../../utils/seating';
import { generatePhase3DemoHand } from './mockCards';
import { CardItem, createCard } from './cardEngine';

interface SeatPlayer {
  seatNumber: number;
  id: string;
}

/**
 * Handles the round-robin dealer sequence:
 * Deals 7 cards to each seated player one-by-one (Seat 1 -> Seat 2 -> ... -> Seat 6).
 */
export const triggerDealerSequence = (
  players: SeatPlayer[],
  localSeatNumber: number,
  actions: {
    clearAllCards: () => void;
    setDrawPileCount: (count: number) => void;
    setDiscardPile: (cards: CardItem[]) => void;
    addCardToPlayer: (seatNumber: number, card: CardItem) => void;
  }
) => {
  // 1. Reset Board
  actions.clearAllCards();
  actions.setDrawPileCount(54);
  
  // Place initial green 7 discard card after a small delay
  setTimeout(() => {
    actions.setDiscardPile([createCard('green', '7')]);
  }, 400);

  if (players.length === 0) return;

  // 2. Sort players by seat number so dealer starts at Seat 1 (or lowest)
  const sortedPlayers = [...players].sort((a, b) => a.seatNumber - b.seatNumber);

  // 3. Generate the exact 7 demo cards for the local player
  const localDemoHand = generatePhase3DemoHand();

  // Draw pile coordinate percentages
  const deckX = '41%';
  const deckY = '50%';

  const cardsPerPlayer = 7;
  let throwIndex = 0;

  // Stagger throws (Seat 1 -> Seat 2 -> ... round by round)
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const player of sortedPlayers) {
      const seatNo = player.seatNumber;
      const isLocal = seatNo === localSeatNumber;
      const delay = throwIndex * 150; // 150ms delay between consecutive card throws

      setTimeout(() => {
        const triggerHtmlCardAnimation = (window as any).triggerHtmlCardAnimation;
        if (!triggerHtmlCardAnimation) return;

        // Generate card details
        let card: CardItem;
        if (isLocal) {
          // Use the specific requested demo card for this round
          card = localDemoHand[round] || createCard('red', '5');
        } else {
          // Opponents receive random cards
          const colors = ['red', 'blue', 'green', 'yellow'] as const;
          const color = colors[Math.floor(Math.random() * colors.length)];
          const value = String(Math.floor(Math.random() * 10)) as any;
          card = createCard(color, value);
        }

        // Determine destination coordinates on the table surface
        const coords = getSeatCoords(seatNo, localSeatNumber);

        // Trigger the HTML card animation
        triggerHtmlCardAnimation(
          card.color,
          card.value,
          deckX,
          deckY,
          coords.left,
          coords.top,
          0, // start rotation
          coords.rotation, // end rotation
          0.72, // start scale (draw pile size)
          isLocal ? 0.85 : 0.6, // end scale
          isLocal, // face up only for local player
          () => {
            // Callback: append card to hand and update deck count
            actions.addCardToPlayer(seatNo, card);
            actions.setDrawPileCount(Math.max(0, 54 - throwIndex));
          }
        );

      }, delay);

      throwIndex++;
    }
  }
};

