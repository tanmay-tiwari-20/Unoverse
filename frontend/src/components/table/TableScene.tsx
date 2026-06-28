'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useGameStore } from '../../store/useGameStore';

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
  const { room, player, currentPlayerId, isProcessing, isSpectator } = useGameStore();

  const isMyTurn = currentPlayerId === player?.id && room?.status === 'playing' && !isProcessing;

  // Calculate local player index for POV camera positioning
  const playersList = room?.players || [];
  const numPlayers = Math.max(playersList.length, 2);
  const localIndex = room ? playersList.findIndex(p => p.id === player?.id) : -1;
  const safeLocalIndex = localIndex >= 0 ? localIndex : 0;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* ================================================================= */}
      {/* PURE WEBGL 3D ENVIRONMENT — No HTML overlays                      */}
      {/* ================================================================= */}
      <RoomEnvironment numPlayers={numPlayers} localIndex={safeLocalIndex}>
        <WebGLSeats />
        <WebGLCards />
        <CardFlightAnimations />
        <ActionEffects3D />
      </RoomEnvironment>

      {/* HUD LAYER */}
      <PlayerHandHUD />

    </div>
  );
};

export default TableScene;
