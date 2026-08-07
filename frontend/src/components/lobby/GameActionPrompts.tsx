'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Gavel, Siren, Star } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useIsMyTurn } from '../../hooks/useIsMyTurn';

/**
 * The optional/limited-time actions that appear under the turn banner: draw
 * stacking, challenging a Wild Draw Four, declaring UNO, and the keep-or-play
 * decision after drawing.
 *
 * Each prompt is only an affordance — the server re-validates every one of
 * these actions, so a prompt appearing at the wrong moment can never turn into
 * an illegal move.
 */
export const GameActionPrompts: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const isSpectator = useGameStore((s) => s.isSpectator);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const setIsProcessing = useGameStore((s) => s.setIsProcessing);
  const drawStack = useGameStore((s) => s.drawStack);
  const pendingDrawType = useGameStore((s) => s.pendingDrawType);
  const challengeableById = useGameStore((s) => s.challengeableById);
  const drawnCardId = useGameStore((s) => s.drawnCardId);
  const houseRules = useGameStore((s) => s.houseRules);
  const unoCalled = useGameStore((s) => s.unoCalled);
  const myHandCount = useGameStore((s) => (s.playerCards[s.player?.seatNumber || 1] || []).length);
  const isMyTurn = useIsMyTurn();

  const { callUno, passTurn, challengeWildFour } = useSocket();

  return (
    <>
      {/* Pending Draw Stack banner — shown while a +2/+4 chain is live. The
          active player must stack a matching draw card or draw the total. */}
      {gameStatus === 'playing' && (drawStack ?? 0) > 0 && pendingDrawType && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mt-1.5 font-arcade text-xs bg-gradient-to-b from-orange-500 to-red-700 border-[3px] border-white text-white px-4 py-1.5 rounded-full shadow-[0_4px_0_0_rgba(0,0,0,0.3)] uppercase tracking-wide inline-flex items-center gap-1.5"
        >
          <Siren size={14} className="fill-white" />
          {isMyTurn
            ? `Stack a ${pendingDrawType === 'wild_draw_four' ? '+4' : '+2 / +4'} or draw ${drawStack}!`
            : `Draw stack building: +${drawStack}`}
        </motion.div>
      )}

      {/* Challenge Wild Draw Four — shown to the targeted player when the
          challenge house rule is on and a +4 is pending against them. */}
      {isMyTurn && !isSpectator && pendingDrawType === 'wild_draw_four' &&
        challengeableById === player?.id && houseRules?.challengeWildDrawFour && (
        <motion.button
          disabled={isProcessing}
          initial={{ opacity: 0, y: -6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileTap={{ scale: 0.94, y: 3 }}
          onClick={() => challengeWildFour()}
          className="btn-arcade mt-1.5 text-white uppercase inline-flex items-center gap-1.5 px-6 py-2 text-sm bg-gradient-to-b from-violet-500 to-purple-700 disabled:cursor-not-allowed"
        >
          <Gavel size={16} /> Challenge +4
        </motion.button>
      )}

      {/* Declare UNO Button — shown while holding exactly 2 cards. Declaring
          now exempts you from the automatic +4 penalty that hits when a
          play would otherwise drop you to a single undeclared card. */}
      {myHandCount === 2 && gameStatus === 'playing' && !isSpectator && !(player && unoCalled[player.id]) && (
        <motion.button
          disabled={isProcessing}
          whileTap={{ scale: 0.92, y: 4 }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }}
          onClick={() => {
            setIsProcessing(true);
            callUno();
          }}
          className="btn-arcade mt-2 text-white uppercase inline-flex items-center gap-1.5 px-7 py-3 text-lg bg-gradient-to-b from-red-500 to-orange-600 short:mt-1 short:px-5 short:py-2 short:text-sm"
        >
          <Siren size={18} /> CALL UNO!
        </motion.button>
      )}

      {/* Draw-then-play decision — the player drew and now has a playable
          card. They may play any valid card (the drawn one is highlighted)
          or keep it and pass. */}
      {isMyTurn && drawnCardId && !isSpectator && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mt-1.5 flex flex-col items-center gap-1.5"
        >
          <span className="font-arcade text-xs bg-gradient-to-b from-amber-400 to-orange-600 border-[3px] border-white text-white px-4 py-1.5 rounded-full shadow-[0_4px_0_0_rgba(0,0,0,0.3)] uppercase tracking-wide inline-flex items-center gap-1.5">
            <Star size={14} className="fill-white" /> Play a card or keep it!
          </span>
          <motion.button
            disabled={isProcessing}
            whileTap={{ scale: 0.92, y: 4 }}
            onClick={() => {
              passTurn();
            }}
            className="btn-arcade text-white uppercase inline-flex items-center gap-1.5 px-6 py-2 text-sm bg-gradient-to-b from-slate-500 to-slate-700 disabled:cursor-not-allowed"
          >
            Keep & Pass
          </motion.button>
        </motion.div>
      )}
    </>
  );
};

export default GameActionPrompts;
