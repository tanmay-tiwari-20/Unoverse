import type { Room } from '../rooms/roomManager';
import { DISCARD_VISIBLE_COUNT } from '../config/serverConfig';

/** Build only the game information a particular seated player may receive. */
export function createGameSnapshot(room: Room, recipientId: string | null) {
  const game = room.game;
  if (!game) throw new Error('Cannot create a snapshot before a game starts');

  const recipient = room.players.find((player) => player.id === recipientId);
  const activePlayer = room.players.find((player) => player.id === game.currentPlayerId);
  const winner = room.players.find((player) => player.id === game.winnerId);
  const hand = recipient ? game.hands[recipient.id] || [] : [];

  return {
    handCounts: Object.fromEntries(room.players.map((player) => [
      player.seatNumber, (game.hands[player.id] || []).length,
    ])),
    discardTop: game.discardPile.slice(-DISCARD_VISIBLE_COUNT),
    discardCount: game.discardPile.length,
    drawPileCount: game.deck.length,
    currentPlayerId: game.currentPlayerId,
    currentPlayerSeat: activePlayer?.seatNumber ?? 1,
    direction: game.direction,
    wildColor: game.wildColor,
    gameStatus: game.status,
    colorChooserId: game.colorChooserId,
    swapChooserId: game.swapChooserId ?? null,
    winnerId: game.winnerId,
    winnerName: winner?.name ?? null,
    unoCalled: game.unoCalled,
    drawStack: game.drawStack,
    pendingDrawType: game.pendingDrawType,
    challengeableById: game.challengeableById ?? null,
    // A pending draw is private even though the rest of the turn is public.
    drawnCardId: recipient?.id === game.currentPlayerId
      && hand.some((card) => card.id === game.drawnCardId)
      ? game.drawnCardId : null,
    turnDeadline: game.turnDeadline ?? null,
    lastAction: game.lastAction,
    match: room.match ?? null,
    houseRules: game.rules,
    ownSeat: recipient?.seatNumber ?? null,
    hand,
  };
}
