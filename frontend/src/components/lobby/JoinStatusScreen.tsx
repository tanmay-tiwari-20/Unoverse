'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { PremiumLoader } from './PremiumLoader';

/**
 * What the player sees before the room snapshot arrives: either the connection
 * loader, or a "join failed" panel when the server rejected us (room gone, name
 * taken, room full…). Room-not-found additionally auto-redirects home; that
 * timer lives in the route so it keeps running independently of this view.
 */
export const JoinStatusScreen: React.FC = () => {
  const router = useRouter();
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const connectionStatus = useGameStore((s) => s.connectionStatus);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-screen arcade-bg arcade-dots">
      <div className="text-center max-w-sm flex flex-col items-center gap-4">
        {error ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="panel-arcade bg-gradient-to-b from-rose-600 to-red-800 p-6 flex flex-col items-center gap-4"
          >
            <ShieldAlert className="text-yellow-300 animate-bounce" size={48} />
            <h2 className="font-arcade text-2xl uppercase tracking-wide text-white arcade-stroke-sm">Join Failed</h2>
            <p className="font-rounded text-white/90 text-sm leading-relaxed font-semibold">
              {error === 'Room not found' ? 'This room no longer exists' : error}
            </p>
            {(error === 'Room not found' || error === 'This room no longer exists') && (
              <p className="font-rounded text-[11px] text-yellow-200 font-bold uppercase tracking-wider animate-pulse">
                Redirecting to home page shortly...
              </p>
            )}
            <button
              onClick={() => {
                setError(null);
                router.push('/');
              }}
              className="btn-arcade w-full bg-gradient-to-b from-blue-400 to-blue-600 text-white py-3 px-4 text-sm uppercase"
            >
              Return Home
            </button>
          </motion.div>
        ) : (
          <PremiumLoader
            message="Connecting to Lobby..."
            submessage={`Status: ${connectionStatus.toUpperCase()} • Syncing seating slots...`}
          />
        )}
      </div>
    </div>
  );
};

export default JoinStatusScreen;
