import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PhysicalCard } from '../cards/PhysicalCard';
import { CardItem } from '../../lib/cards/cardEngine';

interface AnimatedCardProps {
  card: CardItem;
  startPos: [number, number, number];
  endPos: [number, number, number];
  startRot: [number, number, number];
  endRot: [number, number, number];
  isFaceUp: boolean;
  onComplete: () => void;
  duration?: number;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  card,
  startPos,
  endPos,
  startRot,
  endRot,
  isFaceUp,
  onComplete,
  duration = 0.6
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    // Reset if props change
    progress.current = 0;
    setCompleted(false);
  }, [card.id]);

  useFrame((state, delta) => {
    if (completed || !meshRef.current) return;

    progress.current += delta / duration;
    
    if (progress.current >= 1) {
      progress.current = 1;
      setCompleted(true);
      onComplete();
    }

    // Smoothstep easing
    const t = THREE.MathUtils.smoothstep(progress.current, 0, 1);

    // Parabolic arc for Y to simulate throwing/drawing
    const arcHeight = 0.4;
    const arcY = Math.sin(t * Math.PI) * arcHeight;

    meshRef.current.position.x = THREE.MathUtils.lerp(startPos[0], endPos[0], t);
    meshRef.current.position.y = THREE.MathUtils.lerp(startPos[1], endPos[1], t) + arcY;
    meshRef.current.position.z = THREE.MathUtils.lerp(startPos[2], endPos[2], t);

    // Smooth rotation
    meshRef.current.rotation.x = THREE.MathUtils.lerp(startRot[0], endRot[0], t);
    meshRef.current.rotation.y = THREE.MathUtils.lerp(startRot[1], endRot[1], t);
    meshRef.current.rotation.z = THREE.MathUtils.lerp(startRot[2], endRot[2], t);
  });

  if (completed) return null;

  return (
    <group ref={meshRef}>
      <PhysicalCard
        color={card.color as any}
        value={card.value}
        isFaceUp={isFaceUp}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        animateSpawn="none"
      />
    </group>
  );
};
