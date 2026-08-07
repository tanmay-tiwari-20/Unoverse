'use client';

import React from 'react';
import { Bot, Eye, Globe2, Minus, Play, Plus, ScrollText } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSocket } from '../../hooks/useSocket';
import { summarizeActiveRules } from '../../lib/houseRules';
import { getArenaMeta } from '../../lib/arenas/registry';
import { ArenaPickerModal } from './ArenaPickerModal';
import {
  getMaxPlayers,
  getMaxSpectators,
  getSpectatorCount,
  isRoomCompletelyFull,
  isRoomFull,
} from '../../utils/capacity';

/**
 * Pre-game HUD: who is here, whether anyone else can still join, and the host's
 * controls for starting the round (including bot seats and house rules).
 *
 * Every number shown is derived from the authoritative room snapshot through
 * the shared capacity helpers, so this panel can never disagree with the roster
 * or with what the server will actually allow.
 *
 * Layout: status chips hang from the top-centre (under the room header); the
 * host's action controls (Start / Rules / Arena, bot seats) render in a bottom
 * action bar that reflows to a single row on landscape phones so the corners —
 * Invite/Roster top-left, mic/chat/settings top-right — never collide with it.
 */
export const LobbyView: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const houseRules = useGameStore((s) => s.houseRules);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const setIsProcessing = useGameStore((s) => s.setIsProcessing);
  const { setIsHouseRulesOpen } = useSettingsStore();
  const { startGame, addBots, removeBot } = useSocket();

  const [isArenaOpen, setIsArenaOpen] = React.useState(false);

  const isHost = player?.isHost || false;
  const totalPlayers = room?.players.length || 0;
  const humanPlayers = room?.players.filter((p) => !p.isBot) ?? [];
  const botPlayers = room?.players.filter((p) => p.isBot) ?? [];
  const canStart = totalPlayers >= 2;
  // Active-player capacity comes from the authoritative room config (house rules),
  // derived through the shared helpers so every surface shows the same numbers.
  const maxPlayers = getMaxPlayers(room, houseRules);
  const spectatorCount = getSpectatorCount(room);
  const maxSpectators = getMaxSpectators(room, houseRules);
  const roomIsFull = isRoomFull(room, houseRules);
  const roomCompletelyFull = isRoomCompletelyFull(room, houseRules);

  const activeRules = houseRules ? summarizeActiveRules(houseRules) : [];
  const arenaMeta = getArenaMeta(room?.arena);

  return (
    <>
      {/* ---- Status group: hangs under the room header. Chips only, never
           controls, so it stays short enough to clear the corner clusters. ---- */}
      <div className="flex flex-col items-center gap-2 short:gap-1">
        {/* Capacity status — players vs the room's configured max, plus spectators */}
        <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-white px-3 py-1 rounded-full shadow-md inline-flex items-center gap-1.5">
          Players: {totalPlayers} / {maxPlayers}
          {spectatorCount > 0 && (
            <span className="text-cyan-300">· Spectators: {spectatorCount} / {maxSpectators}</span>
          )}
        </span>

        {/* Current arena chip — the world everyone will play in */}
        <span
          className="font-rounded font-bold text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5"
          style={{
            background: `${arenaMeta.accent}1f`,
            border: `1px solid ${arenaMeta.accent}66`,
            color: arenaMeta.accent,
          }}
        >
          <Globe2 size={11} /> {arenaMeta.name}
        </span>

        {/* Full-room notice — extra joiners become spectators; once the
            spectator slots also run out, the room accepts no one else */}
        {roomCompletelyFull ? (
          <span className="font-rounded font-bold text-[10px] bg-rose-500/15 border-2 border-rose-400/50 text-rose-200 px-3 py-1 rounded-full shadow-md text-center max-w-sm short:text-[9px]">
            Room is completely full — all player seats and spectator slots are taken. No one else can join.
          </span>
        ) : roomIsFull ? (
          <span className="font-rounded font-bold text-[10px] bg-amber-500/15 border-2 border-amber-400/50 text-amber-200 px-3 py-1 rounded-full shadow-md text-center max-w-sm short:text-[9px]">
            Playing room is full — all player slots are filled. New participants will join as spectators.
          </span>
        ) : null}

        {/* Local spectator explanation while waiting in the lobby */}
        {isSpectator && (
          <span className="font-rounded font-bold text-[10px] bg-cyan-500/15 border-2 border-cyan-400/50 text-cyan-200 px-3 py-1 rounded-full shadow-md inline-flex items-center gap-1.5 text-center max-w-sm short:hidden">
            <Eye size={12} aria-hidden="true" /> You joined as a spectator — you can watch, chat and react, but not play.
          </span>
        )}

        {/* Compact summary of the notable active house rules. Hidden on landscape
            phones: it is a reference detail, and the Rules button already opens
            the authoritative list. */}
        {activeRules.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1 max-w-md short:hidden">
            {activeRules.slice(0, 6).map((r) => (
              <span
                key={r}
                className="font-rounded font-bold text-[9px] uppercase tracking-wider bg-fuchsia-500/15 border border-fuchsia-400/40 text-fuchsia-200 px-2 py-0.5 rounded-full"
              >
                {r}
              </span>
            ))}
            {activeRules.length > 6 && (
              <span className="font-rounded font-bold text-[9px] text-slate-400">
                +{activeRules.length - 6} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* ---- Action bar: pinned to the bottom, which is empty during the lobby
           (the card fan only mounts once play starts). This keeps the controls
           clear of the Invite/Roster cluster top-left and the mic/chat/settings
           cluster top-right, which is what made the old single top-centre stack
           feel crowded — worst on a landscape phone, where six stacked rows had
           to fit in ~390px of height. `short:` collapses it to one row. ---- */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none flex justify-center px-2 safe-bottom"
        style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom), var(--safe-pad-bottom, 0px)) + var(--action-bar-gap))' }}
      >
        {isHost ? (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 short:flex-row short:items-center short:gap-2">
            <div className="flex items-center gap-2 short:gap-1.5">
              <button
                disabled={!canStart || isProcessing || isSpectator}
                onClick={() => {
                  setIsProcessing(true);
                  startGame();
                }}
                className="btn-arcade bg-gradient-to-b from-lime-400 to-green-600 text-white py-2.5 px-7 text-sm uppercase disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer short:py-1.5 short:px-5 short:text-xs"
              >
                <Play size={15} className="fill-white" /> Start
              </button>
              <button
                onClick={() => setIsHouseRulesOpen(true)}
                className="btn-arcade bg-gradient-to-b from-fuchsia-500 to-purple-700 text-white py-2.5 px-5 text-sm uppercase inline-flex items-center gap-1.5 cursor-pointer short:py-1.5 short:px-3.5 short:text-xs"
                title="Configure House Rules"
              >
                <ScrollText size={15} /> Rules
              </button>
              <button
                onClick={() => setIsArenaOpen(true)}
                className="btn-arcade bg-gradient-to-b from-cyan-400 to-blue-600 text-white py-2.5 px-5 text-sm uppercase inline-flex items-center gap-1.5 cursor-pointer short:py-1.5 short:px-3.5 short:text-xs"
                title={`Arena: ${arenaMeta.name} — click to change`}
              >
                <Globe2 size={15} /> Arena
              </button>
            </div>

            {/* Bot seat controls — add/remove AI opponents before the
                game starts. Bots fill player seats only; a joining
                human automatically takes a bot's place. */}
            <div className="flex items-center gap-1.5">
              <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-white px-2.5 py-1 rounded-full shadow-md inline-flex items-center gap-1.5">
                <Bot size={12} className="text-cyan-300" /> Bots: {botPlayers.length}
              </span>
              <button
                disabled={isProcessing || roomIsFull}
                onClick={() => addBots(1)}
                className="chip-arcade w-7 h-7 flex items-center justify-center text-white cursor-pointer bg-gradient-to-b from-cyan-500 to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add a bot opponent"
                aria-label="Add a bot opponent"
              >
                <Plus size={13} />
              </button>
              <button
                disabled={isProcessing || botPlayers.length === 0}
                onClick={() => {
                  const lastBot = botPlayers[botPlayers.length - 1];
                  if (lastBot) removeBot(lastBot.id);
                }}
                className="chip-arcade w-7 h-7 flex items-center justify-center text-white cursor-pointer bg-gradient-to-b from-neutral-600 to-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Remove a bot"
                aria-label="Remove a bot"
              >
                <Minus size={13} />
              </button>
              {humanPlayers.length < 2 && !roomIsFull && (
                <button
                  disabled={isProcessing || isSpectator}
                  onClick={() => {
                    setIsProcessing(true);
                    startGame({ fillWithBots: true });
                  }}
                  className="btn-arcade bg-gradient-to-b from-cyan-400 to-blue-600 text-white py-1.5 px-4 text-[11px] uppercase disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer short:px-3 short:text-[10px]"
                  title="Fill every empty seat with bots and start"
                >
                  <Bot size={13} /> <span className="short:hidden">Fill &amp; Play vs Bots</span>
                  <span className="hidden short:inline">Fill &amp; Play</span>
                </button>
              )}
            </div>

            {!canStart && (
              <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-yellow-300 px-3 py-1 rounded-full shadow-md text-center short:hidden">
                Waiting for players — invite a friend or add bots to start
              </span>
            )}
          </div>
        ) : (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 short:flex-row short:items-center short:gap-2">
            <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-yellow-300 px-3 py-1 rounded-full shadow-md">
              Waiting for host...
            </span>
            <div className="flex items-center gap-2 short:gap-1.5">
              <button
                onClick={() => setIsHouseRulesOpen(true)}
                className="btn-arcade bg-gradient-to-b from-fuchsia-500 to-purple-700 text-white py-2 px-5 text-xs uppercase inline-flex items-center gap-1.5 cursor-pointer short:py-1.5 short:px-3.5"
                title="View House Rules"
              >
                <ScrollText size={14} /> View Rules
              </button>
              <button
                onClick={() => setIsArenaOpen(true)}
                className="btn-arcade bg-gradient-to-b from-cyan-400 to-blue-600 text-white py-2 px-5 text-xs uppercase inline-flex items-center gap-1.5 cursor-pointer short:py-1.5 short:px-3.5"
                title={`Arena: ${arenaMeta.name}`}
              >
                <Globe2 size={14} /> View Arena
              </button>
            </div>
          </div>
        )}
      </div>

      <ArenaPickerModal isOpen={isArenaOpen} onClose={() => setIsArenaOpen(false)} />
    </>
  );
};

export default LobbyView;

