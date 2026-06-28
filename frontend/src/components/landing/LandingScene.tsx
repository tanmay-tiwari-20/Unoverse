'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from '../table/RoomEnvironment';
import { PhysicalCard } from '../cards/PhysicalCard';

/**
 * Premium 3D background for the landing page.
 * Renders the room environment with a cinematic camera angle,
 * a deck of cards, and a few scattered cards on the table.
 */
const LandingSceneContent: React.FC = () => {
  const cardsGroupRef = useRef<THREE.Group>(null);

  // Subtle ambient rotation for the scattered cards
  useFrame(({ clock }) => {
    if (cardsGroupRef.current) {
      const t = clock.getElapsedTime();
      // Extremely subtle table floating or breathing effect
      cardsGroupRef.current.position.y = Math.sin(t * 0.8) * 0.002;
    }
  });

  return (
    <group ref={cardsGroupRef}>
      {/* The Main Deck (stacked face down) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <PhysicalCard
          key={`deck-${i}`}
          color="wild"
          value="wild"
          isFaceUp={false}
          position={[0, 0.90 + i * 0.002, 0]}
          rotation={[0, 0.1, 0]}
        />
      ))}

      {/* Scattered Cards */}
      {/* Face up Red Skip */}
      <PhysicalCard
        color="red"
        value="skip"
        isFaceUp={true}
        position={[0.2, 0.90, 0.15]}
        rotation={[0, -0.4, 0]}
      />
      {/* Face down card */}
      <PhysicalCard
        color="blue"
        value="7"
        isFaceUp={false}
        position={[-0.15, 0.90, 0.25]}
        rotation={[0, 0.6, 0]}
      />
      {/* Face up Wild */}
      <PhysicalCard
        color="wild"
        value="wild"
        isFaceUp={true}
        position={[-0.25, 0.90, -0.1]}
        rotation={[0, -0.2, 0]}
      />
      {/* Face up Yellow 3 */}
      <PhysicalCard
        color="yellow"
        value="3"
        isFaceUp={true}
        position={[0.15, 0.90, -0.2]}
        rotation={[0, 0.8, 0]}
      />
    </group>
  );
};

export const LandingScene: React.FC = () => {
  return (
    <RoomEnvironment numPlayers={2} localIndex={0} isLandingPage={true}>
      <LandingSceneContent />
    </RoomEnvironment>
  );
};

export default LandingScene;
