'use client';

import React from 'react';
import { Bot, Eye, Globe2, Minus, Play, Plus, ScrollText, Users } from 'lucide-react';
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
 * Layout: ONE status strip hangs from the top-centre (under the room header);
 * the host's action controls (Start / Rules / Arena, bot seats) render in a
 * bottom action bar that reflows to a single row on landscape phones so the
 * corners — Invite/Roster top-left, mic/chat/settings top-right — never collide
 * with it.
 *
 * The strip used to be up to FIVE stacked pills (capacity, arena, full-room
 * notice, spectator notice, a wrapped row of house-rule chips). Stacked over a
 * 3D table that is the point of the screen, that was the single biggest source
 * of clutter, and on a 390px-tall landscape phone it pushed into the card fan.
 * Now capacity, spectators, arena and the rule count share one line, and only a
 * genuine warning (the room being full) is allowed a second one. Nothing was
 * dropped: the rule NAMES live one tap away behind the Rules button that is
 * already on screen, and are repeated in this strip's tooltip.
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
      {/* ---- Status strip: one line of ambient facts, in the same glass as the
           header clusters. Read-only — controls live in the bottom bar. ---- */}
      <div className="flex flex-col items-center gap-1.5 short:gap-1">
        {/* `overflow-hidden` is the hard stop: the segments are individually
            nowrap, so on a 360px phone the arena name truncates first and the
            strip can never widen past the viewport. */}
        <div className="ui-hud-glass ui-hud-pill font-rounded inline-flex max-w-[92vw] items-center gap-2 overflow-hidden border-white/15 px-3 py-1.5 text-[10px] font-bold text-white short:py-1">
          {/* Seats. Amber once they are gone — paired with the "all seats taken"
              line below, never colour on its own. */}
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Users size={11} className={roomIsFull ? 'text-amber-300' : 'text-lime-300'} aria-hidden="true" />
            <span className="tabular-nums">
              {totalPlayers}/{maxPlayers}
            </span>
            <span className="text-white/45 tiny:hidden">seats</span>
          </span>

          {spectatorCount > 0 && (
            <>
              <span className="ui-hud-dot" aria-hidden="true" />
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                <Eye size={11} className="text-cyan-300" aria-hidden="true" />
                <span className="tabular-nums text-cyan-100">
                  {spectatorCount}/{maxSpectators}
                </span>
                <span className="text-white/45 tiny:hidden">watching</span>
              </span>
            </>
          )}

          <span className="ui-hud-dot" aria-hidden="true" />

          {/* Arena keeps its own accent — it is the one piece of identity in
              this strip, and the colour matches the world you are looking at.
              It is also the only flexible segment, so it absorbs the squeeze. */}
          <span className="inline-flex min-w-0 items-center gap-1">
            <Globe2 size={11} className="shrink-0" style={{ color: arenaMeta.accent }} aria-hidden="true" />
            <span className="truncate" style={{ color: arenaMeta.accent }}>
              {arenaMeta.name}
            </span>
          </span>

          {/* House rules collapse to a count. The names are in the tooltip and,
              authoritatively, behind the Rules button already on screen. */}
          {activeRules.length > 0 && (
            <>
              <span className="ui-hud-dot" aria-hidden="true" />
              <span
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-fuchsia-200"
                title={`House rules: ${activeRules.join(', ')}`}
              >
                <ScrollText size={11} aria-hidden="true" />
                <span className="tabular-nums">{activeRules.length}</span>
                <span className="text-white/45 short:hidden tiny:hidden">
                  {activeRules.length === 1 ? 'rule' : 'rules'}
                </span>
              </span>
            </>
          )}
        </div>

        {/* The one thing that earns a second line: nobody else can sit down.
            Phrased in words, not just a colour change. */}
        {(roomCompletelyFull || roomIsFull) && (
          <span
            className={`font-rounded ui-hud-glass ui-hud-pill max-w-[92vw] px-3 py-1 text-center text-[10px] font-bold short:text-[9px] ${
              roomCompletelyFull
                ? 'border-rose-400/50 text-rose-200'
                : 'border-amber-400/50 text-amber-200'
            }`}
            role="status"
          >
            {roomCompletelyFull
              ? 'Room is completely full — no one else can join.'
              : 'All seats taken — new arrivals join as spectators.'}
          </span>
        )}

        {/* What being a spectator means. The persistent "Spectating" badge in
            the header says THAT you are one; this says what it costs you, and
            only in the lobby, where it is still actionable. */}
        {isSpectator && (
          <span
            className="font-rounded ui-hud-glass ui-hud-pill inline-flex max-w-[92vw] items-center gap-1.5 border-cyan-400/45 px-3 py-1 text-[10px] font-bold text-cyan-100 short:hidden"
            role="status"
          >
            <Eye size={11} aria-hidden="true" /> Watching only — you can chat and react, but not play.
          </span>
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
          /* One row, wrapping only when it must: setup controls in a glass
             tray, then Start as the single loud button on the screen. Three
             equally-loud arcade buttons plus a separate bot row used to make
             the primary action compete with the things you set up once. */
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            <div className="flex flex-wrap items-center justify-center gap-2 short:gap-1.5">
              <div className="ui-hud-glass ui-hud-tray">
                {/* Bot seats — add/remove AI opponents before the game starts.
                    Bots fill player seats only; a joining human automatically
                    takes a bot's place. */}
                <button
                  disabled={isProcessing || botPlayers.length === 0}
                  onClick={() => {
                    const lastBot = botPlayers[botPlayers.length - 1];
                    if (lastBot) removeBot(lastBot.id);
                  }}
                  className="ui-hud-btn ui-hud-btn-sm"
                  title="Remove a bot"
                  aria-label="Remove a bot"
                >
                  <Minus size={13} />
                </button>
                <span
                  className="font-rounded inline-flex items-center gap-1 px-1 text-[11px] font-bold text-white"
                  aria-live="polite"
                >
                  <Bot size={12} className="text-cyan-300" aria-hidden="true" />
                  <span className="tabular-nums">{botPlayers.length}</span>
                  <span className="text-white/45 short:hidden">
                    {botPlayers.length === 1 ? 'bot' : 'bots'}
                  </span>
                </span>
                <button
                  disabled={isProcessing || roomIsFull}
                  onClick={() => addBots(1)}
                  className="ui-hud-btn ui-hud-btn-sm"
                  title="Add a bot opponent"
                  aria-label="Add a bot opponent"
                >
                  <Plus size={13} />
                </button>

                <span className="ui-hud-sep" aria-hidden="true" />

                <button
                  onClick={() => setIsHouseRulesOpen(true)}
                  className="ui-hud-btn ui-hud-btn-wide"
                  title="Configure House Rules"
                  aria-haspopup="dialog"
                >
                  <ScrollText size={14} aria-hidden="true" />
                  <span className="font-rounded text-[11px] font-bold uppercase tracking-wide">
                    Rules
                  </span>
                </button>
                <button
                  onClick={() => setIsArenaOpen(true)}
                  className="ui-hud-btn ui-hud-btn-wide"
                  title={`Arena: ${arenaMeta.name} — click to change`}
                  aria-haspopup="dialog"
                >
                  <Globe2 size={14} aria-hidden="true" />
                  <span className="font-rounded text-[11px] font-bold uppercase tracking-wide">
                    Arena
                  </span>
                </button>
              </div>

              {humanPlayers.length < 2 && !roomIsFull && (
                <button
                  disabled={isProcessing || isSpectator}
                  onClick={() => {
                    setIsProcessing(true);
                    startGame({ fillWithBots: true });
                  }}
                  className="btn-arcade inline-flex cursor-pointer items-center gap-1.5 bg-gradient-to-b from-cyan-400 to-blue-600 px-4 py-2 text-[11px] uppercase text-white disabled:cursor-not-allowed short:px-3 short:py-1.5 short:text-[10px]"
                  title="Fill every empty seat with bots and start"
                >
                  <Bot size={13} /> <span className="short:hidden">Fill &amp; Play vs Bots</span>
                  <span className="hidden short:inline">Fill &amp; Play</span>
                </button>
              )}

              <button
                disabled={!canStart || isProcessing || isSpectator}
                onClick={() => {
                  setIsProcessing(true);
                  startGame();
                }}
                className="btn-arcade inline-flex cursor-pointer items-center gap-1.5 bg-gradient-to-b from-lime-400 to-green-600 px-7 py-2.5 text-sm uppercase text-white disabled:cursor-not-allowed short:px-5 short:py-1.5 short:text-xs"
              >
                <Play size={15} className="fill-white" /> Start
              </button>
            </div>

            {!canStart && (
              <span
                className="font-rounded ui-hud-glass ui-hud-pill border-white/15 px-3 py-1 text-center text-[10px] font-bold text-yellow-200 short:hidden"
                role="status"
              >
                Invite a friend or add a bot to start
              </span>
            )}
          </div>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 short:gap-1.5">
            <span
              className="font-rounded ui-hud-glass ui-hud-pill border-white/15 px-3 py-1.5 text-[10px] font-bold text-yellow-200"
              role="status"
            >
              Waiting for host&hellip;
            </span>
            <div className="ui-hud-glass ui-hud-tray">
              <button
                onClick={() => setIsHouseRulesOpen(true)}
                className="ui-hud-btn ui-hud-btn-wide"
                title="View House Rules"
                aria-haspopup="dialog"
              >
                <ScrollText size={14} aria-hidden="true" />
                <span className="font-rounded text-[11px] font-bold uppercase tracking-wide">
                  Rules
                </span>
              </button>
              <button
                onClick={() => setIsArenaOpen(true)}
                className="ui-hud-btn ui-hud-btn-wide"
                title={`Arena: ${arenaMeta.name}`}
                aria-haspopup="dialog"
              >
                <Globe2 size={14} aria-hidden="true" />
                <span className="font-rounded text-[11px] font-bold uppercase tracking-wide">
                  Arena
                </span>
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

