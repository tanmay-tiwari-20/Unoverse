import type { UnoGameState } from './gameState';
import type { Player } from '../rooms/roomManager';

/** Identify a timed turn/decision independently of broadcasts and socket IDs. */
export function turnSignatureOf(game: UnoGameState, players: Pick<Player, 'id' | 'uid'>[]): string {
  let activeId = game.currentPlayerId;
  if (game.status === 'awaiting_color_selection') activeId = game.colorChooserId ?? activeId;
  else if (game.status === 'awaiting_swap_target') activeId = game.swapChooserId ?? activeId;
  const actor = players.find((player) => player.id === activeId)?.uid ?? activeId;
  // Draw-then-play opens its own timed decision without advancing the turn.
  const decision = game.drawnCardId ? ':decision' : '';
  return `${game.turnNumber ?? 0}:${game.status}:${actor}${decision}`;
}
