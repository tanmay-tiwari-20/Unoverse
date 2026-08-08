'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Eye, Crown, ChevronDown, Bot, Trophy, Play, Layers, Lock } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { PresetAvatar } from '../profile/PresetAvatar';
import { PlayerIdTag } from '../social/PlayerIdTag';
import { PeerMuteButton } from './PeerMuteButton';
import { EmptyState, Modal, ModalBody, ModalHeader, Notice } from './kit';
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
 * ============================================================================
 *  Scoreboard — the always-available answer to "who is at this table?"
 * ============================================================================
 *
 * Replaces the old RoomRoster. Same authoritative data sources (room.players /
 * room.spectators / houseRules / match), same collapsed-chip footprint, but the
 * expanded list is now a real scoreboard rather than a name list: avatar,
 * name, Player ID, cards in hand, match points, and the host / bot / turn /
 * spectator markers, ranked so the leader is obvious at a glance.
 *
 * Two deliberate structural choices:
 *
 *  1. It stays COLLAPSED by default and anchors to the top-left HUD chip. A
 *     permanent scoreboard would cover the table on a phone; a chip that reads
 *     "3/6" costs one line and expands on demand.
 *
 *  2. The list body is a separate component that only mounts while open. Card
 *     counts and the active seat change constantly during a round — keeping
 *     those subscriptions inside the panel means a closed scoreboard re-renders
 *     only when someone joins or leaves, never on gameplay churn.
 *
 *  3. The expanded list takes two genuinely different SHAPES, not one shape
 *     scaled down. With room to spare it is an anchored popover hanging off its
 *     own chip, which keeps the table visible and costs no scrim. On a phone or
 *     a landscape phone a 19rem popover pinned to the top-left corner is the
 *     worst of both worlds — it covers the table anyway and it is nowhere near
 *     your thumbs — so there it becomes a real centred dialog with a header, a
 *     scrim and a focus trap.
 */

/** One scoreboard row. Memoised on its primitive inputs so a single player's
 *  card count changing does not re-render the other nine rows. */
const PlayerRow = React.memo(function PlayerRow({
  name,
  uid,
  seatNumber,
  avatar,
  profileId,
  isBot,
  isHost,
  isLocal,
  isTurn,
  isLeader,
  cardCount,
  points,
  showPoints,
}: {
  name: string;
  uid: string;
  seatNumber: number;
  avatar?: string | null;
  profileId?: string;
  isBot?: boolean;
  isHost?: boolean;
  isLocal: boolean;
  isTurn: boolean;
  isLeader: boolean;
  cardCount: number | null;
  points: number | null;
  showPoints: boolean;
}) {
  // Low-card emphasis mirrors the in-world SeatBadge exactly, so the table and
  // the scoreboard never tell a different story about who is about to win.
  const lowCards = cardCount != null && cardCount > 0 && cardCount <= 2;

  return (
    <li
      className={`ui-card flex items-center gap-2 px-2 py-1.5 ${
        isTurn ? 'ui-card-active' : isLocal ? 'ui-card-self' : ''
      }`}
      aria-current={isTurn ? 'true' : undefined}
    >
      {/* Avatar + seat number. The seat disc doubles as the rank marker the
          3D table uses, so a player can match a row to a chair. */}
      <div className="relative shrink-0">
        <PresetAvatar avatarKey={avatar} size={28} className="!border-2" />
        <span
          className="absolute -bottom-1 -right-1 grid h-[14px] min-w-[14px] place-items-center rounded-full border border-white/70 bg-neutral-900 px-[3px] font-arcade text-[8px] leading-none text-white"
          aria-hidden="true"
        >
          {seatNumber}
        </span>
      </div>

      {/* Name → Player ID. Two tiers only: the name is what you read, the ID is
          what you check when two names collide. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className={`font-rounded truncate text-[11px] font-bold leading-tight ${
              isTurn ? 'text-white' : 'text-white/90'
            }`}
          >
            {name}
          </span>
          {isLocal && (
            <span className="font-rounded shrink-0 text-[9px] font-bold uppercase tracking-wide text-sky-300">
              You
            </span>
          )}
          {isHost && (
            <Crown size={11} className="shrink-0 text-yellow-300" aria-label="Host" />
          )}
          {isBot && <Bot size={11} className="shrink-0 text-cyan-300" aria-label="Bot player" />}
        </div>
        <div className="flex items-center gap-1.5 leading-tight">
          <PlayerIdTag id={profileId} size="text-[9px]" />
          {isTurn && (
            <span className="font-rounded inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
              <Play size={8} fill="currentColor" aria-hidden="true" />
              Turn
            </span>
          )}
          {isLeader && !isTurn && (
            <span className="font-rounded inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-yellow-300">
              <Trophy size={8} aria-hidden="true" />
              Lead
            </span>
          )}
        </div>
      </div>

      {/* Numbers, right-aligned and tabular so the column scans vertically. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {cardCount != null && (
          <span
            key={cardCount}
            className={`hud-count-bump inline-flex h-5 min-w-[22px] items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-bold tabular-nums leading-none ${
              lowCards
                ? 'bg-amber-400 text-slate-900 ring-1 ring-amber-200/70'
                : 'bg-white/12 text-white/85'
            }`}
            title={`${cardCount} card${cardCount === 1 ? '' : 's'} in hand`}
          >
            <Layers size={8} className="opacity-70" aria-hidden="true" />
            {cardCount}
          </span>
        )}
        {showPoints && (
          <span
            className={`font-arcade min-w-[26px] text-right text-[11px] tabular-nums leading-none ${
              isLeader ? 'text-yellow-300' : 'text-white/70'
            }`}
            title="Match points"
          >
            {points ?? 0}
          </span>
        )}
        {!isBot && <PeerMuteButton uid={uid} name={name} isLocal={isLocal} />}
      </div>

      {/* One screen-reader sentence per row — the visual layout is a table, but
          a row read aloud should still be a sentence. */}
      <span className="sr-only">
        {`Seat ${seatNumber}, ${name}${isLocal ? ' (you)' : ''}${isHost ? ', host' : ''}${
          isBot ? ', bot' : ''
        }${cardCount != null ? `, ${cardCount} cards` : ''}${
          showPoints ? `, ${points ?? 0} points` : ''
        }${isTurn ? ', taking their turn' : ''}${isLeader ? ', leading the match' : ''}`}
      </span>
    </li>
  );
});

/** The expanded body. Mounted only while open — see the note above. */
const ScoreboardBody: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const spectatorSelf = useGameStore((s) => s.spectator);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const houseRules = useGameStore((s) => s.houseRules);
  const playerCards = useGameStore((s) => s.playerCards);
  const match = useGameStore((s) => s.match);

  const maxPlayers = getMaxPlayers(room, houseRules);
  const playerCount = getActivePlayerCount(room);
  const spectatorCount = getSpectatorCount(room);
  const maxSpectators = getMaxSpectators(room, houseRules);
  const isFull = isRoomFull(room, houseRules);
  const spectatorsFull = areSpectatorsFull(room, houseRules);
  const completelyFull = isRoomCompletelyFull(room, houseRules);
  const spectators = room?.spectators ?? [];
  const spectatorsEnabled = (room?.houseRules ?? houseRules)?.spectatorMode !== false;

  const inRound = gameStatus !== 'lobby';
  const showPoints = !!match && Object.keys(match.scores).length > 0;

  // Rank by match points while a match is running, otherwise keep seat order —
  // reordering an idle lobby every time someone joins is disorienting.
  const rows = useMemo(() => {
    const list = [...(room?.players ?? [])];
    if (showPoints && match) {
      list.sort(
        (a, b) =>
          (match.scores[b.uid]?.points ?? 0) - (match.scores[a.uid]?.points ?? 0) ||
          a.seatNumber - b.seatNumber
      );
    } else {
      list.sort((a, b) => a.seatNumber - b.seatNumber);
    }
    return list;
  }, [room?.players, match, showPoints]);

  const topPoints = useMemo(() => {
    if (!showPoints || !match) return null;
    const values = (room?.players ?? []).map((p) => match.scores[p.uid]?.points ?? 0);
    const max = Math.max(0, ...values);
    // A leader marker is only meaningful once someone is actually ahead.
    return max > 0 && values.filter((v) => v === max).length === 1 ? max : null;
  }, [showPoints, match, room?.players]);

  return (
    <>
      {/* Capacity + match context in one line each — the header answers "how
          full is this table" and "what are we playing to". */}
      <div className="flex items-center justify-between gap-2">
        <span className="ui-section-label">
          <Users size={11} aria-hidden="true" />
          Players
        </span>
        <span
          className={`font-arcade text-[11px] tabular-nums ${
            isFull ? 'text-amber-300' : 'text-lime-300'
          }`}
        >
          {playerCount}/{maxPlayers}
        </span>
      </div>

      {showPoints && match && (
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-white/10 bg-white/5 px-2 py-1">
          <span className="font-rounded text-[10px] font-bold uppercase tracking-wide text-white/50">
            Round {match.round}
          </span>
          <span className="font-rounded text-[10px] font-bold text-white/70">
            First to <span className="font-arcade text-yellow-300">{match.targetScore}</span>
          </span>
        </div>
      )}

      {(completelyFull || isFull) && (
        <Notice
          tone={completelyFull ? 'bad' : 'warn'}
          icon={completelyFull ? <Lock size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
        >
          {completelyFull
            ? 'Room is completely full — no one else can join.'
            : 'All seats taken. New arrivals join as spectators.'}
        </Notice>
      )}

      <ul className="flex flex-col" style={{ gap: 'var(--ui-gap-tight)' }} aria-label="Players">
        {rows.map((p) => {
          const points = match?.scores[p.uid]?.points ?? 0;
          return (
            <PlayerRow
              key={p.uid}
              name={p.name}
              uid={p.uid}
              seatNumber={p.seatNumber}
              avatar={p.avatar}
              profileId={p.profileId}
              isBot={p.isBot}
              isHost={p.isHost}
              isLocal={!isSpectator && p.id === player?.id}
              isTurn={p.id === currentPlayerId && gameStatus === 'playing'}
              isLeader={showPoints && topPoints != null && points === topPoints}
              cardCount={inRound ? (playerCards[p.seatNumber]?.length ?? 0) : null}
              points={points}
              showPoints={showPoints}
            />
          );
        })}
        {rows.length === 0 && (
          <EmptyState icon={<Users size={22} />} title="No players yet" className="!py-4" />
        )}
      </ul>

      {/* Spectators — same row language, visibly a separate group. */}
      <div className="flex items-center justify-between gap-2">
        <span className="ui-section-label">
          <Eye size={11} aria-hidden="true" />
          Spectators
        </span>
        <span
          className={`font-arcade text-[11px] tabular-nums ${
            spectatorsFull ? 'text-amber-300' : 'text-cyan-200'
          }`}
        >
          {spectatorsEnabled ? `${spectatorCount}/${maxSpectators}` : 'Off'}
        </span>
      </div>

      {spectatorCount > 0 ? (
        <ul className="flex flex-col" style={{ gap: 'var(--ui-gap-tight)' }} aria-label="Spectators">
          {spectators.map((s) => {
            const isLocalSpec = isSpectator && !!spectatorSelf && s.uid === spectatorSelf.uid;
            return (
              <li
                key={s.uid}
                className={`ui-card flex items-center gap-2 px-2 py-1 ${
                  isLocalSpec ? 'ui-card-self' : ''
                }`}
              >
                <Eye size={12} className="shrink-0 text-cyan-300" aria-hidden="true" />
                <span className="font-rounded min-w-0 flex-1 truncate text-[11px] font-bold text-white/85">
                  {s.name}
                  {isLocalSpec && (
                    <span className="ml-1 text-[9px] uppercase tracking-wide text-sky-300">You</span>
                  )}
                </span>
                <PlayerIdTag id={s.profileId} size="text-[9px]" />
                <PeerMuteButton uid={s.uid} name={s.name} isLocal={isLocalSpec} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="font-rounded px-1 text-[10px] font-bold text-white/35">
          {spectatorsEnabled ? 'Nobody is watching.' : 'Spectating is disabled.'}
        </p>
      )}
    </>
  );
};

export const Scoreboard: React.FC = () => {
  // Closed-state subscriptions only: capacity changes when someone joins or
  // leaves, which is rare. Nothing here reacts to gameplay.
  const room = useGameStore((s) => s.room);
  const houseRules = useGameStore((s) => s.houseRules);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Enough width AND height to hang a panel off the chip without burying the
  // table. Below either threshold the roster becomes a dialog instead.
  const asPopover = useMediaQuery('(min-width: 640px) and (min-height: 500px)');

  // Click-away + Escape, for the popover only. A HUD popover that can only be
  // closed by finding its own button again is a trap on a phone. In dialog mode
  // the kit `Modal` owns both, plus the focus trap.
  useEffect(() => {
    if (!open || !asPopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, asPopover]);

  if (!room) return null;

  const maxPlayers = getMaxPlayers(room, houseRules);
  const playerCount = getActivePlayerCount(room);
  const spectatorCount = getSpectatorCount(room);
  const maxSpectators = getMaxSpectators(room, houseRules);
  const isFull = isRoomFull(room, houseRules);
  const spectatorsFull = areSpectatorsFull(room, houseRules);

  const close = () => setOpen(false);

  return (
    <div ref={wrapRef} className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={asPopover ? 'scoreboard-panel' : undefined}
        aria-haspopup={asPopover ? undefined : 'dialog'}
        aria-label={`Scoreboard. ${playerCount} of ${maxPlayers} seats filled${
          spectatorCount > 0 ? `, ${spectatorCount} watching` : ''
        }. ${open ? 'Collapse' : 'Expand'}`}
        title="Scoreboard"
        className="ui-hud-glass ui-hud-pill group flex cursor-pointer items-center gap-1.5 border-white/15 px-2.5 text-white transition-colors hover:border-white/35 sm:gap-2 sm:px-3"
        style={{ height: 'var(--ui-tap)' }}
      >
        <Users
          size={13}
          className={isFull ? 'text-amber-300' : 'text-lime-300'}
          aria-hidden="true"
        />
        <span className="font-arcade whitespace-nowrap text-[10px] tracking-wider text-white sm:text-xs">
          {playerCount}/{maxPlayers}
        </span>
        {spectatorCount > 0 && (
          <span className="flex items-center gap-1 border-l border-white/20 pl-1.5 sm:pl-2">
            <Eye
              size={13}
              className={spectatorsFull ? 'text-amber-300' : 'text-cyan-300'}
              aria-hidden="true"
            />
            <span className="font-arcade whitespace-nowrap text-[10px] tracking-wider text-cyan-200 sm:text-xs">
              {spectatorCount}/{maxSpectators}
            </span>
          </span>
        )}
        <ChevronDown
          size={13}
          className={`text-white/70 transition-transform group-hover:text-white ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {asPopover ? (
        <AnimatePresence>
          {open && (
            <motion.div
              id="scoreboard-panel"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.6 }}
              /* Width is capped against the viewport, not just a fixed rem value,
                 so the panel can never push the HUD sideways. Height is capped
                 in dvh so a ten-seat table scrolls instead of overflowing.

                 `position` is set inline rather than with the `absolute`
                 utility: globals.css is unlayered, so `.ui-panel`'s own
                 `position: relative` outranks anything in `@layer utilities`.
                 Left as a class, the popover stayed in flow and grew the
                 header row, which is what pushed the Invite chip down. */
              className="ui-panel left-0 z-50 mt-2"
              style={{
                position: 'absolute',
                width: 'min(19rem, calc(100vw - 1.5rem))',
                maxHeight: 'min(58dvh, 30rem)',
              }}
            >
              <div className="ui-body ui-body-tight custom-scrollbar">
                <ScoreboardBody />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <Modal open={open} onClose={close} size="sm" labelledBy="scoreboard-title">
          <ModalHeader
            id="scoreboard-title"
            title="At the table"
            subtitle={
              spectatorCount > 0
                ? `${playerCount}/${maxPlayers} seats · ${spectatorCount} watching`
                : `${playerCount}/${maxPlayers} seats filled`
            }
            icon={<Users size={18} aria-hidden="true" />}
            onClose={close}
            closeLabel="Close scoreboard"
          />
          <ModalBody className="ui-body-tight">
            <ScoreboardBody />
          </ModalBody>
        </Modal>
      )}
    </div>
  );
};

export default Scoreboard;
