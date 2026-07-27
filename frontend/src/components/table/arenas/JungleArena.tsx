'use client';

/**
 * JungleArena — an ancient moss-covered stone platform deep in a sunlit rainforest.
 *
 * World: a warm domain-warped canopy sky, a displaced vertex-coloured jungle
 * floor, layered vegetation (giant canopy trees, mid trees and ground ferns/bushes
 * — all fBm-built and merged so each species is a single draw call), hanging
 * vines, tumbled ancient ruins, tree roots, and a flowing river with a small
 * waterfall (scrolling shader). Life: drifting pollen god-rays, fireflies, and a
 * few butterflies fluttering near the clearing.
 *
 * Platform: a carved mossy rock slab on a stone base with a soft green rim; mossy
 * stone stumps serve as seats. Quality-tier gates the sky shader, terrain segment
 * count, particle counts and shadows.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ArenaProps,
  GradientSky,
  DriftField,
  Instances,
  InstanceTransform,
  PlaySurface,
  ScrollSurface,
  TerrainPlane,
  SeatRing,
  useDisposable,
  PLAY_SURFACE_Y,
  BASE_TABLE_RX,
  BASE_TABLE_RZ,
} from './shared/ArenaKit';
import { buildTree, buildRockCluster, mulberry32 } from './shared/proceduralGeometry';
import { getSeatRingRadii } from '../../../utils/tableLayout';

// ---------------------------------------------------------------------------
// Vegetation — three species, each a merged geometry instanced in one draw call
// ---------------------------------------------------------------------------

/**
 * A vegetation layer: `count` copies of one merged, vertex-coloured plant
 * geometry, scattered in a ring band with per-instance scale/rotation.
 */
function VegetationLayer({
  geometry,
  count,
  radiusMin,
  radiusMax,
  scaleMin,
  scaleMax,
  seed,
  castShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  count: number;
  radiusMin: number;
  radiusMax: number;
  scaleMin: number;
  scaleMax: number;
  seed: number;
  castShadow?: boolean;
}) {
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }), []);
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(seed);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.7;
      const rad = radiusMin + r() * (radiusMax - radiusMin);
      out.push({
        position: [Math.cos(a) * rad, 0, Math.sin(a) * rad],
        rotation: [0, r() * Math.PI * 2, 0],
        scale: scaleMin + r() * (scaleMax - scaleMin),
      });
    }
    return out;
  }, [count, radiusMin, radiusMax, scaleMin, scaleMax, seed]);
  return <Instances transforms={transforms} geometry={geometry} material={mat} castShadow={castShadow} />;
}

/** Hanging vine: a thin drooping strip with a subtle sway. */
function Vines({ count, reducedMotion }: { count: number; reducedMotion?: boolean }) {
  const geo = useDisposable(() => new THREE.CylinderGeometry(0.03, 0.015, 3.4, 5), []);
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#2f5d2a', roughness: 1 }), []);
  const group = useRef<THREE.Group>(null);
  const vines = useMemo(() => {
    const r = mulberry32(31);
    return Array.from({ length: count }, () => {
      const a = r() * Math.PI * 2;
      const rad = 6 + r() * 8;
      return { pos: [Math.cos(a) * rad, 5 + r() * 2, Math.sin(a) * rad] as [number, number, number], phase: r() * Math.PI * 2, tilt: (r() - 0.5) * 0.3 };
    });
  }, [count]);
  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((c, i) => {
      c.rotation.z = vines[i].tilt + Math.sin(t * 0.6 + vines[i].phase) * 0.08;
    });
  });
  return (
    <group ref={group}>
      {vines.map((v, i) => (
        <mesh key={i} geometry={geo} material={mat} position={v.pos} rotation={[0, 0, v.tilt]} />
      ))}
    </group>
  );
}

/** Butterflies: small additive wings on lazy looping paths near the clearing. */
function Butterflies({ count, reducedMotion }: { count: number; reducedMotion?: boolean }) {
  const geo = useDisposable(() => new THREE.PlaneGeometry(0.16, 0.12), []);
  const mats = useDisposable(() => [
    new THREE.MeshBasicMaterial({ color: '#ff9a4d', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    new THREE.MeshBasicMaterial({ color: '#67d6ff', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    new THREE.MeshBasicMaterial({ color: '#ffe066', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  ], []);
  const flies = useMemo(() => {
    const r = mulberry32(41);
    return Array.from({ length: count }, () => ({
      radius: 2 + r() * 4,
      y: 1.2 + r() * 1.6,
      speed: 0.4 + r() * 0.5,
      phase: r() * Math.PI * 2,
      mat: Math.floor(r() * 3),
    }));
  }, [count]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    flies.forEach((f, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = t * f.speed + f.phase;
      g.position.set(Math.cos(a) * f.radius, f.y + Math.sin(a * 2) * 0.3, Math.sin(a) * f.radius);
      g.rotation.y = -a + Math.PI / 2;
      const flap = Math.sin(t * 14 + f.phase) * 0.9;
      (g.children[0] as THREE.Mesh).rotation.y = flap;
      (g.children[1] as THREE.Mesh).rotation.y = -flap;
    });
  });
  return (
    <>
      {flies.map((f, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <mesh geometry={geo} material={mats[f.mat]} position={[0.08, 0, 0]} />
          <mesh geometry={geo} material={mats[f.mat]} position={[-0.08, 0, 0]} />
        </group>
      ))}
    </>
  );
}

function Pillar({ position, rotation, tilt, broken }: { position: [number, number, number]; rotation: number; tilt: number; broken?: boolean }) {
  return (
    <group position={position} rotation={[tilt, rotation, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.5, broken ? 2.0 : 3.2, 8]} />
        <meshStandardMaterial color="#5a5142" roughness={1} flatShading />
      </mesh>
      {!broken && (
        <mesh position={[0, 1.7, 0]} castShadow>
          <boxGeometry args={[1.2, 0.3, 1.2]} />
          <meshStandardMaterial color="#4c4536" roughness={1} flatShading />
        </mesh>
      )}
      {/* moss skirt */}
      <mesh position={[0, broken ? -0.7 : 0.4, 0]}>
        <cylinderGeometry args={[0.47, 0.47, 0.8, 8]} />
        <meshStandardMaterial color="#2f5d2a" roughness={1} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function MossyRock({ tableGroupScale }: { tableGroupScale: [number, number, number] }) {
  const surfaceMat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#3d5a2e', roughness: 1, metalness: 0 }), []);
  const rootGeo = useDisposable(() => buildRockCluster(66, ['#4a4436', '#5a5142', '#3a3226']), []);
  const rootMat = useDisposable(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), []);
  const roots = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(70);
    return Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return { position: [Math.cos(a) * BASE_TABLE_RX * 0.95, 0.05, Math.sin(a) * BASE_TABLE_RZ * 0.95] as [number, number, number], rotation: [0, a, 0] as [number, number, number], scale: 0.5 + r() * 0.3 };
    });
  }, []);

  return (
    <group scale={tableGroupScale}>
      <PlaySurface rX={BASE_TABLE_RX} rZ={BASE_TABLE_RZ} thickness={0.12} surfaceMaterial={surfaceMat} edgeColor="#8ff06a" edgeIntensity={0.5} />

      {/* Rough stone base beneath the mossy top */}
      <mesh position={[0, PLAY_SURFACE_Y / 2 - 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[BASE_TABLE_RX * 0.8, BASE_TABLE_RX * 1.05, PLAY_SURFACE_Y - 0.04, 12]} />
        <meshStandardMaterial color="#4a4436" roughness={1} flatShading />
      </mesh>
      {/* Moss ring on the base */}
      <mesh position={[0, PLAY_SURFACE_Y - 0.18, 0]}>
        <cylinderGeometry args={[BASE_TABLE_RX * 0.86, BASE_TABLE_RX * 0.9, 0.16, 12]} />
        <meshStandardMaterial color="#356b2c" roughness={1} transparent opacity={0.85} />
      </mesh>
      {/* Gnarled roots gripping the base */}
      <Instances transforms={roots} geometry={rootGeo} material={rootMat} castShadow />
    </group>
  );
}

function Stump() {
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.4, 0.56, 10]} />
        <meshStandardMaterial color="#4a3320" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.57, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.05, 10]} />
        <meshStandardMaterial color="#356b2c" roughness={1} />
      </mesh>
    </group>
  );
}

export default function JungleArena({ numPlayers, localIndex, quality, tableGroupScale, reducedMotion }: ArenaProps) {
  const tier = quality.tier;
  const seat = getSeatRingRadii(numPlayers);
  const canopy = tier === 'high' ? 20 : tier === 'medium' ? 12 : 6;
  const mid = tier === 'high' ? 22 : tier === 'medium' ? 12 : 6;
  const ferns = tier === 'high' ? 40 : tier === 'medium' ? 20 : 0;

  // Three merged plant geometries (canopy tree, mid tree, fern/bush).
  const canopyGeo = useDisposable(() => buildTree(101, '#3a2a18', ['#2f7a2c', '#1f5c20', '#3f8a34']), []);
  const midGeo = useDisposable(() => buildTree(202, '#43301c', ['#3c8a34', '#4fa040', '#2f7a2c']), []);
  const fernGeo = useDisposable(() => buildTree(303, '#2f5d2a', ['#4fa83f', '#6ec44a', '#3c8a34']), []);

  // River + waterfall plane geometries.
  const riverGeo = useDisposable(() => new THREE.PlaneGeometry(6, 40, 1, 1), []);
  const fallGeo = useDisposable(() => new THREE.PlaneGeometry(4, 6, 1, 1), []);

  return (
    <>
      <fog attach="fog" args={['#173a12', 14, 66]} />

      {/* Warm dappled daylight. */}
      <hemisphereLight args={['#bfe89a', '#1a2c12', 1.0]} />
      <directionalLight
        position={[6, 12, 4]}
        intensity={2.2}
        color="#fff2c4"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 2.2, 2]} intensity={6} color="#eaffd0" distance={9} decay={1.5} />

      <GradientSky
        quality={quality}
        top="#4c8a3a"
        mid="#7bb85a"
        bottom="#233d18"
        cloud
        cloudColor="#e6f7b0"
        cloudScale={1.4}
        cloudStrength={tier === 'high' ? 0.5 : 0.35}
        warp={0.4}
        speed={0.01}
        sunColor="#fff3c0"
        sunDir={[6, 12, 4]}
        sunSize={0.05}
        sunIntensity={0.8}
        reducedMotion={reducedMotion}
      />

      {/* Rolling jungle floor. */}
      <TerrainPlane quality={quality} size={90} height={2.6} freq={0.05} seed={4} colorLow="#243a15" colorHigh="#3f6b26" roughness={1} />

      {/* Flowing river + a small waterfall feeding it. */}
      <ScrollSurface
        geometry={riverGeo}
        colorLow="#0c3a3a" colorMid="#1f6f6a" colorHigh="#6fd6c0"
        scale={2.5} speed={0.25} direction={[0, 1]} emissive={0.9} warp={0.6}
        transparent opacity={0.9}
        rotation={[-Math.PI / 2, 0, 0.35]} position={[10, 0.05, -6]}
        reducedMotion={reducedMotion}
      />
      <ScrollSurface
        geometry={fallGeo}
        colorLow="#2a6f6a" colorMid="#7fd6c8" colorHigh="#e8ffff"
        scale={2} speed={0.7} direction={[0, -1]} emissive={1.1} warp={0.3}
        transparent opacity={0.85}
        rotation={[-0.2, -0.6, 0]} position={[15, 2.4, -12]}
        reducedMotion={reducedMotion}
      />

      {/* Vegetation layers (far → near). */}
      <VegetationLayer geometry={canopyGeo} count={canopy} radiusMin={11} radiusMax={20} scaleMin={4.5} scaleMax={7} seed={21} />
      <VegetationLayer geometry={midGeo} count={mid} radiusMin={7} radiusMax={13} scaleMin={2.5} scaleMax={4} seed={22} />
      {ferns > 0 && <VegetationLayer geometry={fernGeo} count={ferns} radiusMin={4.5} radiusMax={11} scaleMin={0.7} scaleMax={1.4} seed={23} castShadow={false} />}

      {/* Ancient ruins. */}
      <Pillar position={[-6.5, 0, -3]} rotation={0.4} tilt={0.06} />
      <Pillar position={[6, 0, -4.5]} rotation={-0.3} tilt={-0.05} broken />
      <Pillar position={[3.5, 0, 6]} rotation={0.8} tilt={0.04} />
      <Pillar position={[-5, 0, 5.5]} rotation={-0.6} tilt={-0.08} broken />

      {/* Hanging vines. */}
      {tier !== 'low' && <Vines count={tier === 'high' ? 14 : 7} reducedMotion={reducedMotion} />}

      {/* God-ray pollen haze (gated to non-low). */}
      {tier !== 'low' && (
        <DriftField count={tier === 'high' ? 90 : 45} quality={quality} area={[18, 8, 18]} center={[0, 4, 0]} size={0.045} color="#fff4c0" velocity={[0.06, -0.05, 0.02]} sway={0.35} opacity={0.5} reducedMotion={reducedMotion} seed={5} />
      )}
      {/* Fireflies close to the table. */}
      <DriftField count={tier === 'high' ? 40 : tier === 'medium' ? 20 : 6} quality={quality} area={[6, 2.5, 6]} center={[0, 1.4, 0]} size={0.06} color="#c8ff6a" velocity={[0.02, 0.03, 0.02]} sway={0.5} opacity={0.9} reducedMotion={reducedMotion} seed={8} />

      {/* Butterflies. */}
      {tier !== 'low' && <Butterflies count={tier === 'high' ? 6 : 3} reducedMotion={reducedMotion} />}

      <MossyRock tableGroupScale={tableGroupScale} />

      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.15} rZ={seat.rZ + 0.15}>
        {() => <Stump />}
      </SeatRing>
    </>
  );
}
