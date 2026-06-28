'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import { getSeatCoords } from '../../utils/seating';

interface HumanSilhouetteProps {
  angle: number;
  radius: number;
  isActiveTurn: boolean;
  playerName: string;
}

const HumanSilhouette: React.FC<HumanSilhouetteProps> = ({ angle, radius, isActiveTurn, playerName }) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  
  // Position the seat around the elliptical table
  const position = useMemo(() => {
    // Table is an ellipse (X: 1.15, Z: 0.75). Add 0.3 offset so they sit back from the edge.
    const rX = 1.15 + 0.3;
    const rZ = 0.75 + 0.3;
    return new THREE.Vector3(
      Math.sin(angle) * rX,
      0.4, // Seat height
      Math.cos(angle) * rZ
    );
  }, [angle]);

  // Make the silhouette face the center
  const rotation = useMemo(() => {
    return new THREE.Euler(0, angle + Math.PI, 0);
  }, [angle]);

  // Idle animations
  useFrame((state) => {
    if (!groupRef.current || !headRef.current) return;
    
    const time = state.clock.getElapsedTime();
    const offset = angle * 10; // offset animation phase per player

    // Breathing (subtle Y scale and position)
    const breathing = Math.sin(time * 1.5 + offset) * 0.015;
    groupRef.current.position.y = position.y + breathing;
    
    // Active turn lean
    const leanZ = isActiveTurn ? 0.1 : 0;
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, position.z + Math.cos(angle) * leanZ, 0.05);
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, position.x + Math.sin(angle) * leanZ, 0.05);

    // Head subtle look around
    if (!isActiveTurn) {
      headRef.current.rotation.y = Math.sin(time * 0.8 + offset) * 0.15;
      headRef.current.rotation.x = Math.sin(time * 0.5 + offset) * 0.05;
    } else {
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, 0, 0.1);
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -0.1, 0.1); // Look down at cards slightly
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Torso/Shoulders */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.18, 0.5, 16]} />
        <meshStandardMaterial color="#050508" roughness={0.6} metalness={0.4} />
      </mesh>
      
      {/* Neck */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.15, 16]} />
        <meshStandardMaterial color="#050508" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 0.72, 0]} castShadow>
        <sphereGeometry args={[0.12, 32, 32]} />
        <meshStandardMaterial color="#050508" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Floating Nameplate (Subtle) */}
      {/* 
        Text rendering in 3D usually requires drei's Text component.
        Since we are minimizing drei imports for performance, we can skip actual 3D text 
        or render a glowing dot/badge. Let's use a subtle glowing dot for now.
      */}
      {isActiveTurn && (
        <pointLight position={[0, 1.2, 0]} intensity={0.5} distance={2} color="#10b981" />
      )}
    </group>
  );
};

export const WebGLSeats: React.FC = () => {
  const { room, player, currentPlayerId } = useGameStore();
  
  if (!room) return null;

  const playersList = room.players || [];
  const numPlayers = Math.max(playersList.length, 2);
  const localPlayerIndex = playersList.findIndex(p => p.id === player?.id);
  const safeLocalIndex = localPlayerIndex >= 0 ? localPlayerIndex : 0;

  // Table radius on Z axis is 0.96. We want them to sit right at the edge.
  const radius = 1.15;

  return (
    <group>
      {playersList.map((occupant, idx) => {
        // Skip rendering a silhouette for the local player (we are in first person)
        // Use name matching since names are strictly unique per room, making it resilient to socket reconnects
        if (occupant.name === player?.name) return null;

        // Calculate angle. 
        // We want the local player to always be at Angle 0 (bottom).
        // So we shift the index.
        const relativeIndex = (idx - safeLocalIndex + numPlayers) % numPlayers;
        const angle = (Math.PI * 2 / numPlayers) * relativeIndex;

        const isActiveTurn = occupant.id === currentPlayerId;

        return (
          <HumanSilhouette 
            key={`3dseat-${occupant.id}`} 
            angle={angle} 
            radius={radius} 
            isActiveTurn={isActiveTurn}
            playerName={occupant.name}
          />
        );
      })}
    </group>
  );
};

export default WebGLSeats;
