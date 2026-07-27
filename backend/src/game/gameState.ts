import { CardItem, CardColor } from './deck';
import { HouseRules } from './houseRules';
import { RoundStatDelta } from '../profiles/profileTypes';

export interface UnoGameState {
  deck: CardItem[];
  discardPile: CardItem[];
  hands: Record<string, CardItem[]>; // socketId -> CardItem[]
  currentPlayerId: string; // socketId of the active player
  direction: 'clockwise' | 'counter-clockwise';
  wildColor: CardColor | null; // Chosen color for Wild / Wild Draw Four
  // The active color immediately BEFORE the current top card was played. Captured
  // when a card is played so a Wild Draw Four's legality (bluff) can be judged
  // against the color that was actually in play. Transient; overwritten each play.
  wildColorBefore?: CardColor | null;
  status: 'playing' | 'awaiting_color_selection' | 'awaiting_swap_target' | 'ended';
  colorChooserId: string | null; // socketId of the player who must choose a color
  swapChooserId: string | null; // socketId of the player who must pick a Seven-O swap target
  winnerId: string | null; // socketId of the winner when game ends
  unoCalled: Record<string, boolean>; // socketId -> boolean
  // The frozen, normalized house rules for THIS game. Snapshotted from the room at
  // start and never mutated mid-game, so every decision the engine makes is driven
  // by this object rather than hardcoded logic.
  rules: HouseRules;
  // Draw-card stacking: when a +2 / +4 is played it starts (or extends) a draw
  // chain instead of resolving immediately. drawStack is the accumulated number
  // of cards the next non-stacking player must draw; pendingDrawType records what
  // sits on top of the chain so we can enforce the stacking matrix. Both are
  // zero/null when no chain is active.
  drawStack: number;
  pendingDrawType: 'draw_two' | 'wild_draw_four' | null;
  // Wild Draw Four challenge context. When a +4 is played and challenges are
  // enabled, we record who played it and whether it was an illegal "bluff" (they
  // held a card matching the color in play). The targeted player may challenge
  // instead of drawing; resolution reads these fields. Cleared once resolved.
  wildFourPlayerId: string | null;
  wildFourWasBluff: boolean | null;
  challengeableById: string | null; // socketId of the player who may currently challenge a +4
  // After a normal draw, if the drawn card is immediately playable the turn is NOT
  // passed — instead the player gets to decide whether to play that specific card
  // or pass. drawnCardId holds the id of that just-drawn, still-playable card while
  // the engine waits for that decision; null whenever no decision is pending.
  drawnCardId: string | null;
  turnDeadline?: number | null; // epoch ms when the current turn auto-resolves (null = no timer)
  lastAction?: {
    type: 'play' | 'draw' | 'pass' | 'jump_in' | 'swap' | 'rotate' | 'challenge';
    playerId: string;
    card?: CardItem;
    unoPenalty?: boolean; // true when a play triggered the automatic UNO penalty
    drawCount?: number; // number of cards drawn (e.g. when eating a draw chain)
    targetId?: string; // for swap: the opponent whose hand was taken
    challengeSuccess?: boolean; // for challenge: whether the bluff was caught
  };
  // Epoch ms this round started. Used to record round/match duration for stats.
  startedAt?: number;
  // Per-player accumulation of gameplay actions this round, keyed by socketId.
  // Folded into each player's persistent profile at round end (server-authoritative
  // stat capture). Transient game data — never sent to clients or trusted from them.
  roundStats?: Record<string, RoundStatDelta>;
}
