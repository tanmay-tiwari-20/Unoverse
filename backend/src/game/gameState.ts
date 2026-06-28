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
  lastAction?: {
    type: 'play' | 'draw';
    playerId: string;
    card?: CardItem;
  };
}
