import { CardItem, CardColor, CardValue } from '../game/deck';
import { UnoGameState } from '../game/gameState';
import { Player } from '../rooms/roomManager';

/**
 * Deterministic builders for engine unit tests. The real startGameState() uses a
 * random shuffle, which is great for fuzzing but useless for asserting a specific
 * rule. These helpers let a test construct an exact board.
 */

let cardSeq = 0;
/** Make a card with a stable, unique id (value baked into the id, like the real deck). */
export const card = (color: CardColor, value: CardValue): CardItem => ({
  id: `${color}-${value}-test${cardSeq++}`,
  color,
  value,
});

export const players2 = (): Player[] => [
  { id: 'p1', name: 'Alice', seatNumber: 1, isHost: true, secret: 's1' },
  { id: 'p2', name: 'Bob', seatNumber: 2, isHost: false, secret: 's2' },
];

export const players3 = (): Player[] => [
  { id: 'p1', name: 'Alice', seatNumber: 1, isHost: true, secret: 's1' },
  { id: 'p2', name: 'Bob', seatNumber: 2, isHost: false, secret: 's2' },
  { id: 'p3', name: 'Cara', seatNumber: 3, isHost: false, secret: 's3' },
];

export interface StateOverrides {
  hands?: Record<string, CardItem[]>;
  discardPile?: CardItem[];
  deck?: CardItem[];
  currentPlayerId?: string;
  direction?: 'clockwise' | 'counter-clockwise';
  status?: UnoGameState['status'];
  wildColor?: CardColor | null;
  colorChooserId?: string | null;
  drawStack?: number;
  pendingDrawType?: 'draw_two' | 'wild_draw_four' | null;
  drawnCardId?: string | null;
  unoCalled?: Record<string, boolean>;
  winnerId?: string | null;
}

/**
 * Build a fully-formed UnoGameState with sensible defaults, overridable per field.
 * Defaults: 2 players, p1 to act, top card red-5, empty-ish deck filled with
 * filler cards so draws don't immediately exhaust.
 */
export const makeState = (overrides: StateOverrides = {}): UnoGameState => {
  const ids = Object.keys(overrides.hands ?? { p1: [], p2: [] });
  const unoCalled: Record<string, boolean> = {};
  ids.forEach((id) => { unoCalled[id] = false; });

  return {
    deck: overrides.deck ?? Array.from({ length: 20 }, () => card('green', '3')),
    discardPile: overrides.discardPile ?? [card('red', '5')],
    hands: overrides.hands ?? { p1: [], p2: [] },
    currentPlayerId: overrides.currentPlayerId ?? 'p1',
    direction: overrides.direction ?? 'clockwise',
    wildColor: overrides.wildColor ?? null,
    status: overrides.status ?? 'playing',
    colorChooserId: overrides.colorChooserId ?? null,
    winnerId: overrides.winnerId ?? null,
    unoCalled: overrides.unoCalled ?? unoCalled,
    drawStack: overrides.drawStack ?? 0,
    pendingDrawType: overrides.pendingDrawType ?? null,
    drawnCardId: overrides.drawnCardId ?? null,
  };
};

/** Convenience: count of cards in a player's hand. */
export const handCount = (s: UnoGameState, id: string): number => s.hands[id]?.length ?? 0;
