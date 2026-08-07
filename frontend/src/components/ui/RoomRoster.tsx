'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Eye, Crown, ChevronDown, CircleDot, Bot } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { PeerMuteButton } from './PeerMuteButton';
import {
  getMaxPlayers,
  getActivePlayerCount,
  getSpectatorCount,
  getMaxSpectators,
  isRoomFull,
  areSpectatorsFull,
  isRoomCompletelyFull,
} from '../../utils/capacity';

/**
 * Room roster HUD — the always-visible source of truth for who is PLAYING vs
 * WATCHING. Shows "Players n/max" (+ "Spectators n/max") as a compact chip;
 * expands into a full participant list with active players and spectators
 * clearly separated and labeled, each with a personal voice-mute toggle. All
 * data comes from the authoritative room state (room.players / room.spectators
 * / houseRules) — never from client-side guesses.
 */
export const RoomRoster: React.FC = () => {
  // Narrow selectors: this HUD is always mounted, so it must not re-render on
  // unrelated store churn (chat, reactions, card animations).
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const spectator = useGameStore((s) => s.spectator);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const houseRules = useGameStore((s) => s.houseRules);
  const [open, setOpen] = useState(false);

  if (!room) return null;

  const maxPlayers = getMaxPlayers(room, houseRules);
  const playerCount = getActivePlayerCount(room);
  const spectatorCount = getSpectatorCount(room);
  const maxSpectators = getMaxSpectators(room, houseRules);
  const isFull = isRoomFull(room, houseRules);
  const spectatorsFull = areSpectatorsFull(room, houseRules);
  const completelyFull = isRoomCompletelyFull(room, houseRules);
  const spectators = room.spectators ?? [];
  const spectatorsEnabled = (room.houseRules ?? houseRules)?.spectatorMode !== false;

  return (
    <div className="pointer-events-auto relative">
      {/* Compact capacity chip — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="room-roster-panel"
        aria-label={`Room roster. ${playerCount} of ${maxPlayers} player slots filled${
          spectatorCount > 0 ? `, ${spectatorCount} of ${maxSpectators} spectator slots filled` : ''
        }. ${open ? 'Collapse' : 'Expand'} participant list`}
        className="group chip-arcade flex items-center gap-1.5 sm:gap-2 bg-gradient-to-b from-neutral-800 to-black px-2.5 py-1.5 sm:px-3.5 sm:py-2 cursor-pointer"
        title="Show participants"
      >
        <Users size={13} className={isFull ? 'text-amber-300' : 'text-lime-300'} aria-hidden="true" />
        <span className="font-arcade text-[10px] sm:text-xs text-white tracking-wider whitespace-nowrap">
          {playerCount}/{maxPlayers}
        </span>
        {spectatorCount > 0 && (
          <span className="flex items-center gap-1 border-l border-white/20 pl-1.5 sm:pl-2">
            <Eye size={13} className={spectatorsFull ? 'text-amber-300' : 'text-cyan-300'} aria-hidden="true" />
            <span className="font-arcade text-[10px] sm:text-xs text-cyan-200 tracking-wider whitespace-nowrap">
              {spectatorCount}/{maxSpectators}
            </span>
          </span>
        )}
        <ChevronDown
          size={13}
          className={`text-white/70 group-hover:text-white transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Expanded roster panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="room-roster-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 mt-2 w-60 sm:w-64 max-h-[60dvh] overflow-y-auto custom-scrollbar panel-arcade bg-gradient-to-b from-neutral-900 to-black p-3 z-50 short:max-h-[52dvh] short:w-72 short:p-2"
          >
            {/* Capacity summary + full-room notice */}
            <div className="mb-2">
              <div className="flex items-center justify-between">
                <span className="font-arcade text-[10px] uppercase tracking-widest text-yellow-300">
                  Players
                </span>
                <span
                  className={`font-arcade text-[11px] tabular-nums ${isFull ? 'text-amber-300' : 'text-lime-300'}`}
                >
                  {playerCount} / {maxPlayers}
                </span>
              </div>
              {completelyFull ? (
                <p className="mt-1 font-rounded font-bold text-[10px] leading-snug text-rose-200 bg-rose-500/10 border border-rose-400/40 rounded-lg px-2 py-1">
                  Room is completely full. All player seats and spectator slots are
                  taken — no one else can join.
                </p>
              ) : isFull ? (
                <p className="mt-1 font-rounded font-bold text-[10px] leading-snug text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-lg px-2 py-1">
                  Playing room is full. All player slots are filled — new participants
                  will join as spectators.
                </p>
              ) : null}
            </div>

            {/* Active players */}
            <ul className="space-y-1" aria-label="Active players">
              {room.players.map((p) => {
                const isLocal = !isSpectator && p.id === player?.id;
                const isTurn = p.id === currentPlayerId && gameStatus === 'playing';
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border-2 ${
                      isLocal
                        ? 'bg-blue-500/20 border-blue-400/50'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <span className="w-5 h-5 shrink-0 rounded-full bg-gradient-to-b from-lime-400 to-green-600 border border-white/60 flex items-center justify-center font-arcade text-[9px] text-white">
                      {p.seatNumber}
                    </span>
                    <span className="font-rounded font-bold text-[11px] text-white truncate flex-1">
                      {p.name}
                      {isLocal && <span className="text-blue-300"> (You)</span>}
                    </span>
                    {p.isBot && (
                      <Bot size={12} className="text-cyan-300 shrink-0" aria-label="Bot player" />
                    )}
                    {isTurn && (
                      <CircleDot size={12} className="text-lime-300 animate-pulse shrink-0" aria-label="Taking their turn" />
                    )}
                    {p.isHost && (
                      <Crown size={12} className="text-yellow-300 shrink-0" aria-label="Host" />
                    )}
                    {/* Bots have no voice connection — nothing to mute */}
                    {!p.isBot && <PeerMuteButton name={p.name} isLocal={isLocal} />}
                  </li>
                );
              })}
              {room.players.length === 0 && (
                <li className="font-rounded text-[10px] text-slate-400 px-2 py-1">
                  No players seated yet.
                </li>
              )}
            </ul>

            {/* Spectators — visually separated from active players */}
            <div className="mt-3 pt-2 border-t-2 border-white/10">
              <div className="flex items-center justify-between">
                <span className="font-arcade text-[10px] uppercase tracking-widest text-cyan-300">
                  Spectators
                </span>
                <span
                  className={`font-arcade text-[11px] tabular-nums ${
                    spectatorsFull ? 'text-amber-300' : 'text-cyan-200'
                  }`}
                >
                  {spectatorsEnabled ? `${spectatorCount} / ${maxSpectators}` : 'Off'}
                </span>
              </div>
              {spectatorCount > 0 ? (
                <ul className="mt-1 space-y-1" aria-label="Spectators">
                  {spectators.map((s) => {
                    // The local spectator is identified by name (stable across
                    // socket reconnects, matching how players are matched).
                    const isLocalSpec = isSpectator && !!spectator && s.name === spectator.name;
                    return (
                      <li
                        key={s.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border-2 ${
                          isLocalSpec ? 'bg-cyan-500/20 border-cyan-400/50' : 'bg-white/5 border-white/10'
                        }`}
                      >
                        <Eye size={12} className="text-cyan-300 shrink-0" aria-hidden="true" />
                        <span className="font-rounded font-bold text-[11px] text-white/90 truncate flex-1">
                          {s.name}
                          {isLocalSpec && <span className="text-cyan-300"> (You)</span>}
                        </span>
                        <PeerMuteButton name={s.name} isLocal={isLocalSpec} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 font-rounded text-[10px] text-slate-400 px-2">
                  {spectatorsEnabled ? 'No one is spectating.' : 'Spectating is disabled.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoomRoster;
