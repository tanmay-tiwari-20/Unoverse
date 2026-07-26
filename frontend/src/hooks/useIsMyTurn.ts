'use client';

import { useGameStore } from '../store/useGameStore';

/**
 * True only while the server says it is this client's turn AND the round is in
 * its normal play phase — the forced-choice phases (`awaiting_color_selection`,
 * `awaiting_swap_target`) have their own dialogs and must not light up the
 * regular turn affordances.
 *
 * Derived in one place because several HUD surfaces gate on it.
 */
export const useIsMyTurn = (): boolean =>
  useGameStore(
    (s) => s.gameStatus === 'playing' && !!s.player && s.currentPlayerId === s.player.id
  );

export default useIsMyTurn;
