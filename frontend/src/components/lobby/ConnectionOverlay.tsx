'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

/**
 * Blocking overlay shown whenever the socket is not connected. It deliberately
 * covers the whole table: the client is never authoritative, so once the socket
 * drops nothing on screen can be trusted to still be true, and any input would
 * be silently discarded. Socket.IO keeps retrying underneath (polling first,
 * then upgrading), so this clears itself as soon as the transport recovers.
 */
export const ConnectionOverlay: React.FC = () => {
  const connectionStatus = useGameStore((s) => s.connectionStatus);

  if (connectionStatus === 'connected') return null;

  return (
    <div className="absolute inset-0 z-[3000] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-8 flex flex-col items-center gap-5 text-center max-w-sm"
      >
        <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
          <WifiOff size={28} className="animate-pulse" />
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-red-500"
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        </div>
        <div>
          <h3 className="font-arcade text-xl uppercase tracking-wide text-red-500 arcade-stroke-sm">
            Connection Lost
          </h3>
          <p className="font-rounded font-bold text-white/90 text-xs mt-2 leading-relaxed">
            Attempting to reconnect to game server...
          </p>
          <p className="font-rounded text-[10px] text-slate-400 mt-1 font-mono uppercase">
            Status: {connectionStatus.toUpperCase()}
          </p>
        </div>
        {/* Chunky arcade progress indicator */}
        <div className="w-40 h-2 bg-neutral-800 rounded-full overflow-hidden relative border-2 border-white/20">
          <motion.div
            animate={{ x: ['-100%', '250%'] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            className="absolute inset-y-0 w-1/3 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"
          />
        </div>
      </motion.div>
    </div>
  );
};

export default ConnectionOverlay;
