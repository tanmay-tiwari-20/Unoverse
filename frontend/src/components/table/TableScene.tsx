'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useGameStore } from '../../store/useGameStore';
import { getLayoutSeatCount } from '../../utils/capacity';
import { ErrorBoundary } from '../providers/ErrorBoundary';
import { SceneCrashFallback } from './SceneCrashFallback';
import { WebGLRecoveryOverlay } from './WebGLRecoveryOverlay';

import { PlayerHandHUD } from './PlayerHandHUD';

// Dynamic imports of the Three.js components — SSR disabled for WebGL
const RoomEnvironment = dynamic(
  () => import('./RoomEnvironment').then(mod => ({ default: mod.RoomEnvironment })),
  { ssr: false }
);
const WebGLSeats = dynamic(
  () => import('./WebGLSeats').then(mod => ({ default: mod.WebGLSeats })),
  { ssr: false }
);
const WebGLCards = dynamic(
  () => import('./WebGLCards').then(mod => ({ default: mod.WebGLCards })),
  { ssr: false }
);
const CardFlightAnimations = dynamic(
  () => import('./CardFlightAnimations').then(mod => ({ default: mod.CardFlightAnimations })),
  { ssr: false }
);
const ActionEffects3D = dynamic(
  () => import('./ActionEffects3D').then(mod => ({ default: mod.ActionEffects3D })),
  { ssr: false }
);

export const TableScene: React.FC = () => {
  const room = useGameStore((state) => state.room);
  const player = useGameStore((state) => state.player);
  const currentPlayerId = useGameStore((state) => state.currentPlayerId);
  const isProcessing = useGameStore((state) => state.isProcessing);
  const isSpectator = useGameStore((state) => state.isSpectator);

  const isMyTurn = currentPlayerId === player?.id && room?.status === 'playing' && !isProcessing;

  // Calculate local player index for POV camera positioning. Seat count comes
  // from the shared helper so every layer (table, seats, cards, overlays) agrees.
  const playersList = room?.players || [];
  const numPlayers = getLayoutSeatCount(room);
  const localIndex = room ? playersList.findIndex(p => p.id === player?.id) : -1;
  const safeLocalIndex = localIndex >= 0 ? localIndex : 0;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* ================================================================= */}
      {/* PURE WEBGL 3D ENVIRONMENT — No HTML overlays                      */}
      {/* ================================================================= */}
      {/* The whole 3D layer is isolated. A Three.js/WebGL failure — a shader
          that won't compile on an old driver, a context that can't be created —
          is by far the most likely crash on low-end hardware, and it must not
          take the HUD, the chat or the socket connection with it. The fallback
          keeps the room fully playable via the 2D hand HUD.
          `resetKeys` on the room code means entering a different room retries
          the scene rather than inheriting the previous room's crash. */}
      <ErrorBoundary
        section="3D Table"
        resetKeys={[room?.code]}
        fallback={(_error, retry) => <SceneCrashFallback onRetry={retry} />}
      >
        <RoomEnvironment numPlayers={numPlayers} localIndex={safeLocalIndex}>
          <WebGLSeats />
          <WebGLCards />
          {/* Card flights and action effects are decorative. If either throws,
              drop it silently rather than degrading the table around it — the
              game reads identically without them. */}
          <ErrorBoundary section="Card Animations" fallback={null}>
            <CardFlightAnimations />
          </ErrorBoundary>
          <ErrorBoundary section="Action Effects" fallback={null}>
            <ActionEffects3D />
          </ErrorBoundary>
        </RoomEnvironment>
      </ErrorBoundary>

      {/* Shown only while the GPU context is lost; covers the canvas, not the HUD. */}
      <WebGLRecoveryOverlay />

      {/* HUD LAYER — the hand is how the game is actually played, so it gets its
          own boundary and is never brought down by the scene behind it. */}
      <ErrorBoundary section="Your Hand">
        <PlayerHandHUD />
      </ErrorBoundary>

    </div>
  );
};

export default TableScene;
