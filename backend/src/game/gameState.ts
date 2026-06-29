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
  // Draw-card stacking: when a +2 / +4 is played it starts (or extends) a draw
  // chain instead of resolving immediately. drawStack is the accumulated number
  // of cards the next non-stacking player must draw; pendingDrawType records what
  // sits on top of the chain so we can enforce the stacking matrix
  // (+2 on +2, +4 on +2, +4 on +4 — but NOT +2 on +4). Both are zero/null when
  // no chain is active.
  drawStack: number;
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null;
  // After a normal draw, if the drawn card is immediately playable the turn is NOT
  // passed — instead the player gets to decide whether to play that specific card
  // or pass. drawnCardId holds the id of that just-drawn, still-playable card while
  // the engine waits for that decision; it's null whenever no such decision is
  // pending. Only this card may be played during the decision window.
  drawnCardId: string | null;
  turnDeadline?: number | null; // epoch ms when the current turn auto-resolves (null = no timer)
  lastAction?: {
    type: 'play' | 'draw' | 'pass';
    playerId: string;
    card?: CardItem;
    unoPenalty?: boolean; // true when a play triggered the automatic +4 UNO penalty
    drawCount?: number; // number of cards drawn (e.g. when eating a draw chain)
  };
}
