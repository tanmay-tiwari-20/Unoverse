'use client';

/**
 * ClassicArena — the original dim-tavern world, extracted verbatim from
 * `RoomEnvironment`.
 *
 * This is the default arena, the landing-page world, and the Suspense fallback
 * every other arena falls back to while its lazy chunk loads. Nothing here
 * changed from the pre-arena scene beyond being lifted into a component that
 * receives `ArenaProps`, so it is a guaranteed zero-regression baseline: floor,
 * felt table, hanging lamp, wall props, fog and lights are byte-for-byte what
 * they were.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { scaleParticles } from '../../../lib/quality/qualityTiers';
import { ArenaProps, SeatRing } from './shared/ArenaKit';
import { getSeatRingRadii } from '../../../utils/tableLayout';

function FlyModel({ flyRef, wingsRef, scale }: {
  flyRef: React.RefObject<THREE.Group | null>;
  wingsRef: React.RefObject<THREE.Group | null>;
  scale: number;
}) {
  return (
    <group ref={flyRef} scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.005, 0.015, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color="#3a0d0d" roughness={0.5} />
      </mesh>
      <group ref={wingsRef} position={[0, 0.005, -0.002]}>
        <mesh position={[0.008, 0, -0.005]} rotation={[-Math.PI / 6, 0.3, 0]}>
          <planeGeometry args={[0.012, 0.02]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.008, 0, -0.005]} rotation={[-Math.PI / 6, -0.3, 0]}>
          <planeGeometry args={[0.012, 0.02]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Flies({ particleScale }: { particleScale: number }) {
  const fly1Ref = useRef<THREE.Group>(null);
  const fly2Ref = useRef<THREE.Group>(null);
  const wings1Ref = useRef<THREE.Group>(null);
  const wings2Ref = useRef<THREE.Group>(null);
  const prefersReduced = useReducedMotion();

  useFrame(({ clock }) => {
    if (prefersReduced) return;
    const t = clock.getElapsedTime();
    if (fly1Ref.current && wings1Ref.current) {
      fly1Ref.current.position.x = Math.sin(t * 1.5) * 0.3;
      fly1Ref.current.position.y = 1.3 + Math.sin(t * 2.5) * 0.15;
      fly1Ref.current.position.z = Math.cos(t * 1.8) * 0.3;
      fly1Ref.current.rotation.y = t * 10;
      fly1Ref.current.rotation.z = Math.sin(t * 20) * 0.5;
      wings1Ref.current.rotation.x = Math.sin(t * 150) * 0.6;
    }
    if (fly2Ref.current && wings2Ref.current) {
      fly2Ref.current.position.x = Math.sin(t * 1.2 + 2) * 0.4;
      fly2Ref.current.position.y = 1.2 + Math.cos(t * 2.2) * 0.2;
      fly2Ref.current.position.z = Math.cos(t * 1.9 + 1) * 0.25;
      fly2Ref.current.rotation.y = t * 12;
      fly2Ref.current.rotation.z = Math.cos(t * 22) * 0.5;
      wings2Ref.current.rotation.x = Math.cos(t * 180) * 0.6;
    }
  });

  const flyCount = scaleParticles(2, particleScale);

  return (
    <group>
      {flyCount > 0 && <FlyModel flyRef={fly1Ref} wingsRef={wings1Ref} scale={1.8} />}
      {flyCount > 1 && <FlyModel flyRef={fly2Ref} wingsRef={wings2Ref} scale={1.5} />}
    </group>
  );
}

function Floor() {
  const plankXPositions = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i < 80; i++) {
      positions.push(-48 + i * 1.2);
    }
    return positions;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0c0704" roughness={0.9} />
      </mesh>

      {plankXPositions.map((x, i) => (
        <mesh key={`plank-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, 0]}>
          <planeGeometry args={[0.012, 100]} />
          <meshStandardMaterial color="#050301" roughness={1.0} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function GameTable({ groupScale = [1, 1, 1] }: { groupScale?: [number, number, number] }) {
  const tabletopGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 1.15, 0.75, 0, Math.PI * 2, false, 0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
      curveSegments: 64,
    });
    return geo;
  }, []);

  const feltGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 1.11, 0.71, 0, Math.PI * 2, false, 0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.004,
      bevelEnabled: false,
      curveSegments: 64,
    });
    return geo;
  }, []);

  const legPositions: [number, number, number][] = useMemo(
    () => [
      [-0.8, 0.39, 0.5],
      [0.8, 0.39, 0.5],
      [-0.8, 0.39, -0.5],
      [0.8, 0.39, -0.5],
    ],
    []
  );

  return (
    <group scale={groupScale}>
      <mesh geometry={tabletopGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.83, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#241005"
          roughness={0.5}
          metalness={0.12}
          clearcoat={0.5}
          clearcoatRoughness={0.35}
          sheen={0.3}
          sheenColor="#5a2a10"
        />
      </mesh>

      <mesh geometry={feltGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.875, 0]} receiveShadow>
        <meshStandardMaterial color="#0c331e" roughness={0.95} />
      </mesh>

      {legPositions.map(([x, y, z], i) => (
        <group key={`leg-${i}`}>
          <mesh position={[x, y, z]} castShadow>
            <boxGeometry args={[0.12, 0.78, 0.12]} />
            <meshStandardMaterial color="#120602" roughness={0.8} />
          </mesh>
          <mesh position={[x, 0.015, z]}>
            <boxGeometry args={[0.15, 0.03, 0.15]} />
            <meshStandardMaterial color="#0a0301" roughness={0.9} />
          </mesh>
        </group>
      ))}

      <mesh position={[-0.8, 0.25, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 1.0]} />
        <meshStandardMaterial color="#120602" roughness={0.8} />
      </mesh>
      <mesh position={[0.8, 0.25, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 1.0]} />
        <meshStandardMaterial color="#120602" roughness={0.8} />
      </mesh>

      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[1.6, 0.08, 0.08]} />
        <meshStandardMaterial color="#120602" roughness={0.8} />
      </mesh>
    </group>
  );
}

function HangingLamp({
  isLandingPage,
  shadows,
  shadowMapSize,
  particleScale,
}: {
  isLandingPage?: boolean;
  shadows: boolean;
  shadowMapSize: number;
  particleScale: number;
}) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const lampGroupRef = useRef<THREE.Group>(null);

  const shadeGeo = useMemo(() => {
    const points = [
      new THREE.Vector2(0.28, 0.00),
      new THREE.Vector2(0.32, 0.02),
      new THREE.Vector2(0.33, 0.06),
      new THREE.Vector2(0.30, 0.12),
      new THREE.Vector2(0.22, 0.18),
      new THREE.Vector2(0.12, 0.23),
      new THREE.Vector2(0.05, 0.26),
      new THREE.Vector2(0.03, 0.27),
    ];
    return new THREE.LatheGeometry(points);
  }, []);

  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
      spotRef.current.shadow.bias = -0.0005;
      spotRef.current.shadow.camera.near = 0.5;
      spotRef.current.shadow.camera.far = 15;
    }
  }, []);

  useEffect(() => {
    const spot = spotRef.current;
    if (!spot) return;
    if (spot.shadow.mapSize.width === shadowMapSize) return;
    spot.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    spot.shadow.map?.dispose();
    spot.shadow.map = null;
  }, [shadowMapSize]);

  const prefersReduced = useReducedMotion();

  useFrame(({ clock }) => {
    if (prefersReduced) return;
    if (isLandingPage && lampGroupRef.current) {
      const t = clock.getElapsedTime();
      lampGroupRef.current.rotation.z = Math.sin(t * 0.5) * 0.015;
      lampGroupRef.current.rotation.x = Math.cos(t * 0.4) * 0.01;
    }
  });

  return (
    <group ref={lampGroupRef}>
      <mesh position={[0, 3.98, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.04, 16]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
      </mesh>

      <mesh position={[0, 2.75, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 2.5, 8]} />
        <meshStandardMaterial color="#111111" roughness={0.7} metalness={0.2} />
      </mesh>

      <mesh geometry={shadeGeo} position={[0, 1.5, 0]} castShadow={shadows}>
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.7} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.27, 0.29, 32]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.4} metalness={0.8} />
      </mesh>

      <spotLight
        ref={spotRef}
        position={[0, 1.65, 0]}
        angle={Math.PI / 2.8}
        penumbra={0.85}
        intensity={60}
        color="#ffcc77"
        castShadow={shadows}
        distance={10}
        decay={2}
      />

      <Flies particleScale={particleScale} />

      <object3D ref={targetRef} position={[0, 0.85, 0]} />

      <pointLight position={[0, 1.58, 0]} intensity={2.0} color="#ffb040" distance={2.5} decay={2} />

      <pointLight position={[0, 1.8, 2.8]} intensity={15.0} color="#ffffff" distance={8} decay={1.5} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Fireplace hearth — a stone hearth with a flickering fire. Purely additive
// tavern warmth against the back wall; the existing floor/table/lamp are left
// byte-for-byte untouched so this stays a zero-regression baseline.
// ---------------------------------------------------------------------------

function Fireplace({ tier }: { tier: 'high' | 'medium' | 'low' }) {
  const prefersReduced = useReducedMotion();
  const lightRef = useRef<THREE.PointLight>(null);
  const flamesRef = useRef<THREE.Group>(null);

  const tongues = useMemo(() => {
    const n = tier === 'low' ? 2 : 3;
    return Array.from({ length: n }, (_, i) => ({
      x: (i - (n - 1) / 2) * 0.14,
      h: 0.3 + (i % 2 === 0 ? 0.1 : 0),
      phase: i * 1.9,
      color: i % 2 === 0 ? '#ff9a3c' : '#ffd070',
    }));
  }, [tier]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Firelight flicker: layered sines read as a restless flame; steady if reduced.
    if (lightRef.current) {
      const flicker = prefersReduced
        ? 1
        : 0.82 + 0.14 * Math.sin(t * 11.0) * Math.sin(t * 6.7) + 0.06 * Math.sin(t * 23.0);
      lightRef.current.intensity = 14 * flicker;
    }
    if (prefersReduced || !flamesRef.current) return;
    flamesRef.current.children.forEach((c, i) => {
      const p = tongues[i]?.phase ?? 0;
      const sx = 0.82 + 0.16 * Math.sin(t * 9.0 + p) + 0.06 * Math.sin(t * 19.0 + p);
      c.scale.set(sx, 0.9 + 0.22 * Math.sin(t * 7.0 + p), sx);
    });
  });

  return (
    <group position={[3.1, 0, -4.2]}>
      {/* Stone hearth base */}
      <mesh position={[0, 0.1, 0.12]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.2, 0.7]} />
        <meshStandardMaterial color="#2b2622" roughness={1} />
      </mesh>
      {/* Side pillars */}
      <mesh position={[-0.6, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 1.7, 0.5]} />
        <meshStandardMaterial color="#332c26" roughness={1} />
      </mesh>
      <mesh position={[0.6, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 1.7, 0.5]} />
        <meshStandardMaterial color="#332c26" roughness={1} />
      </mesh>
      {/* Mantel lintel */}
      <mesh position={[0, 1.6, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.28, 0.56]} />
        <meshStandardMaterial color="#3a322b" roughness={0.95} />
      </mesh>
      {/* Sooty firebox back */}
      <mesh position={[0, 0.75, -0.18]}>
        <planeGeometry args={[1.0, 1.3]} />
        <meshStandardMaterial color="#0a0705" roughness={1} />
      </mesh>
      {/* Logs */}
      <mesh position={[-0.12, 0.26, 0.08]} rotation={[0, 0.3, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.6, 8]} />
        <meshStandardMaterial color="#20140c" roughness={0.9} />
      </mesh>
      <mesh position={[0.14, 0.26, 0.02]} rotation={[0, -0.2, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.55, 8]} />
        <meshStandardMaterial color="#1a1009" roughness={0.9} />
      </mesh>
      {/* Ember bed glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.22, 0.05]}>
        <circleGeometry args={[0.28, 20]} />
        <meshBasicMaterial color="#ff6a1e" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Flame tongues */}
      <group ref={flamesRef} position={[0, 0.34, 0.05]}>
        {tongues.map((tg, i) => (
          <mesh key={i} position={[tg.x, tg.h / 2, 0]}>
            <coneGeometry args={[0.09, tg.h, 8, 1, true]} />
            <meshBasicMaterial color={tg.color} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* Flickering firelight + steady ember bounce */}
      <pointLight ref={lightRef} position={[0, 0.55, 0.35]} color="#ff8a3a" intensity={14} distance={7} decay={2} />
      <pointLight position={[0, 0.3, 0.1]} color="#ff5a1e" intensity={2} distance={2.5} decay={2} />
    </group>
  );
}

/** A wall-mounted candle sconce with a small flickering flame + warm glow. */
function WallSconce({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const prefersReduced = useReducedMotion();
  const lightRef = useRef<THREE.PointLight>(null);
  const flameRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (prefersReduced) return;
    const t = clock.getElapsedTime();
    const flicker = 0.75 + 0.2 * Math.sin(t * 13 + position[0]) + 0.08 * Math.sin(t * 27);
    if (lightRef.current) lightRef.current.intensity = 3.2 * flicker;
    if (flameRef.current) {
      const s = 0.85 + 0.2 * Math.sin(t * 15 + position[0]);
      flameRef.current.scale.set(s, 0.9 + 0.2 * Math.sin(t * 11), s);
    }
  });
  return (
    <group position={position} rotation={rotation}>
      {/* Iron bracket */}
      <mesh castShadow>
        <boxGeometry args={[0.08, 0.16, 0.08]} />
        <meshStandardMaterial color="#161310" roughness={0.6} metalness={0.6} />
      </mesh>
      {/* Candle */}
      <mesh position={[0, 0.14, 0.02]}>
        <cylinderGeometry args={[0.02, 0.022, 0.12, 8]} />
        <meshStandardMaterial color="#e8dcc0" roughness={0.8} emissive="#3a2a10" emissiveIntensity={0.3} />
      </mesh>
      {/* Flame */}
      <mesh ref={flameRef} position={[0, 0.24, 0.02]}>
        <coneGeometry args={[0.025, 0.09, 8]} />
        <meshBasicMaterial color="#ffcf6a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0.24, 0.05]} color="#ffb04a" intensity={3.2} distance={3} decay={2} />
    </group>
  );
}

function RoomProps() {
  return (
    <group>
      <ambientLight intensity={0.4} color="#ffffff" />
      <pointLight position={[0, 2.5, 0]} intensity={6.0} color="#ffddaa" distance={15} decay={1.5} />

      <mesh position={[0, 4.0, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#3d2f26" roughness={1.0} />
      </mesh>

      <group position={[0, 0, -4.5]}>
        <mesh position={[0, 2.5, -0.1]} receiveShadow>
          <planeGeometry args={[20, 10]} />
          <meshStandardMaterial color="#4a3b32" roughness={1.0} />
        </mesh>

        <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 0.05, 0.4]} />
          <meshStandardMaterial color="#5c3a21" roughness={0.9} />
        </mesh>
        <mesh position={[-1.2, 1.65, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.3, 0.3]} />
          <meshStandardMaterial color="#2a1f1a" roughness={0.8} />
        </mesh>
        <mesh position={[1.2, 1.65, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.3, 0.3]} />
          <meshStandardMaterial color="#2a1f1a" roughness={0.8} />
        </mesh>

        <mesh position={[-1.0, 1.95, 0]} rotation={[0, 0, 0.1]} castShadow>
          <boxGeometry args={[0.08, 0.25, 0.2]} />
          <meshStandardMaterial color="#3a1c1c" roughness={0.9} />
        </mesh>
        <mesh position={[-0.9, 1.94, 0]} castShadow>
          <boxGeometry args={[0.06, 0.24, 0.22]} />
          <meshStandardMaterial color="#1c243a" roughness={0.9} />
        </mesh>
        <mesh position={[-0.82, 1.95, 0]} castShadow>
          <boxGeometry args={[0.07, 0.26, 0.19]} />
          <meshStandardMaterial color="#243a1c" roughness={0.9} />
        </mesh>

        <mesh position={[0.5, 1.88, 0]} rotation={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.3, 0.1, 0.2]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>
        <mesh position={[0.55, 1.98, 0]} rotation={[0, 0.1, 0]} castShadow>
          <boxGeometry args={[0.2, 0.08, 0.15]} />
          <meshStandardMaterial color="#3a1818" roughness={0.7} />
        </mesh>
      </group>

      <group position={[4.5, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 2.5, -0.1]} receiveShadow>
          <planeGeometry args={[20, 10]} />
          <meshStandardMaterial color="#4a3b32" roughness={1.0} />
        </mesh>

        <group position={[-1, 2.0, 0.02]}>
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.9, 1.3, 0.04]} />
            <meshStandardMaterial color="#2a1a10" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.022]}>
            <planeGeometry args={[0.8, 1.2]} />
            <meshStandardMaterial color="#140a05" roughness={0.9} />
          </mesh>
        </group>

        <group position={[1.5, 2.5, 0]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.026]}>
            <circleGeometry args={[0.26, 32]} />
            <meshStandardMaterial color="#1a1816" roughness={0.9} />
          </mesh>
        </group>

        <group position={[1.5, 1.5, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.05, 0.1, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0.05]} castShadow rotation={[-0.2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.1, 8]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.5} />
          </mesh>
        </group>
      </group>

      <group position={[-4.5, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 2.5, -0.1]} receiveShadow>
          <planeGeometry args={[20, 10]} />
          <meshStandardMaterial color="#4a3b32" roughness={1.0} />
        </mesh>
      </group>

      <group position={[-3.5, 0, -3.5]} rotation={[0, Math.PI / 4, 0]}>
        <group position={[-0.5, 0, -0.5]}>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.25, 0.04, 16]} />
            <meshStandardMaterial color="#050505" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 1.6, 8]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.8} />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.25, 0.3, 16]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
          </mesh>
        </group>

        <mesh position={[0.5, 0.4, 0.2]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.8, 0.5]} />
          <meshStandardMaterial color="#3a2518" roughness={0.9} />
        </mesh>

        <group position={[-0.5, 0, 0.8]} rotation={[0, -0.3, 0]}>
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.4, 0.04, 0.4]} />
            <meshStandardMaterial color="#0a0502" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.75, -0.18]} castShadow receiveShadow>
            <boxGeometry args={[0.35, 0.3, 0.04]} />
            <meshStandardMaterial color="#0a0502" roughness={0.8} />
          </mesh>
          <mesh position={[-0.16, 0.225, 0.16]} castShadow>
            <boxGeometry args={[0.04, 0.45, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
          <mesh position={[0.16, 0.225, 0.16]} castShadow>
            <boxGeometry args={[0.04, 0.45, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
          <mesh position={[-0.16, 0.4, -0.16]} castShadow>
            <boxGeometry args={[0.04, 0.8, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
          <mesh position={[0.16, 0.4, -0.16]} castShadow>
            <boxGeometry args={[0.04, 0.8, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * A sturdy wooden tavern chair with a cushioned seat: four turned legs, a
 * slatted back and a leather-look cushion. Built at the origin facing the table
 * (+Z toward centre) and placed by SeatRing. Purely decorative — matches the
 * dark stained wood of the table so it reads as part of the same set.
 */
function TavernChair() {
  const woodDark = '#160a03';
  const woodMid = '#2a160a';
  return (
    <group>
      {/* Seat frame — sized so the CUSHION top lands at ≈0.42, matching the
          shared seated HIP_Y=0.44 (same convention as the Space console pod and
          the Jungle stump) instead of sitting ~0.10 too high. */}
      <mesh position={[0, 0.345, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.06, 0.44]} />
        <meshStandardMaterial color={woodMid} roughness={0.75} metalness={0.05} />
      </mesh>
      {/* Cushion — usable seat surface (top ≈0.42). */}
      <mesh position={[0, 0.395, 0.04]} castShadow>
        <boxGeometry args={[0.4, 0.05, 0.38]} />
        <meshPhysicalMaterial color="#5a2016" roughness={0.85} sheen={0.4} sheenColor="#7a3020" />
      </mesh>
      {/* Back posts */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={`post${x}`} position={[x, 0.625, -0.19]} castShadow>
          <cylinderGeometry args={[0.028, 0.032, 0.62, 8]} />
          <meshStandardMaterial color={woodDark} roughness={0.8} />
        </mesh>
      ))}
      {/* Back slats */}
      {[0.565, 0.725, 0.885].map((y) => (
        <mesh key={`slat${y}`} position={[0, y, -0.19]} castShadow>
          <boxGeometry args={[0.38, 0.07, 0.03]} />
          <meshStandardMaterial color={woodMid} roughness={0.8} />
        </mesh>
      ))}
      {/* Four legs */}
      {[
        [-0.19, -0.17],
        [0.19, -0.17],
        [-0.19, 0.23],
        [0.19, 0.23],
      ].map(([x, z], i) => (
        <mesh key={`leg${i}`} position={[x, 0.16, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.038, 0.32, 8]} />
          <meshStandardMaterial color={woodDark} roughness={0.8} />
        </mesh>
      ))}
      {/* Stretcher bar between front legs */}
      <mesh position={[0, 0.09, 0.23]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.38, 6]} />
        <meshStandardMaterial color={woodDark} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  World / Table memo split (perf)
// ---------------------------------------------------------------------------
//
//  The arena is split into two `React.memo` boundaries so a player-count change
//  (the bot-add case) reconciles ONLY the small count-dependent subtree:
//
//   - `ClassicWorld` — fog, lights, floor, lamp, room props, hearth, sconces.
//     It is NOT given `numPlayers`, so adding a bot never reconciles the heavy
//     world or recompiles its shaders. Its props are the module-stable `quality`
//     object + the `isLandingPage` flag, so it bails on every non-quality swap.
//   - `ClassicTable` — the felt table slab + the tavern-chair seat ring. This is
//     the only subtree that reconciles on a count change (radii + chair count).
//
//  Play-surface geometry (table ellipse, felt height, seat radii) is byte-for-
//  byte what it was — only the component boundary changed.

const ClassicWorld = React.memo(function ClassicWorld({
  quality,
  isLandingPage,
}: {
  quality: ArenaProps['quality'];
  isLandingPage?: boolean;
}) {
  const performanceMode = useSettingsStore((s) => s.performanceMode);
  const tier = quality.tier;

  return (
    <>
      <fog attach="fog" args={['#080402', 15, 50]} />

      {/* Dim ambient room visibility (deep dark blue/brown) */}
      <hemisphereLight args={['#18120c', '#080402', 0.8]} />

      {/* Under-table bounce light. A second shadow-casting light is expensive, so
          it follows the effective tier rather than the raw setting. */}
      <pointLight
        position={[0, 0.4, 0]}
        intensity={performanceMode ? 15 : 30}
        color="#ffaa55"
        distance={5}
        decay={2}
        castShadow={quality.shadows}
      />

      <Floor />
      <HangingLamp
        isLandingPage={isLandingPage}
        shadows={quality.shadows}
        shadowMapSize={quality.shadowMapSize}
        particleScale={quality.particleScale}
      />
      <RoomProps />

      {/* Tavern warmth: a flickering stone hearth against the back wall and a
          pair of candle sconces on the side walls. Purely additive atmosphere. */}
      <Fireplace tier={tier} />
      <WallSconce position={[-4.42, 1.7, -1.4]} rotation={[0, Math.PI / 2, 0]} />
      <WallSconce position={[-4.42, 1.7, 1.4]} rotation={[0, Math.PI / 2, 0]} />
      {tier !== 'low' && (
        <WallSconce position={[4.42, 1.7, -1.4]} rotation={[0, -Math.PI / 2, 0]} />
      )}
    </>
  );
});

const ClassicTable = React.memo(function ClassicTable({
  numPlayers,
  localIndex,
  tableGroupScale,
}: {
  numPlayers: number;
  localIndex: number;
  tableGroupScale: [number, number, number];
}) {
  const seat = getSeatRingRadii(numPlayers);
  return (
    <>
      <GameTable groupScale={tableGroupScale} />

      {/* Wooden tavern chairs at every remote seat. Placed with the shared
          SeatRing so seat math matches the players rendered by WebGLSeats. */}
      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.15} rZ={seat.rZ + 0.15}>
        {() => <TavernChair />}
      </SeatRing>
    </>
  );
});

/**
 * The classic tavern world. Owns its own fog + lights (moved here from the old
 * `Scene`) so it is a fully self-contained arena like every other. Composed from
 * a memoized world subtree (count-independent) and a memoized table subtree (the
 * only part that reconciles when the player count changes).
 */
export default function ClassicArena({ numPlayers, localIndex, quality, tableGroupScale, isLandingPage }: ArenaProps) {
  return (
    <>
      <ClassicWorld quality={quality} isLandingPage={isLandingPage} />
      <ClassicTable numPlayers={numPlayers} localIndex={localIndex} tableGroupScale={tableGroupScale} />
    </>
  );
}
