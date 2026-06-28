'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { AnimatedCard } from './AnimatedCard';
import { CardItem } from '../../lib/cards/cardEngine';

/**
 * Renders temporary flying card animations within the 3D scene.
 * 
 * Detects:
 * - Card played: discard pile grows → card flies from player area to discard pile
 * - Card drawn: player hand grows → card flies from draw pile to player area
 * 
 * Uses the existing AnimatedCard component for smooth arc trajectories.
 * No modification to existing card rendering or game logic.
 */

interface FlyingCard {
  id: string;
  card: CardItem;
  startPos: [number, number, number];
  endPos: [number, number, number];
  startRot: [number, number, number];
  endRot: [number, number, number];
  isFaceUp: boolean;
  duration: number;
}

// World-space positions for the draw pile and discard pile (matching WebGLCards)
const DRAW_PILE_POS: [number, number, number] = [-0.3, 0.92, 0];
const DISCARD_PILE_POS: [number, number, number] = [0.3, 0.92, 0];

export const CardFlightAnimations: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const playerCards = useGameStore((s) => s.playerCards);
  const discardPile = useGameStore((s) => s.discardPile);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const { cardAnimations } = useSettingsStore();

  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);

  // Track previous state for diffing
  const prevDiscardLenRef = useRef(0);
  const prevTopCardIdRef = useRef<string | null>(null);
  const prevHandSizesRef = useRef<Record<number, number>>({});
  const initializedRef = useRef(false);

  const playersList = room?.players || [];
  const numPlayers = Math.max(playersList.length, 2);
  const localPlayerIndex = playersList.findIndex(p => p.id === player?.id);
  const safeLocalIndex = localPlayerIndex >= 0 ? localPlayerIndex : 0;

  // Calculate 3D world position for a player's hand area
  const getPlayerWorldPos = (playerIndex: number): [number, number, number] => {
    const relativeIndex = (playerIndex - safeLocalIndex + numPlayers) % numPlayers;
    const baseAngle = (Math.PI * 2 / numPlayers) * relativeIndex;
    const rX = 1.15;
    const rZ = 0.75;
    return [
      Math.sin(baseAngle) * rX,
      1.1,
      Math.cos(baseAngle) * rZ,
    ];
  };

  useEffect(() => {
    if (gameStatus !== 'playing' && gameStatus !== 'awaiting_color_selection') {
      // Reset tracking on game restart
      prevDiscardLenRef.current = discardPile.length;
      prevTopCardIdRef.current = discardPile.length > 0 ? discardPile[discardPile.length - 1]?.id : null;
      const sizes: Record<number, number> = {};
      playersList.forEach(p => {
        sizes[p.seatNumber] = playerCards[p.seatNumber]?.length ?? 0;
      });
      prevHandSizesRef.current = sizes;
      initializedRef.current = false;
      return;
    }

    // Skip the very first state update (initial deal) to avoid mass flight chaos
    if (!initializedRef.current) {
      prevDiscardLenRef.current = discardPile.length;
      prevTopCardIdRef.current = discardPile.length > 0 ? discardPile[discardPile.length - 1]?.id : null;
      const sizes: Record<number, number> = {};
      playersList.forEach(p => {
        sizes[p.seatNumber] = playerCards[p.seatNumber]?.length ?? 0;
      });
      prevHandSizesRef.current = sizes;
      initializedRef.current = true;
      return;
    }

    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const newFlying: FlyingCard[] = [];

    // 1. Detect card played (discard pile grew)
    if (
      topCard &&
      discardPile.length > prevDiscardLenRef.current &&
      topCard.id !== prevTopCardIdRef.current
    ) {
      // Find which player lost a card (hand shrunk)
      let sourcePlayerIdx = -1;
      playersList.forEach((p, idx) => {
        const prevSize = prevHandSizesRef.current[p.seatNumber] ?? 0;
        const currSize = playerCards[p.seatNumber]?.length ?? 0;
        if (currSize < prevSize) {
          sourcePlayerIdx = idx;
        }
      });

      const sourcePos = sourcePlayerIdx >= 0 
        ? getPlayerWorldPos(sourcePlayerIdx) 
        : [0, 1.3, 1.0] as [number, number, number];

      newFlying.push({
        id: `play-${topCard.id}-${Date.now()}`,
        card: topCard,
        startPos: sourcePos as [number, number, number],
        endPos: DISCARD_PILE_POS,
        startRot: [0, 0, 0],
        endRot: [0, (Math.random() - 0.5) * 0.3, 0],
        isFaceUp: true,
        duration: 0.4,
      });
    }

    // 2. Detect cards drawn (any player's hand grew)
    playersList.forEach((p, idx) => {
      const prevSize = prevHandSizesRef.current[p.seatNumber] ?? 0;
      const currSize = playerCards[p.seatNumber]?.length ?? 0;
      const cardsGained = currSize - prevSize;

      if (cardsGained > 0 && discardPile.length <= prevDiscardLenRef.current) {
        // Only create flight for draw events (not when discard pile also changed, which is a play)
        // Actually, draw_two/draw_four cause BOTH pile change and hand growth simultaneously
        // So let's always animate draw when hand grows
        const destPos = getPlayerWorldPos(idx);
        const isLocal = p.id === player?.id;

        // Animate up to 4 cards max to avoid spam
        const animCount = Math.min(cardsGained, 4);
        for (let i = 0; i < animCount; i++) {
          newFlying.push({
            id: `draw-${p.id}-${Date.now()}-${i}`,
            card: { id: `draw-anim-${i}`, color: 'wild', value: 'wild' } as CardItem,
            startPos: DRAW_PILE_POS,
            endPos: destPos as [number, number, number],
            startRot: [0, 0, 0],
            endRot: isLocal ? [0, 0, 0] : [0.8, 0, 0],
            isFaceUp: false,
            duration: 0.35 + i * 0.1, // Stagger slightly
          });
        }
      }
    });

    // Update refs
    prevDiscardLenRef.current = discardPile.length;
    prevTopCardIdRef.current = topCard?.id ?? null;
    const sizes: Record<number, number> = {};
    playersList.forEach(p => {
      sizes[p.seatNumber] = playerCards[p.seatNumber]?.length ?? 0;
    });
    prevHandSizesRef.current = sizes;

    // Add new flying cards
    if (newFlying.length > 0) {
      setFlyingCards(prev => [...prev, ...newFlying]);
    }
  }, [discardPile, playerCards, gameStatus]);

  const removeFlyingCard = (id: string) => {
    setFlyingCards(prev => prev.filter(f => f.id !== id));
  };

  if (flyingCards.length === 0) return null;

  if (!cardAnimations) return null;

  return (
    <group>
      {flyingCards.map((fc) => (
        <AnimatedCard
          key={fc.id}
          card={fc.card}
          startPos={fc.startPos}
          endPos={fc.endPos}
          startRot={fc.startRot}
          endRot={fc.endRot}
          isFaceUp={fc.isFaceUp}
          duration={fc.duration}
          onComplete={() => removeFlyingCard(fc.id)}
        />
      ))}
    </group>
  );
};

export default CardFlightAnimations;
