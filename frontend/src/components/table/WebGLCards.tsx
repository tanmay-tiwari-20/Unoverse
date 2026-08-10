'use client';

import React, { useState } from 'react';
import { useGameStore, DISCARD_VISIBLE_COUNT } from '../../store/useGameStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSocket } from '../../hooks/useSocket';
import { PhysicalCard } from '../cards/PhysicalCard';
import { CinematicSharedTopCard } from './CinematicSharedTopCard';
import { getHandRingRadii } from '../../utils/tableLayout';
import { getLayoutSeatCount } from '../../utils/capacity';
import { useViewport } from '../../hooks/useViewport';
import { SeatBadge } from './SeatBadge';
import { DeckTapIndicator } from './DeckTapIndicator';
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

// Verb shown in the "last played by" indicator, matched to the authoritative
// lastAction.type so special actions (jump-in, swap, rotate, challenge, draw,
// pass) each read correctly rather than everything saying "Played by".
const LAST_ACTION_VERB: Record<string, string> = {
  play: 'Played by',
  jump_in: 'Jumped in by',
  swap: 'Swapped by',
  rotate: 'Rotated by',
  challenge: 'Challenged by',
  draw: 'Drawn by',
  pass: 'Passed by',
};

export const WebGLCards: React.FC = () => {
  const room = useGameStore((state) => state.room);
  const player = useGameStore((state) => state.player);
  const currentPlayerId = useGameStore((state) => state.currentPlayerId);
  const playerCards = useGameStore((state) => state.playerCards);
  const discardPile = useGameStore((state) => state.discardPile);
  const discardCount = useGameStore((state) => state.discardCount);
  const drawPileCount = useGameStore((state) => state.drawPileCount);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const isProcessing = useGameStore((state) => state.isProcessing);
  const wildColor = useGameStore((state) => state.wildColor);
  const drawnCardId = useGameStore((state) => state.drawnCardId);
  const lastAction = useGameStore((state) => state.lastAction);
  const unoCalled = useGameStore((state) => state.unoCalled);
  const showLastPlayedBy = useSettingsStore((s) => s.showLastPlayedBy);
  const { drawCard } = useSocket();

  // Coarse device bucket drives the touch-only deck affordance and compact badge
  // sizing. Read once here so no child inside the R3F frame loop subscribes.
  const { isTouch, isMobile } = useViewport();

  const isMyTurn = currentPlayerId === player?.id && (gameStatus === 'playing' || gameStatus === 'awaiting_color_selection') && !isProcessing;
  // Once a playable card has been drawn, a second draw is not allowed — the player
  // must play that card or pass — so the draw pile is no longer interactive.
  const canDraw = isMyTurn && !drawnCardId;

  // Must render cards when playing OR waiting for color selection OR game ended
  if (!room || !['playing', 'awaiting_color_selection', 'ended'].includes(gameStatus)) return null;

  const playersList = room.players || [];
  const numPlayers = getLayoutSeatCount(room);
  const localPlayerIndex = playersList.findIndex(p => p.id === player?.id);
  const safeLocalIndex = localPlayerIndex >= 0 ? localPlayerIndex : 0;

  // Opponent hand groups sit at the (count-scaled) table edge, matching the seat
  // ring so cards and silhouettes stay aligned as the table grows/shrinks.
  const { rX: handRX, rZ: handRZ } = getHandRingRadii(numPlayers);

  // "Last played by" — derived purely from the authoritative lastAction. The
  // actor is resolved by id against the current room roster (the server remaps
  // lastAction.playerId across reconnects), so it never goes stale or wrong. It
  // is hidden with no action yet, once the round has ended, or if the actor is
  // no longer in the room.
  const lastActor = lastAction ? playersList.find(p => p.id === lastAction.playerId) : null;
  const lastPlayedByLabel =
    showLastPlayedBy && lastAction && lastActor && gameStatus !== 'ended'
      ? `${LAST_ACTION_VERB[lastAction.type] ?? 'Played by'} ${lastActor.name}`
      : null;

  return (
    <group>
      {/* 1. DISCARD PILE (RIGHT SIDE) */}
      <group position={[0.3, 0.896, 0]}>
        {discardPile.slice(-DISCARD_VISIBLE_COUNT).map((card, sliceIdx, arr) => {
          // `discardPile` is only the visible window of the pile, so the card's
          // real depth (which drives both its stacked height and its stable
          // pseudo-random jitter) comes from the authoritative total.
          const actualIdx = discardCount - arr.length + sliceIdx;
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

        {/* Subtle "last played by" indicator, anchored to the front edge of the
            discard pile so it gives context without covering the top card. */}
        {lastPlayedByLabel && (
          <Html position={[0, 0.02, 0.22]} center zIndexRange={[90, 0]}>
            <div className="pointer-events-none select-none whitespace-nowrap flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm border border-white/10 text-white/75 text-[10px] sm:text-[9px] font-rounded font-bold shadow-md max-w-[42vw]">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/80 shrink-0" aria-hidden="true" />
              <span className="truncate">{lastPlayedByLabel}</span>
            </div>
          </Html>
        )}
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

        {/* Touch-only "Tap to draw" affordance — mirrors the desktop hover ring so
            the deck is discoverably tappable on phones. Prominent on your turn,
            quiet otherwise; never covers the cards. */}
        <DeckTapIndicator
          stackHeight={Math.min(15, Math.max(1, drawPileCount)) * 0.002}
          isTouch={isTouch}
          canDraw={canDraw}
        />
      </group>

      {/* 3. OPPONENT HANDS */}
      {playersList.map((occupant, pIdx) => {
        const isLocal = occupant.id === player?.id;
        if (isLocal) return null; // Local player hand is pure HTML HUD now

        const relativeIndex = (pIdx - safeLocalIndex + numPlayers) % numPlayers;
        const baseAngle = (Math.PI * 2 / numPlayers) * relativeIndex;
        
        const hand = playerCards[occupant.seatNumber] || [];
        const cardCount = hand.length;

        const rX = handRX;
        const rZ = handRZ;
        const groupPosition: [number, number, number] = [
          Math.sin(baseAngle) * rX,
          1.1,
          Math.cos(baseAngle) * rZ
        ];

        const isActiveTurn = occupant.id === currentPlayerId && gameStatus === 'playing';

        return (
          <group key={`player-${occupant.id}`} position={groupPosition}>
            {/* Single, world-anchored opponent badge — name + count chip +
                context-aware turn/UNO/voice cues. Rendered even at 0 cards so it
                doesn't blink out mid card-play animation; only the hand fan below
                is gated on cardCount. */}
            <Html position={[0, 0.15, 0]} center zIndexRange={[100, 0]}>
              <SeatBadge
                playerId={occupant.id}
                uid={occupant.uid}
                name={occupant.name}
                cardCount={cardCount}
                isActiveTurn={isActiveTurn}
                isBot={occupant.isBot}
                hasCalledUno={!!unoCalled[occupant.id]}
                compact={isMobile}
              />
            </Html>

            {/* Hand Fan */}
            {cardCount > 0 && hand.map((card, cIdx) => {
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
