'use client';

import React, { useMemo, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { PhysicalCard } from '../cards/PhysicalCard';
import { CinematicSharedTopCard } from './CinematicSharedTopCard';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

/**
 * Large invisible click target covering the whole draw pile. The visible deck is
 * a stack of very thin cards, so at oblique camera angles the clickable top face
 * is a sliver that's hard to hit. This proxy box gives a generous, angle-robust
 * hit area: a wide footprint plus enough height to be caught from the side. It
 * stays invisible but raycastable, and shows a hover ring + pointer cursor.
 */
const DrawPileHitbox: React.FC<{ stackHeight: number; onDraw: () => void }> = ({ stackHeight, onDraw }) => {
  const [hovered, setHovered] = useState(false);

  // Footprint a bit larger than the card; height spans the stack plus headroom
  // so a ray grazing from the side still intersects it.
  const boxH = Math.max(0.14, stackHeight + 0.12);

  return (
    <group>
      <mesh
        position={[0, boxH / 2 - 0.01, 0]}
        onClick={(e) => { e.stopPropagation(); onDraw(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[0.2, boxH, 0.26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Hover affordance: a soft glowing ring around the pile base */}
      {hovered && (
        <mesh position={[0, stackHeight + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.085, 0.11, 40]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

export const WebGLCards: React.FC = () => {
  const { room, player, currentPlayerId, playerCards, discardPile, drawPileCount, gameStatus, isProcessing, wildColor, drawnCardId } = useGameStore();
  const { playCard, drawCard } = useSocket();

  const isMyTurn = currentPlayerId === player?.id && (gameStatus === 'playing' || gameStatus === 'awaiting_color_selection') && !isProcessing;
  // Once a playable card has been drawn, a second draw is not allowed — the player
  // must play that card or pass — so the draw pile is no longer interactive.
  const canDraw = isMyTurn && !drawnCardId;

  // Must render cards when playing OR waiting for color selection OR game ended
  if (!room || !['playing', 'awaiting_color_selection', 'ended'].includes(gameStatus)) return null;

  const playersList = room.players || [];
  const numPlayers = Math.max(playersList.length, 2);
  const localPlayerIndex = playersList.findIndex(p => p.id === player?.id);
  const safeLocalIndex = localPlayerIndex >= 0 ? localPlayerIndex : 0;

  return (
    <group>
      {/* 1. DISCARD PILE (RIGHT SIDE) */}
      <group position={[0.3, 0.896, 0]}>
        {discardPile.slice(-10).map((card, sliceIdx, arr) => {
          // sliceIdx is 0 to 3. idx should be the actual index for pseudo-randomness
          const actualIdx = discardPile.length - arr.length + sliceIdx;
          const isTop = sliceIdx === arr.length - 1;
          const randAngle = (Math.sin(actualIdx * 12.9898) * 43758.5453) % 1;
          const randRot = (Math.cos(actualIdx * 78.233) * 43758.5453) % 1;
          
          const xOffset = (randAngle - 0.5) * 0.08;
          const zOffset = (randRot - 0.5) * 0.08;
          const yRot = (randRot - 0.5) * 0.3;

          // Top wild / +4 card adopts the chosen color once selected.
          const displayColor =
            isTop && card.color === 'wild' && wildColor ? wildColor : card.color;

          return (
            <PhysicalCard
              key={card.id}
              color={displayColor}
              value={card.value}
              isFaceUp={true}
              position={[xOffset, actualIdx * 0.002, zOffset]}
              rotation={[0, yRot, 0]}
              animateSpawn={isTop ? 'drop' : 'none'}
            />
          );
        })}

        {/* Standing top card display — part of the pile */}
        <CinematicSharedTopCard />
      </group>

      {/* 2. DRAW PILE (LEFT SIDE) */}
      <group position={[-0.3, 0.896, 0]}>
        {Array.from({ length: Math.max(1, Math.min(15, drawPileCount)) }).map((_, idx) => {
          const randAngle = (Math.sin(idx * 12.9898) * 43758.5453) % 1;
          const randRot = (Math.cos(idx * 78.233) * 43758.5453) % 1;

          const xOffset = (randAngle - 0.5) * 0.04;
          const zOffset = (randRot - 0.5) * 0.04;

          return (
            <PhysicalCard
              key={`draw-${idx}`}
              color="wild"
              value="wild"
              isFaceUp={false}
              position={[xOffset, idx * 0.002, zOffset]}
              rotation={[0, 0, 0]}
            />
          );
        })}

        {/* Whole-pile click proxy — a large invisible volume covering the deck so
            it can be picked from any camera angle (the thin top card alone is a
            tiny target at grazing angles). Raycastable despite being invisible. */}
        {canDraw && (
          <DrawPileHitbox stackHeight={Math.min(15, Math.max(1, drawPileCount)) * 0.002} onDraw={() => drawCard()} />
        )}

        {/* Draw Pile Count Badge */}
        {drawPileCount > 0 && (
          <Html position={[0, 0.15, 0]} center zIndexRange={[100, 0]}>
            <div className="bg-black/80 backdrop-blur-md px-[10px] py-[6px] h-[24px] flex items-center justify-center rounded-full text-white font-bold text-[12px] border border-white/20 shadow-lg select-none whitespace-nowrap">
              {drawPileCount} CARDS
            </div>
          </Html>
        )}
      </group>

      {/* 3. OPPONENT HANDS */}
      {playersList.map((occupant, pIdx) => {
        const isLocal = occupant.id === player?.id;
        if (isLocal) return null; // Local player hand is pure HTML HUD now

        const relativeIndex = (pIdx - safeLocalIndex + numPlayers) % numPlayers;
        const baseAngle = (Math.PI * 2 / numPlayers) * relativeIndex;
        
        const hand = playerCards[occupant.seatNumber] || [];
        const cardCount = hand.length;
        if (cardCount === 0) return null;

        const rX = 1.15;
        const rZ = 0.75;
        const groupPosition: [number, number, number] = [
          Math.sin(baseAngle) * rX,
          1.1,
          Math.cos(baseAngle) * rZ
        ];

        return (
          <group key={`player-${occupant.id}`} position={groupPosition}>
            {/* Card Count Badge above opponent hand */}
            {/* position is lowered to prevent overlapping the hanging lamp shade at y=1.5 */}
            <Html position={[0, 0.15, 0]} center zIndexRange={[100, 0]}>
              <div className="flex flex-col items-center gap-1 select-none pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-[10px] py-[6px] h-[24px] flex items-center justify-center rounded-full text-white font-bold text-[14px] border border-white/10 whitespace-nowrap">
                  {occupant.name}
                </div>
                <div className="bg-red-500 text-white font-black text-[12px] px-[10px] py-[6px] h-[24px] flex items-center justify-center rounded-full shadow-lg whitespace-nowrap">
                  {cardCount} CARDS
                </div>
              </div>
            </Html>

            {/* Hand Fan */}
            {hand.map((card, cIdx) => {
              const spreadAngle = 0.10; // Increased spread angle for 25% wider fan
              const totalSpread = (cardCount - 1) * spreadAngle;
              const startAngle = -totalSpread / 2;
              const cardAngle = startAngle + (cIdx * spreadAngle);
              
              // Local rotation within the group
              const rotation: [number, number, number] = [
                0.8,
                baseAngle + Math.PI,
                cardAngle * -1 // Tilt the cards slightly in a fan
              ];
              
              const position: [number, number, number] = [
                Math.sin(cardAngle) * 0.3,
                Math.cos(cardAngle) * 0.3 - 0.3, // Arc height
                -cIdx * 0.005 // Prevent Z-fighting
              ];

              return (
                <PhysicalCard
                  key={card.id}
                  color={card.color}
                  value={card.value}
                  isFaceUp={false}
                  position={position}
                  rotation={rotation}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
};

export default WebGLCards;
