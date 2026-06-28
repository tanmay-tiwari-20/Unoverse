'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Premium 3D Action Card Effects
 * 
 * Renders subtle, high-quality 3D effects for:
 * - SKIP: pulsing torus ring around discard pile
 * - REVERSE: rotating holographic ring above discard pile
 * - DRAW 2 / 4: floating +2/+4 labels near affected player
 * - WILD: expanding color wave on the table surface
 * - UNO: floating toast near the top
 */

interface ActiveEffect {
  id: string;
  type: 'skip' | 'reverse' | 'draw_two' | 'draw_four' | 'wild' | 'uno';
  playerName?: string;
  targetPos?: [number, number, number];
  startTime: number;
}

const DISCARD_POS: [number, number, number] = [0.3, 0.90, 0];
const TABLE_POS: [number, number, number] = [0, 0.898, 0];

export const ActionEffects3D: React.FC = () => {
  const room = useGameStore((s) => s.room);
  const player = useGameStore((s) => s.player);
  const playerCards = useGameStore((s) => s.playerCards);
  const discardPile = useGameStore((s) => s.discardPile);
  const gameStatus = useGameStore((s) => s.gameStatus);

  const [effects, setEffects] = useState<ActiveEffect[]>([]);

  const prevDiscardLenRef = useRef(0);
  const prevTopCardIdRef = useRef<string | null>(null);
  const prevHandSizesRef = useRef<Record<number, number>>({});
  
  // Also track UNO declared state to show toasts
  const unoCalled = useGameStore((s) => s.unoCalled);
  const prevUnoCalledRef = useRef<Record<string, boolean>>({});

  const playersList = room?.players || [];
  const numPlayers = Math.max(playersList.length, 2);
  const localPlayerIndex = playersList.findIndex(p => p.id === player?.id);
  const safeLocalIndex = localPlayerIndex >= 0 ? localPlayerIndex : 0;

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
      prevDiscardLenRef.current = discardPile.length;
      prevTopCardIdRef.current = discardPile.length > 0 ? discardPile[discardPile.length - 1]?.id : null;
      return;
    }

    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const currentSizes: Record<number, number> = {};
    playersList.forEach((p) => {
      currentSizes[p.seatNumber] = playerCards[p.seatNumber]?.length ?? 0;
    });

    const now = Date.now();
    const newEffects: ActiveEffect[] = [];

    // 1. Detect Action Card Plays (discard pile grew & top card changed)
    if (topCard && discardPile.length > prevDiscardLenRef.current && topCard.id !== prevTopCardIdRef.current) {
      const eid = `effect-${now}-${Math.random().toString(36).substring(2, 6)}`;
      
      if (topCard.value === 'skip') {
        newEffects.push({ id: eid, type: 'skip', startTime: now });
      } else if (topCard.value === 'reverse') {
        newEffects.push({ id: eid, type: 'reverse', startTime: now });
      } else if (topCard.value === 'wild') {
        newEffects.push({ id: eid, type: 'wild', startTime: now });
      }
    }

    // 2. Detect Draw Two / Draw Four by looking for hand size increases
    // We look for any player whose hand grew by 2 or 4 cards simultaneously, or just any growth if top card is +2/+4
    // Since draw flights stagger, we'll just check if the top card is a draw card and someone's hand grew
    if (topCard && (topCard.value === 'draw_two' || topCard.value === 'wild_draw_four')) {
      playersList.forEach((p, idx) => {
        const prev = prevHandSizesRef.current[p.seatNumber] ?? 0;
        const curr = currentSizes[p.seatNumber] ?? 0;
        if (curr > prev) {
          // Hand grew, must be the target! Only spawn effect once per draw event
          const hasExistingEffect = effects.some(e => 
            (e.type === 'draw_two' || e.type === 'draw_four') && e.playerName === p.name && (now - e.startTime < 1000)
          );
          if (!hasExistingEffect) {
            newEffects.push({
              id: `draw-${now}-${p.id}`,
              type: topCard.value === 'draw_two' ? 'draw_two' : 'draw_four',
              playerName: p.name,
              targetPos: getPlayerWorldPos(idx),
              startTime: now,
            });
          }
        }
      });
    }

    // 3. Detect UNO Declarations
    playersList.forEach((p) => {
      const prevCalled = prevUnoCalledRef.current[p.id] || false;
      const currCalled = unoCalled[p.id] || false;
      
      // If someone just called UNO
      if (!prevCalled && currCalled) {
        newEffects.push({
          id: `uno-decl-${now}-${p.id}`,
          type: 'uno',
          playerName: p.name,
          startTime: now,
        });
      }
    });

    if (newEffects.length > 0) {
      setEffects(prev => [...prev, ...newEffects]);
    }

    // Update refs
    prevDiscardLenRef.current = discardPile.length;
    prevTopCardIdRef.current = topCard?.id ?? null;
    prevHandSizesRef.current = currentSizes;
    prevUnoCalledRef.current = { ...unoCalled };
  }, [discardPile, playerCards, gameStatus, unoCalled]);

  const removeEffect = (id: string) => {
    setEffects(prev => prev.filter(e => e.id !== id));
  };

  const { vfxQuality, performanceMode } = useSettingsStore();

  if (vfxQuality === 'low' || performanceMode) return null;

  return (
    <group>
      {effects.map(effect => (
        <EffectItem key={effect.id} effect={effect} onComplete={() => removeEffect(effect.id)} />
      ))}
    </group>
  );
};

const EffectItem: React.FC<{ effect: ActiveEffect; onComplete: () => void }> = ({ effect, onComplete }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const duration = effect.type === 'wild' ? 1.0 : effect.type === 'uno' ? 1.5 : 1.2;

  useFrame(() => {
    const elapsed = (Date.now() - effect.startTime) / 1000;
    const progress = Math.min(elapsed / duration, 1.0);

    if (progress >= 1.0) {
      onComplete();
      return;
    }

    // Animate based on type
    if (effect.type === 'skip' && meshRef.current && materialRef.current) {
      // Pulse and fade
      const scale = 1 + Math.sin(progress * Math.PI) * 0.3;
      meshRef.current.scale.set(scale, scale, scale);
      materialRef.current.opacity = (1 - progress) * 0.6;
    }
    else if (effect.type === 'reverse' && groupRef.current && materialRef.current) {
      // Rotate hologram
      groupRef.current.rotation.y = progress * Math.PI * 4;
      materialRef.current.opacity = (1 - progress) * 0.8;
      groupRef.current.position.y = DISCARD_POS[1] + 0.1 + Math.sin(progress * Math.PI) * 0.05;
    }
    else if (effect.type === 'wild' && meshRef.current && materialRef.current) {
      // Wave expands across table
      const scale = progress * 8;
      meshRef.current.scale.set(scale, 1, scale);
      materialRef.current.opacity = (1 - progress) * 0.5;
    }
  });

  if (effect.type === 'skip') {
    return (
      <mesh ref={meshRef} position={DISCARD_POS} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.02, 16, 32]} />
        <meshBasicMaterial ref={materialRef} color="#ef4444" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    );
  }

  if (effect.type === 'reverse') {
    return (
      <group ref={groupRef} position={[DISCARD_POS[0], DISCARD_POS[1] + 0.1, DISCARD_POS[2]]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.13, 32, 1, 0, Math.PI * 1.5]} />
          <meshBasicMaterial ref={materialRef} color="#3b82f6" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  if (effect.type === 'wild') {
    return (
      <mesh ref={meshRef} position={TABLE_POS} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.2, 32]} />
        <meshBasicMaterial ref={materialRef} color="#a855f7" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    );
  }

  if (effect.type === 'draw_two' || effect.type === 'draw_four') {
    const color = effect.type === 'draw_two' ? 'text-amber-400' : 'text-purple-400';
    const label = effect.type === 'draw_two' ? '+2' : '+4';
    const pos = effect.targetPos || [0, 1.5, 0];

    return (
      <Html position={pos} center zIndexRange={[100, 0]}>
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.5 }}
          animate={{ opacity: [0, 1, 1, 0], y: -30, scale: 1 }}
          transition={{ duration: 1.2, times: [0, 0.2, 0.8, 1] }}
          className={`font-black text-4xl ${color} drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] select-none pointer-events-none`}
        >
          {label}
        </motion.div>
      </Html>
    );
  }

  if (effect.type === 'uno') {
    return (
      // Using a full screen HTML overlay for the UNO toast so it can be strictly top-center
      <Html fullscreen zIndexRange={[100, 0]} className="pointer-events-none">
        <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: 0, scale: 1 }}
            transition={{ duration: 1.5, times: [0, 0.15, 0.85, 1] }}
            className="bg-gradient-to-r from-red-600/90 to-amber-600/90 backdrop-blur-md border border-white/20 px-6 py-2 rounded-full shadow-[0_0_30px_rgba(239,68,68,0.4)] flex items-center gap-2"
          >
            <span className="text-white font-black text-sm tracking-widest uppercase">
              {effect.playerName ? `${effect.playerName} Declared UNO!` : 'UNO Declared!'}
            </span>
          </motion.div>
        </div>
      </Html>
    );
  }

  return null;
};

export default ActionEffects3D;
