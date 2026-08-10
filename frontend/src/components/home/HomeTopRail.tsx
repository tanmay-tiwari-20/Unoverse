'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Flame, Maximize2, Minimize2, Trophy, WifiOff } from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';
import { useGameStore } from '../../store/useGameStore';
import { PresetAvatar } from '../profile/PresetAvatar';
import { FriendsButton } from '../social/FriendsButton';
import { useFullscreen } from '../../hooks/useFullscreen';

export const HomeTopRail: React.FC = () => {
  const hydrated = useProfileStore((s) => s.hydrated);
  const profileId = useProfileStore((s) => s.profileId);
  const name = useProfileStore((s) => s.displayName);
  const avatar = useProfileStore((s) => s.avatar);
  const stats = useProfileStore((s) => s.cachedProfile?.stats ?? null);
  const setIsProfileOpen = useProfileStore((s) => s.setIsProfileOpen);
  const status = useGameStore((s) => s.connectionStatus);
  const { isFullscreen, toggleFullscreen, isSupported } = useFullscreen();

  const live = status === 'connected';
  const known = hydrated && !!profileId;

  return (
    <div className="home-rail pointer-events-none fixed inset-x-0 top-0 z-30 hud-pad">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
        {/* Left — server status & quick player stats */}
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <span
            className="home-chip font-rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white/80 bg-black/40 border-white/15 backdrop-blur-md px-2.5 py-1"
            title={live ? 'Connected to the game server' : `Connection: ${status}`}
          >
            {live ? (
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
              </span>
            ) : (
              <WifiOff size={12} className="shrink-0 text-white/45" aria-hidden="true" />
            )}
            <span className={live ? 'text-lime-300 font-extrabold ml-1' : 'text-white/50 ml-1'}>
              {live ? 'Online' : status === 'connecting' ? 'Linking…' : 'Offline'}
            </span>
          </span>

          {known && stats && (
            <span className="hidden items-center gap-2 sm:flex">
              <span className="home-chip font-arcade text-[11px] sm:text-[12px] tabular-nums text-yellow-300 bg-yellow-500/10 border-yellow-400/30 backdrop-blur-md px-2.5 py-1">
                <Trophy size={13} className="shrink-0 text-yellow-400" aria-hidden="true" />
                {stats.matchesWon}
                <span className="font-rounded text-[9px] font-bold uppercase tracking-wider text-white/50 ml-1">
                  wins
                </span>
              </span>
              <span className="home-chip font-arcade text-[11px] sm:text-[12px] tabular-nums text-orange-300 bg-orange-500/10 border-orange-400/30 backdrop-blur-md px-2.5 py-1">
                <Flame size={13} className="shrink-0 text-orange-400 animate-pulse" aria-hidden="true" />
                {stats.currentStreak}
                <span className="font-rounded text-[9px] font-bold uppercase tracking-wider text-white/50 ml-1">
                  streak
                </span>
              </span>
            </span>
          )}
        </div>

        {/* Right — Fullscreen toggle, Friends drawer & Profile chip */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring', damping: 22, stiffness: 280 }}
          className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2"
        >
          {isSupported && (
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen mode' : 'Enter fullscreen mode'}
              aria-pressed={isFullscreen}
              className={`home-chip font-rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider backdrop-blur-md px-2.5 py-1.5 flex items-center gap-1.5 transition-all shadow-md active:scale-95 border cursor-pointer ${
                isFullscreen
                  ? 'bg-yellow-500/20 border-yellow-400/50 text-yellow-300 hover:bg-yellow-500/30'
                  : 'bg-black/40 border-white/15 text-white/80 hover:bg-white/15 hover:border-white/30'
              }`}
            >
              {isFullscreen ? (
                <Minimize2 size={13} className="shrink-0 text-yellow-300" />
              ) : (
                <Maximize2 size={13} className="shrink-0 text-white/70" />
              )}
              <span className="hidden sm:inline">
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </span>
            </button>
          )}

          {known && (
            <>
              <FriendsButton />

              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                aria-label="Open your player profile"
                className="chip-arcade flex cursor-pointer items-center gap-2 rounded-full border-2 border-white/25 bg-gradient-to-b from-white/15 to-white/5 hover:from-white/25 hover:to-white/10 hover:border-yellow-400/70 py-1 pl-1 pr-3 text-white transition-all shadow-lg active:scale-95"
              >
                <div className="relative shrink-0">
                  <PresetAvatar avatarKey={avatar} size={30} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-lime-400 border border-black" />
                </div>
                <span className="font-rounded max-w-[6.5rem] truncate text-[11px] font-extrabold uppercase tracking-wider text-white drop-shadow">
                  {name ?? 'Profile'}
                </span>
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default HomeTopRail;

