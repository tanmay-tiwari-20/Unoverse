'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { usePlatformRouter } from '../../hooks/usePlatformRouter';
import { HOME_HREF } from '../../lib/platform/routes';
import { PremiumLoader } from './PremiumLoader';

/**
 * What the player sees before the room snapshot arrives: either the connection
 * loader, or a "join failed" panel when the server rejected us (room gone, name
 * taken, room full…). Missing rooms keep a recovery screen visible until the
 * player chooses to return home.
 */
export const JoinStatusScreen: React.FC<{ onReturnHome: () => void }> = ({ onReturnHome }) => {
  const router = usePlatformRouter();
  const error = useGameStore((s) => s.error);
  const roomUnavailable = useGameStore((s) => s.roomUnavailable);
  const connectionStatus = useGameStore((s) => s.connectionStatus);

  if (!error && !roomUnavailable) {
    return (
      <PremiumLoader
        message="Connecting to Lobby..."
        submessage={`Status: ${connectionStatus.toUpperCase()} • Syncing seating slots...`}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-screen arcade-bg arcade-dots">
      <div className="text-center max-w-sm flex flex-col items-center gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="panel-arcade bg-gradient-to-b from-rose-600 to-red-800 p-6 flex flex-col items-center gap-4"
        >
          <ShieldAlert className="text-yellow-300 animate-bounce" size={48} />
          <h2 className="font-arcade text-2xl uppercase tracking-wide text-white arcade-stroke-sm">
            {roomUnavailable ? 'Room Unavailable' : 'Join Failed'}
          </h2>
          <p className="font-rounded text-white/90 text-sm leading-relaxed font-semibold">
            {roomUnavailable ? 'This room no longer exists. It may have expired or closed.' : error}
          </p>
          <button
            onClick={() => {
              onReturnHome();
              router.replace(HOME_HREF);
            }}
            className="btn-arcade w-full bg-gradient-to-b from-blue-400 to-blue-600 text-white py-3 px-4 text-sm uppercase"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default JoinStatusScreen;
