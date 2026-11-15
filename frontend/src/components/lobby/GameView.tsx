'use client';

import React from 'react';
import { ArrowLeftRight, Layers, Star } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useIsMyTurn } from '../../hooks/useIsMyTurn';
import { TurnTimer } from '../table/TurnTimer';
import { useSocket } from '../../hooks/useSocket';
import { COLOR_IDENTITIES, describeCard } from '../../lib/cards/colorIdentity';
import { canPlayCard } from '../../lib/cards/cardEngine';

/**
 * In-round status pill: whose turn it is, or which forced choice the table is
 * waiting on. Purely a mirror of the authoritative `gameStatus` — it never
 * decides anything, it only reports what the server already said.
 */
const TurnStatus: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const currentPlayerSeat = useGameStore((s) => s.currentPlayerSeat);
  const swapChooserId = useGameStore((s) => s.swapChooserId);
  const isMyTurn = useIsMyTurn();

  // Shared shell, and the same glass the header clusters and lobby strip use —
  // so the in-round banner reads as part of one HUD rather than a fourth kind
  // of floating pill. The accent (border tint + text tint + dot/icon) is the
  // only thing that changes between states, keeping the hierarchy quiet until
  // it is your turn.
  //
  // `ring-*` is deliberately not used for the emphasis: Tailwind implements it
  // as a box-shadow, and `.ui-hud-glass` sets box-shadow itself — in this
  // unlayered stylesheet the class would win and the ring would silently do
  // nothing. The brighter border does the same job with no such trap.
  const shell =
    'ui-hud-glass ui-hud-pill font-rounded font-bold text-[11px] sm:text-[10px] inline-flex ' +
    'items-center gap-1.5 px-3 py-1.5 select-none whitespace-nowrap';

  if (gameStatus === 'playing') {
    return isMyTurn ? (
      // Your turn: the one moment worth emphasising — brighter border, emerald
      // accent and a single pop-in. Still glass, not a loud solid gradient.
      <span className={`${shell} border-emerald-300/60 text-emerald-50 hud-pop-in`}>
        <Star size={13} className="fill-emerald-300 text-emerald-300" />
        <span className="font-arcade uppercase tracking-wide text-emerald-50">Your Turn</span>
        <TurnTimer className="ml-0.5 text-[10px]" />
      </span>
    ) : (
      <span className={`${shell} border-white/12 text-slate-200`}>
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400/80 shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[42vw]">
          {room?.players.find((p) => p.id === currentPlayerId)?.name || `Seat ${currentPlayerSeat}`}&rsquo;s turn
        </span>
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  if (gameStatus === 'awaiting_color_selection') {
    return (
      <span className={`${shell} border-amber-300/35 text-amber-100`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-300/90 shrink-0" aria-hidden="true" />
        Choosing a color&hellip;
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  if (gameStatus === 'awaiting_swap_target') {
    return (
      <span className={`${shell} border-fuchsia-300/35 text-fuchsia-100`}>
        <ArrowLeftRight size={12} className="text-fuchsia-200" />
        {swapChooserId === player?.id ? 'Pick a player to swap hands' : 'Waiting for Seven-Swap…'}
        <TurnTimer className="text-[10px]" />
      </span>
    );
  }

  return null;
};

/** The round stays playable while WebGL loads, fails, or loses its context. */
export const GameView: React.FC = () => {
  const gameStatus = useGameStore((s) => s.gameStatus);
  const topCard = useGameStore((s) => s.discardPile.at(-1));
  const wildColor = useGameStore((s) => s.wildColor);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const drawnCardId = useGameStore((s) => s.drawnCardId);
  const drawStack = useGameStore((s) => s.drawStack);
  const pendingDrawType = useGameStore((s) => s.pendingDrawType);
  const houseRules = useGameStore((s) => s.houseRules);
  const hand = useGameStore((s) => s.player ? s.playerCards[s.player.seatNumber] : undefined);
  const connectionStatus = useGameStore((s) => s.connectionStatus);
  const isMyTurn = useIsMyTurn();
  const { drawCard } = useSocket();

  const active = ['playing', 'awaiting_color_selection', 'awaiting_swap_target'].includes(gameStatus);
  const hasPendingDraw = !!pendingDrawType && drawStack > 0;
  const mustPlay = !hasPendingDraw && houseRules.mustPlayIfPlayable &&
    (hand ?? []).some((card) => canPlayCard(card, topCard ?? null, wildColor, null, houseRules, hand?.length ?? 0));
  const canDraw = isMyTurn && !isSpectator && !isProcessing && !drawnCardId &&
    !mustPlay && connectionStatus === 'connected';
  const drawPenalty = houseRules.stackToEat ? drawStack : pendingDrawType === 'wild_draw_four' ? 4 : 2;
  const activeColor = topCard?.color === 'wild' ? wildColor : topCard?.color;
  const identity = activeColor ? COLOR_IDENTITIES[activeColor] : null;

  return (
    <>
      <TurnStatus />
      {active && (
        <div className="ui-hud-glass rounded-xl flex flex-wrap items-center justify-center gap-2 px-2.5 py-1.5 font-rounded text-[11px] font-bold max-w-[90vw]">
          {topCard && (
            <span className="text-slate-100">
              Top: {describeCard(topCard)}
              {identity && (
                <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 whitespace-nowrap">
                  Color: <span aria-hidden="true">{identity.symbol} </span>{identity.name}
                </span>
              )}
            </span>
          )}
          {!isSpectator && (
            <button
              type="button"
              disabled={!canDraw}
              title={mustPlay ? 'You must play a legal card from your hand' : undefined}
              onClick={() => {
                const state = useGameStore.getState();
                if (state.gameStatus !== 'playing' || !state.player || state.currentPlayerId !== state.player.id ||
                    state.isProcessing || state.isSpectator || state.drawnCardId || state.connectionStatus !== 'connected') return;
                const liveHand = state.playerCards[state.player.seatNumber] ?? [];
                const livePendingDraw = !!state.pendingDrawType && state.drawStack > 0;
                if (!livePendingDraw && state.houseRules.mustPlayIfPlayable && liveHand.some((card) =>
                  canPlayCard(card, state.discardPile.at(-1) ?? null, state.wildColor, null, state.houseRules, liveHand.length))) return;
                drawCard();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-300 px-3 py-2 text-slate-950 transition hover:bg-amber-200 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Layers size={13} aria-hidden="true" />
              {hasPendingDraw ? `Draw ${drawPenalty}` : 'Draw Card'}
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default GameView;
