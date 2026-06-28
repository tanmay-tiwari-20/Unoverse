import { CardItem, CardColor } from './deck';

export interface UnoGameState {
  deck: CardItem[];
  discardPile: CardItem[];
  hands: Record<string, CardItem[]>; // socketId -> CardItem[]
  currentPlayerId: string; // socketId of the active player
  direction: 'clockwise' | 'counter-clockwise';
  wildColor: CardColor | null; // Chosen color for Wild / Wild Draw Four
  status: 'playing' | 'awaiting_color_selection' | 'ended';
  colorChooserId: string | null; // socketId of the player who must choose a color
  winnerId: string | null; // socketId of the winner when game ends
  unoCalled: Record<string, boolean>; // socketId -> boolean
  turnDeadline?: number | null; // epoch ms when the current turn auto-resolves (null = no timer)
  lastAction?: {
    type: 'play' | 'draw';
    playerId: string;
    card?: CardItem;
    unoPenalty?: boolean; // true when a play triggered the automatic +4 UNO penalty
  };
}
