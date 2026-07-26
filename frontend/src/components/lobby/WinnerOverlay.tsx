'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { getSeatCoords } from '../../utils/seating';

/**
 * Darkens the table and leaves a soft spotlight over the winner's seat once the
 * round ends.
 *
 * The seat is resolved the same way the 3D scene lays seats out: positions are
 * relative to the local player, so the winner's *visual* slot is their roster
 * offset from us, not their raw seat number.
 */
export const WinnerOverlay: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const winnerId = useGameStore((s) => s.winnerId);

  const winnerPlayer = room?.players.find((p) => p.id === winnerId);
  if (gameStatus !== 'ended' || !winnerPlayer || !room) return null;

  const getWinnerCoords = () => {
    const playerIndex = room.players.findIndex((p) => p.id === winnerId);
    if (playerIndex !== -1) {
      const localIndex = room.players.findIndex((p) => p.id === player?.id);
      const visualSlotIndex =
        (playerIndex - (localIndex !== -1 ? localIndex : 0) + room.players.length) % room.players.length;
      return getSeatCoords(visualSlotIndex, 0, room.players.length);
    }
    return getSeatCoords(winnerPlayer.seatNumber, player?.seatNumber || 1, 6);
  };
  const winnerCoords = getWinnerCoords();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        background: `radial-gradient(circle 200px at ${winnerCoords.left} ${winnerCoords.top}, transparent 10%, rgba(3, 7, 18, 0.88) 100%)`,
      }}
    />
  );
};

export default WinnerOverlay;
