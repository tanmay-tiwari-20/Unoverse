'use client';

import React, { useRef } from 'react';
import { Award, Hourglass, Medal, PartyPopper, RefreshCw, Trophy } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useExitTable } from '../../hooks/useExitTable';
import { ConfettiCanvas } from './ConfettiCanvas';

interface ScoreEntry {
  nameKey: string;
  name: string;
  id: string;
  score: number;
}

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
const ScoreRow: React.FC<ScoreRowProps> = ({ entry, rank, target, isMe, justWonRound, roundPoints }) => {
  const isLeader = rank === 1;
  const RankIcon = rank === 1 ? Trophy : rank === 2 ? Medal : Award;
  const rankIconColor = rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-slate-300' : 'text-orange-400';
  const pct = Math.min(100, Math.round((entry.score / target) * 100));

  return (
    <div
      className={`px-3 py-1.5 rounded-xl border-2 ${
        isLeader
          ? 'bg-amber-400/20 border-yellow-300/60 text-yellow-100'
          : isMe
            ? 'bg-blue-500/20 border-blue-400/50 text-blue-100'
            : 'bg-white/5 border-white/15 text-white/80'
      }`}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-[11px] font-rounded font-bold">
          <span className="inline-flex items-center gap-1">
            <RankIcon size={14} className={rankIconColor} /> #{rank}
          </span>
          <span className="font-arcade truncate max-w-[90px]">{entry.name}</span>
          {justWonRound && (
            <span className="text-[9px] font-rounded font-bold text-lime-300 uppercase">+{roundPoints}</span>
          )}
        </div>
        <span className="text-[12px] font-arcade text-white tabular-nums">{entry.score}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-lime-400 to-green-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/**
 * End-of-round / end-of-match summary: who won, the running match scoreboard,
 * and the loop back into another round.
 *
 * Only the host can advance — everyone else waits — because starting a round is
 * a server-side decision; this dialog just surfaces the affordance to the one
 * client allowed to ask for it.
 */
export const EndOfRound: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const winnerName = useGameStore((s) => s.winnerName);
  const match = useGameStore((s) => s.match);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const setIsProcessing = useGameStore((s) => s.setIsProcessing);
  const { startGame } = useSocket();
  const exitTable = useExitTable();

  // End-of-round summary is a modal dialog (not dismissible — the host advances).
  const endDialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(endDialogRef, gameStatus === 'ended', undefined, { closeOnEscape: false });

  if (gameStatus !== 'ended') return null;

  const isHost = player?.isHost || false;
  const matchWon = !!match?.matchWinnerName;
  const roundPoints = match?.lastRound?.pointsAwarded ?? 0;
  const target = match?.targetScore ?? 500;
  const headerText = matchWon
    ? (player && match?.matchWinnerName === player.name ? 'YOU WIN THE MATCH!' : `${match?.matchWinnerName} wins the match!`)
    : (player && winnerName === player.name ? 'You won the round!' : `${winnerName} won the round!`);

  // Match scoreboard (cumulative points across rounds), highest first. Scores are
  // keyed by lowercased name on the server so they survive reconnects.
  const scoreboard: ScoreEntry[] = match
    ? Object.entries(match.scores)
        .map(([nameKey, score]) => {
          const p = room?.players.find((pl) => pl.name.toLowerCase() === nameKey);
          return { nameKey, name: p?.name ?? nameKey, id: p?.id ?? nameKey, score };
        })
        .sort((a, b) => b.score - a.score)
    : [];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 pointer-events-auto overflow-hidden p-4">
      {/* Confetti canvas animation */}
      <ConfettiCanvas />

      <div
        ref={endDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
        className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-5 sm:p-7 flex flex-col items-center gap-4 sm:gap-5 max-w-sm w-full text-center z-20 relative max-h-[90dvh] overflow-y-auto short:p-4 short:gap-2 short:max-w-md short:max-h-[94dvh]"
      >
        {/* Trophy badge is pure decoration — the first thing to go when a
            landscape phone leaves no room for the scoreboard below it. */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] animate-bounce short:hidden">
          <Trophy size={30} className="fill-white/30" />
        </div>
        <div>
          <h2 id="game-over-title" className="font-arcade text-3xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm animate-pulse short:text-xl">
            {matchWon ? 'Match Over!' : `Round ${match?.round ?? 1}`}
          </h2>
          <p className="font-rounded font-bold text-white text-md mt-1 inline-flex items-center gap-1.5">
            <PartyPopper size={16} className="text-yellow-300" />
            {headerText}
          </p>
          {!matchWon && (
            <p className="font-rounded font-semibold text-lime-300 text-xs mt-1">
              +{roundPoints} points banked · first to {target} wins
            </p>
          )}
        </div>

        {/* Running Match Scoreboard */}
        <div className="w-full border-t-2 border-b-2 border-white/20 py-3 my-0.5 space-y-2 max-h-52 overflow-y-auto short:py-2 short:space-y-1 short:max-h-28">
          <span className="font-arcade text-[10px] uppercase tracking-widest text-yellow-200 block text-left mb-1">
            Match Scoreboard · to {target}
          </span>
          {scoreboard.map((entry, idx) => (
            <ScoreRow
              key={entry.id}
              entry={entry}
              rank={idx + 1}
              target={target}
              isMe={entry.name.toLowerCase() === player?.name.toLowerCase()}
              justWonRound={
                !matchWon && match?.lastRound?.winnerName?.toLowerCase() === entry.name.toLowerCase()
              }
              roundPoints={roundPoints}
            />
          ))}
        </div>

        {/* Round / Match Loop Buttons */}
        <div className="w-full space-y-2">
          {isHost ? (
            <button
              disabled={isProcessing}
              onClick={() => {
                setIsProcessing(true);
                startGame();
              }}
              className="btn-arcade w-full bg-gradient-to-b from-lime-400 to-green-600 text-white py-3 px-6 text-sm uppercase disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 short:py-2 short:text-xs"
            >
              <RefreshCw size={16} /> {matchWon ? 'New Match' : 'Next Round'}
            </button>
          ) : (
            <div className="w-full py-2.5 px-4 rounded-full bg-white/5 border-2 border-white/15 text-center animate-pulse font-rounded font-bold text-[10px] uppercase tracking-widest text-yellow-200 inline-flex items-center justify-center gap-1.5">
              <Hourglass size={12} /> {matchWon ? 'Waiting for host to start a new match...' : 'Waiting for host to start next round...'}
            </div>
          )}

          <button
            onClick={exitTable}
            className="btn-arcade w-full bg-gradient-to-b from-rose-500 to-red-700 text-white py-3 px-4 text-xs uppercase short:py-2 short:text-[11px]"
          >
            Exit to Menu
          </button>
        </div>
      </div>
    </div>
  );
};

export default EndOfRound;
