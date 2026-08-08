'use client';

/**
 * ============================================================================
 *  EndOfRound — who won, where the match stands, and what happens next.
 * ============================================================================
 *
 * THE SHAPE OF THE REDESIGN. The old version stacked a bouncing trophy, a
 * pulsing headline, a scoreboard and two buttons into one narrow column, which
 * made the winner compete with the standings for attention and left a landscape
 * phone with a 28px-tall scroller for the scores. This version splits the screen
 * into two regions that are laid out differently per orientation:
 *
 *   portrait      hero on top (winner, one line of context) → standings below
 *   landscape     hero on the LEFT, standings scrolling on the RIGHT
 *
 * The winner is recognisable from the hero alone — avatar, name, and either
 * "YOU WIN" or "<name> wins" at the largest type on screen — so the standings
 * can stay quiet and compact instead of restating it.
 *
 * WHAT DID NOT CHANGE, deliberately:
 *   • "Did I win?" is still `match.matchWinnerUid === player.uid` — a SEAT
 *     comparison. Two players may share a display name and a name comparison
 *     would let an opponent's win light up my client.
 *   • The scoreboard is still keyed by seat uid, still sorted by the server's
 *     points, and still falls back to the banked name for players who left.
 *   • Only the host can advance, via `startGame()`; everyone else sees the wait
 *     state. Starting a round is the server's decision and this dialog only
 *     surfaces the affordance to the client allowed to ask.
 *   • `exitTable` still handles leaving, and `ConfettiCanvas` still celebrates.
 *
 * Cards-left is new and it is read, not derived: `playerCards[seat].length` is
 * the server's own `handCounts` for the final state of the round.
 */

import React, { useMemo } from 'react';
import { Award, DoorOpen, Hourglass, Medal, RefreshCw, Trophy } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useExitTable } from '../../hooks/useExitTable';
import { PresetAvatar } from '../profile/PresetAvatar';
import { PlayerIdTag } from '../social/PlayerIdTag';
import { Badge, Button, Modal, ModalBody, ModalFooter, SectionLabel } from '../ui/kit';
import { ConfettiCanvas } from './ConfettiCanvas';

interface ScoreEntry {
  /** Seat uid — the scoreboard's key, and this row's React key. */
  uid: string;
  name: string;
  /** Permanent Player ID, when this seat belongs to a profile. Display only. */
  playerId?: string | null;
  score: number;
  /** Preset avatar key for the live seat, when it is still occupied. */
  avatar?: string | null;
  /** Cards still in hand when the round ended. Null when the seat has left. */
  cardsLeft: number | null;
  isBot: boolean;
}

/** Rank furniture. Gold/silver/bronze, then a plain number — and always a
 *  numeral beside the icon, so rank never depends on recognising a colour. */
const RANK_ICON = [Trophy, Medal, Award] as const;
const RANK_TINT = ['text-yellow-300', 'text-slate-200', 'text-orange-300'] as const;

interface ScoreRowProps {
  entry: ScoreEntry;
  rank: number;
  target: number;
  isMe: boolean;
  /** Show the "+N" flash next to whoever just took the round. */
  justWonRound: boolean;
  roundPoints: number;
}

/** One line of the cumulative match scoreboard, with its progress-to-target bar. */
const ScoreRowBase: React.FC<ScoreRowProps> = ({
  entry, rank, target, isMe, justWonRound, roundPoints,
}) => {
  const RankIcon = RANK_ICON[rank - 1] ?? Award;
  const tint = RANK_TINT[rank - 1] ?? 'text-white/45';
  const pct = target > 0 ? Math.min(100, Math.round((entry.score / target) * 100)) : 0;

  return (
    <div
      className={`ui-card px-2 py-1.5 sm:px-2.5 ${
        rank === 1 ? 'ui-card-lead' : isMe ? 'ui-card-self' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-arcade flex w-7 shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-white/70">
          <RankIcon size={12} className={`shrink-0 ${tint}`} aria-hidden="true" />
          {rank}
        </span>

        <PresetAvatar avatarKey={entry.avatar} size={24} className="!border-2 shrink-0" />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-arcade truncate text-[12px] text-white">{entry.name}</span>
            {isMe && <span className="font-rounded shrink-0 text-[9px] font-bold text-sky-300">YOU</span>}
            {entry.isBot && (
              <span className="font-rounded shrink-0 text-[9px] font-bold uppercase text-violet-300">Bot</span>
            )}
            <PlayerIdTag id={entry.playerId} size="text-[9px]" />
          </span>
        </span>

        {/* Cards still in hand — the other half of "why did they score that". */}
        {entry.cardsLeft != null && entry.cardsLeft > 0 && (
          <span
            className="font-rounded shrink-0 text-[9px] font-bold tabular-nums text-white/40"
            title={`${entry.cardsLeft} cards left in hand`}
          >
            {entry.cardsLeft}c
          </span>
        )}
        {justWonRound && (
          <Badge tone="good" className="shrink-0">+{roundPoints}</Badge>
        )}
        <span className="font-arcade shrink-0 text-[13px] tabular-nums text-white">{entry.score}</span>
      </div>

      {/* Progress to the target score. Paired with the number above it, so the
          bar is reinforcement rather than the only way to read the standing. */}
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/45">
        <div
          className="h-full rounded-full bg-gradient-to-r from-lime-400 to-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/** Memoized: a row only re-renders when its own entry or flags change. */
const ScoreRow = React.memo(ScoreRowBase);

export const EndOfRound: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const winnerName = useGameStore((s) => s.winnerName);
  const winnerId = useGameStore((s) => s.winnerId);
  const match = useGameStore((s) => s.match);
  const playerCards = useGameStore((s) => s.playerCards);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const setIsProcessing = useGameStore((s) => s.setIsProcessing);
  const { startGame } = useSocket();
  const exitTable = useExitTable();

  const open = gameStatus === 'ended';

  const matchWon = Boolean(match?.matchWinnerName);
  const roundPoints = match?.lastRound?.pointsAwarded ?? 0;
  const target = match?.targetScore ?? 500;

  // "Did I win?" is a seat comparison, never a name comparison — an opponent
  // sharing my display name must not make my client claim the win.
  const iWonMatch = Boolean(player && match?.matchWinnerUid && match.matchWinnerUid === player.uid);
  const iWonRound = Boolean(player && winnerId && winnerId === player.id);
  const iWon = matchWon ? iWonMatch : iWonRound;
  const championName = (matchWon ? match?.matchWinnerName : winnerName) ?? 'Nobody';

  // Match scoreboard (cumulative points across rounds), highest first. Keyed by
  // seat uid server-side, so it survives reconnects and never merges two players
  // who happen to share a name.
  const scoreboard: ScoreEntry[] = useMemo(() => {
    if (!match) return [];
    return Object.entries(match.scores)
      .map(([uid, entry]) => {
        // Prefer the live seat for the label (it tracks renames); fall back to
        // the banked name for players who have since left the room.
        const p = room?.players.find((pl) => pl.uid === uid);
        const hand = p ? playerCards[p.seatNumber] : undefined;
        return {
          uid,
          name: p?.name ?? entry.name,
          playerId: p?.profileId ?? entry.playerId ?? null,
          score: entry.points,
          avatar: p?.avatar ?? null,
          cardsLeft: hand ? hand.length : null,
          isBot: Boolean(p?.isBot),
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [match, room?.players, playerCards]);

  // The champion's seat, for the hero avatar. Matched by uid at match end and by
  // socket id at round end, mirroring how the store reports each winner.
  const champion = useMemo(() => {
    if (!room) return undefined;
    return matchWon
      ? room.players.find((p) => p.uid === match?.matchWinnerUid)
      : room.players.find((p) => p.id === winnerId);
  }, [room, matchWon, match?.matchWinnerUid, winnerId]);

  if (!open) return null;

  const isHost = player?.isHost ?? false;

  return (
    <Modal
      open={open}
      // Not dismissible: the round is over and the way out is an explicit
      // choice between another round and leaving the table.
      onClose={() => {}}
      closeOnBackdrop={false}
      closeOnEscape={false}
      size="md"
      labelledBy="end-of-round-title"
      zIndex={50}
      underlay={<ConfettiCanvas />}
    >
      {/* Two regions, two orientations. `short:` is the landscape-phone case
          (max-height: 500px), where a stacked hero would leave nothing for the
          standings. */}
      <div className="flex min-h-0 flex-1 flex-col short:flex-row">
        {/* ── Hero: the winner, and nothing that competes with them ───── */}
        <div className="relative shrink-0 overflow-hidden border-b-2 border-white/10 bg-gradient-to-b from-yellow-500/15 to-transparent px-4 py-3 text-center short:w-[13.5rem] short:border-b-0 short:border-r-2 short:px-3 short:py-2.5 short:flex short:flex-col short:justify-center">
          <p className="font-rounded text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-200/70">
            {matchWon ? 'Match Over' : `Round ${match?.round ?? 1} Complete`}
          </p>

          <div className="mt-1.5 flex flex-col items-center gap-1.5">
            <span className="relative ui-reveal">
              <PresetAvatar avatarKey={champion?.avatar} size={54} />
              {/* The crown is the glyph that says "winner" without relying on
                  the gold tint alone. */}
              <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-black/50 bg-gradient-to-b from-yellow-300 to-amber-500">
                <Trophy size={12} className="text-[#1a1033]" aria-hidden="true" />
              </span>
            </span>

            <h2
              id="end-of-round-title"
              className="font-arcade arcade-stroke-uno-sm text-[clamp(1.05rem,0.85rem+1.4vw,1.6rem)] uppercase leading-tight tracking-wide text-yellow-300"
            >
              {iWon ? (matchWon ? 'You win the match!' : 'You won the round!') : championName}
            </h2>
            {!iWon && (
              <p className="font-rounded text-[11px] font-bold text-white/60">
                {matchWon ? 'wins the match' : 'won the round'}
              </p>
            )}
          </div>

          {!matchWon && (
            <p className="font-rounded mt-1.5 text-[10px] font-bold leading-snug text-lime-300">
              +{roundPoints} banked · first to {target} wins
            </p>
          )}
          {matchWon && (
            <p className="font-rounded mt-1.5 text-[10px] font-bold leading-snug text-white/45">
              {match?.round ?? 1} {(match?.round ?? 1) === 1 ? 'round' : 'rounds'} played · target {target}
            </p>
          )}
        </div>

        {/* ── Standings ───────────────────────────────────────────────── */}
        <ModalBody className="ui-body-tight">
          <SectionLabel
            icon={<Trophy size={11} />}
            trailing={
              <span className="font-rounded text-[9px] font-bold uppercase tracking-wide text-white/35">
                to {target}
              </span>
            }
          >
            Standings
          </SectionLabel>

          {scoreboard.map((entry, idx) => (
            <ScoreRow
              key={entry.uid}
              entry={entry}
              rank={idx + 1}
              target={target}
              isMe={entry.uid === player?.uid}
              justWonRound={
                !matchWon && Boolean(match?.lastRound?.winnerUid) &&
                match?.lastRound?.winnerUid === entry.uid
              }
              roundPoints={roundPoints}
            />
          ))}
        </ModalBody>
      </div>

      <ModalFooter>
        <Button
          tone="danger"
          size="sm"
          onClick={exitTable}
          icon={<DoorOpen size={13} />}
        >
          Exit
        </Button>

        {isHost ? (
          <Button
            tone="primary"
            size="sm"
            disabled={isProcessing}
            onClick={() => {
              setIsProcessing(true);
              startGame();
            }}
            icon={<RefreshCw size={13} />}
            className="ml-auto"
          >
            {matchWon ? 'New Match' : 'Next Round'}
          </Button>
        ) : (
          <span
            className="font-rounded ml-auto inline-flex items-center gap-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-yellow-200/80"
            role="status"
          >
            <Hourglass size={12} className="shrink-0 animate-pulse" aria-hidden="true" />
            {matchWon ? 'Waiting for a new match…' : 'Waiting for the next round…'}
          </span>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default EndOfRound;
