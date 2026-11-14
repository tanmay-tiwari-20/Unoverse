import type { Room } from '../rooms/roomManager';
import type { UnoGameState } from './gameState';

export interface UnoPenaltyNotice {
  playerId: string;
  playerName: string;
  drawCount: number;
}

/** Each action is announced once, even when reconnects resend its snapshot. */
export class UnoPenaltyNotifier {
  private seen = new WeakSet<object>();

  constructor(private emit: (code: string, notice: UnoPenaltyNotice) => void) {}

  /** Restored actions are history; do not replay their penalties after a restart. */
  public remember(game: UnoGameState | undefined): void {
    if (game?.lastAction) this.seen.add(game.lastAction);
  }

  public announce(room: Room): void {
    const game = room.game;
    const action = game?.lastAction;
    if (!game || !action || this.seen.has(action)) return;
    this.seen.add(action);
    const penalties = action.unoPenalties ?? (action.unoPenalty
      ? [{ playerId: action.playerId, drawCount: game.rules.unoPenaltyCards }]
      : []);
    for (const penalty of penalties) {
      const player = room.players.find((candidate) => candidate.id === penalty.playerId);
      this.emit(room.code, {
        playerId: penalty.playerId,
        playerName: player?.name ?? 'A player',
        drawCount: penalty.drawCount,
      });
    }
  }
}
