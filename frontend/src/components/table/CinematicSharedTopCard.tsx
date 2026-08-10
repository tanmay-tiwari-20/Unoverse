'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { useGameStore } from '../../store/useGameStore';
import { PhysicalCard } from '../cards/PhysicalCard';
import type { CardItem } from '../../lib/cards/cardEngine';

export const CinematicSharedTopCard: React.FC = () => {
  const discardPile = useGameStore((state) => state.discardPile);
  const topCard = discardPile && discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Whether a card has already occupied this slot. The first card to land is
  // presented in place; every later one flies up off the pile.
  const [seenACard, setSeenACard] = useState(false);
  if (topCard && !seenACard) setSeenACard(true);

  if (!topCard) return null;

  // Keyed by card id so a new top card remounts: the flight progress, the
  // tap-to-zoom toggle and the displayed face all reset together, which is what
  // mirroring the store into local state was doing by hand.
  return <TopCardPresentation key={topCard.id} card={topCard} flyUp={seenACard} />;
};

interface TopCardPresentationProps {
  card: CardItem;
  /** Animate up off the pile on mount, rather than appearing already presented. */
  flyUp: boolean;
}

const TopCardPresentation: React.FC<TopCardPresentationProps> = ({ card, flyUp }) => {
  const discardCount = useGameStore((state) => state.discardCount);
  const wildColor = useGameStore((state) => state.wildColor);

  const [tapped, setTapped] = useState(false);
  const animProgress = useRef(flyUp ? 0 : 1);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (animProgress.current < 1) {
      animProgress.current += delta * 1.2;
      if (animProgress.current > 1) animProgress.current = 1;
    }

    const t = THREE.MathUtils.smoothstep(animProgress.current, 0, 1);

    // Start: flat on top of the discard pile
    // Height of the real pile, not of the visible window — `discardPile` is
    // capped at DISCARD_VISIBLE_COUNT, so its length stops growing mid-round.
    const pileHeight = (discardCount || 1) * 0.002;
    const startX = 0;
    const startY = pileHeight;
    const startZ = 0;
    const startRotX = 0;
    const startScale = 1.0;

    // End: standing upright on the pile, tilted slightly toward camera
    // The card front texture is on the +Y face of the boxGeometry.
    // Lying flat, +Y faces up. Camera is at (0, 1.45, 2.24) looking at (0, 1, 0).
    // To show the FRONT face to the camera: rotate around X by -(PI/2) so +Y → -Z.
    // Camera looks from +Z toward -Z, so it sees the face pointing toward -Z? No...
    // Camera looks toward -Z. Face pointing toward -Z means face points AWAY from camera.
    // Face pointing toward +Z means face points TOWARD camera.
    // rotation.x = +PI/2: +Y → +Z (toward camera). SHOULD show front.
    // PRAGMATIC FIX: try -PI/2 (the opposite). If +PI/2 shows back, -PI/2 shows front.
    const endRotX = Math.PI / 2 - 0.1; // ~5 degree tilt backward
    const endY = 0.25; // Move up a bit more to accommodate larger scale
    const baseScale = 2.0; // ~1.3x larger than previous 1.5
    const endScale = tapped ? 3.0 : baseScale;

    // Position: stays centered on the discard pile (group is child of discard pile group)
    groupRef.current.position.x = THREE.MathUtils.lerp(startX, 0, t);
    
    const arc = Math.sin(t * Math.PI) * 0.08;
    groupRef.current.position.y = THREE.MathUtils.lerp(startY, endY, t) + arc;
    groupRef.current.position.z = THREE.MathUtils.lerp(startZ, 0, t);

    groupRef.current.rotation.x = THREE.MathUtils.lerp(startRotX, endRotX, t);

    // Smooth scale (also handles tap-to-zoom)
    const targetScale = t >= 1 ? endScale : THREE.MathUtils.lerp(startScale, baseScale, t);
    groupRef.current.scale.x = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, 0.1);
    groupRef.current.scale.y = THREE.MathUtils.lerp(groupRef.current.scale.y, targetScale, 0.1);
    groupRef.current.scale.z = THREE.MathUtils.lerp(groupRef.current.scale.z, targetScale, 0.1);
  });

  // Once a player picks a color for a Wild / Wild +4, the top card adopts that color.
  const displayColor = card.color === 'wild' && wildColor ? wildColor : card.color;

  return (
    <group ref={groupRef}>
      <PhysicalCard
        color={displayColor}
        value={card.value}
        isFaceUp={true}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        animateSpawn="none"
        onClick={() => setTapped(prev => !prev)}
      />
    </group>
  );
};

export default CinematicSharedTopCard;
