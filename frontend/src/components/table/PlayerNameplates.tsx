'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { getSeatCoords } from '../../utils/seating';
import { Mic, MicOff } from 'lucide-react';

export const PlayerNameplates: React.FC = () => {
  const { room, player, currentPlayerId } = useGameStore();
  const { peerStatuses, isMicEnabled } = useVoiceStore();

  if (!room) return null;

  const localSeatNumber = player?.seatNumber || 1;
  const playersList = room.players || [];
  const numPlayers = playersList.length || 2;
  const localIndex = playersList.findIndex(p => p.id === player?.id);
  const safeLocalIndex = localIndex >= 0 ? localIndex : 0;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {playersList.map((occupant) => {
          const isLocal = occupant.id === player?.id;

          // Don't show nameplate in first person view (local player at bottom)
          if (isLocal) return null;

          const playerIndex = playersList.findIndex(p => p.id === occupant.id);
          const visualSlotIndex = (playerIndex - safeLocalIndex + numPlayers) % numPlayers;
          const coords = getSeatCoords(visualSlotIndex, 0, numPlayers);
          const isActiveTurn = occupant.id === currentPlayerId;

          const voiceStatus = peerStatuses[occupant.id];
          const isMuted = voiceStatus?.isMuted ?? true; // assume muted until signal
          const isSpeaking = voiceStatus?.isSpeaking ?? false;

          return (
            <motion.div
              key={`nameplate-${occupant.id}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.5 }}
              className={`absolute -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xl backdrop-blur-md transition-all ${
                isSpeaking 
                  ? 'bg-green-950/80 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)] ring-2 ring-green-400 animate-pulse'
                  : isActiveTurn
                    ? 'bg-blue-950/80 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                    : 'bg-slate-900/80 border-slate-700/50'
              }`}
              style={{
                left: coords.left,
                top: coords.top, // Adjust if it overlaps 3D model
                transform: `translate(-50%, -200%)`, // Raise it slightly above the seat
              }}
            >
              <span className={`text-[11px] font-black uppercase tracking-widest ${isActiveTurn ? 'text-white' : 'text-slate-300'}`}>
                {occupant.name}
              </span>

              {/* Mic Status Indicator */}
              <div className="flex items-center justify-center shrink-0">
                {isSpeaking ? (
                  <Mic size={14} className="text-green-400" />
                ) : isMuted ? (
                  <MicOff size={14} className="text-red-500" />
                ) : (
                  <Mic size={14} className="text-slate-400" />
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
