'use client';

import React from 'react';
import { useGameStore } from '../../store/useGameStore';
import { ErrorBoundary } from '../providers/ErrorBoundary';
import { GameActionPrompts } from './GameActionPrompts';
import { GameView } from './GameView';
import { LobbyView } from './LobbyView';

/**
 * Centred HUD column under the header. It swaps between the pre-game lobby
 * controls and the in-round status banner, and always renders the contextual
 * action prompts underneath.
 *
 * The wrapper is `pointer-events-none` so the empty space either side of the
 * column doesn't block dragging the 3D table; the inner column opts back in.
 */
export const GameHUD: React.FC = () => {
  const gameStatus = useGameStore((s) => s.gameStatus);

  // `sm:top-14` fires on a landscape phone, since it is wide (~844px) despite
  // being only ~390px tall. `short:top-12` sits just below the header — whose
  // chips also shrink to 36px there — rather than overlapping it.
  return (
    <div className="absolute top-10 sm:top-14 short:top-12 left-0 right-0 flex flex-col items-center z-20 pointer-events-none px-3 text-center">
      <div className="pointer-events-auto">
        {/* Display state alert banners */}
        <div className="flex flex-col items-center gap-1.5 short:gap-1">
          <ErrorBoundary section="Table HUD">
            {gameStatus === 'lobby' ? <LobbyView /> : <GameView />}
            <GameActionPrompts />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export default GameHUD;
