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
  GroundFog,
  VolumetricLight,
  useGlowTexture,
  useDisposable,
  PLAY_SURFACE_Y,
  BASE_TABLE_RX,
  BASE_TABLE_RZ,
} from './shared/ArenaKit';
import { buildTree, buildRockCluster, buildFernFrond, buildRootButtress, mulberry32 } from './shared/proceduralGeometry';
import { ArenaModel } from './shared/gltf';
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

/** Hanging vine: a thin drooping strip with leaf clusters and a subtle sway. */
function Vines({ count, reducedMotion }: { count: number; reducedMotion?: boolean }) {
  const stemGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(0.025, 0.012, 3.4, 5, 4);
    // Slight taper curve — displace only the upper half
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, y / 1.7);
      pos.setX(i, pos.getX(i) + Math.sin(i * 1.3) * 0.015 * t);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);
  // Small leaf: a rounded diamond shape
  const leafGeo = useDisposable(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.06); shape.quadraticCurveTo(0.04, 0.03, 0, -0.06);
    shape.quadraticCurveTo(-0.04, 0.03, 0, 0.06);
    return new THREE.ShapeGeometry(shape, 4);
  }, []);
  const stemMat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#2f5d2a', roughness: 1 }), []);
  const leafMat = useDisposable(() => new THREE.MeshBasicMaterial({ color: '#4a8a3a', side: THREE.DoubleSide, transparent: true, opacity: 0.88 }), []);
  const group = useRef<THREE.Group>(null);
  const vines = useMemo(() => {
    const r = mulberry32(31);
    return Array.from({ length: count }, () => {
      const a = r() * Math.PI * 2;
      const rad = 6 + r() * 8;
      const leafCount = 3 + Math.floor(r() * 4);
      const leaves = Array.from({ length: leafCount }, () => ({
        y: -0.4 - r() * 2.4,
        angle: r() * Math.PI * 2,
        scale: 0.7 + r() * 0.6,
      }));
      return { pos: [Math.cos(a) * rad, 5 + r() * 2, Math.sin(a) * rad] as [number, number, number], phase: r() * Math.PI * 2, tilt: (r() - 0.5) * 0.3, leaves };
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
        <group key={i} position={v.pos} rotation={[0, 0, v.tilt]}>
          <mesh geometry={stemGeo} material={stemMat} />
          {v.leaves.map((l, j) => (
            <mesh key={j} geometry={leafGeo} material={leafMat}
              position={[0, l.y, 0]}
              rotation={[0, l.angle, Math.PI / 4]}
              scale={[l.scale, l.scale, 1]}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * A single butterfly on a lazy looping path. The visual is an optional GLTF
 * (`jungleButterfly`) that gracefully falls back to procedural flapping wings —
 * two shaped lobes that fold with a wingbeat. The animated path/orientation is
 * applied to the outer group either way; the wing flap only runs on the
 * procedural fallback (its meshes are ref'd directly, so when a GLTF replaces
 * them the flap safely no-ops). Kept to a handful of instances, so per-instance
 * GLTF/geometry stays cheap.
 */
function Butterfly({
  wingGeo,
  wingMat,
  fly,
  enabled,
  reducedMotion,
}: {
  wingGeo: THREE.BufferGeometry;
  wingMat: THREE.Material;
  fly: { radius: number; y: number; speed: number; phase: number; wingScale: number };
  enabled: boolean;
  reducedMotion?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const rWing = useRef<THREE.Mesh>(null);
  const lWing = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    const a = t * fly.speed + fly.phase;
    g.position.set(Math.cos(a) * fly.radius, fly.y + Math.sin(a * 2) * 0.3, Math.sin(a) * fly.radius);
    g.rotation.y = -a + Math.PI / 2;
    const flap = Math.abs(Math.sin(t * 12 + fly.phase)) * 1.1;
    if (rWing.current) rWing.current.rotation.y = flap;
    if (lWing.current) lWing.current.rotation.y = -flap;
  });
  return (
    <group ref={group}>
      <ArenaModel
        model="jungleButterfly"
        enabled={enabled}
        scale={fly.wingScale}
        fallback={
          <>
            <mesh ref={rWing} geometry={wingGeo} material={wingMat} position={[0.07, 0, 0]} scale={[fly.wingScale, fly.wingScale, 1]} />
            <mesh ref={lWing} geometry={wingGeo} material={wingMat} position={[-0.07, 0, 0]} scale={[-fly.wingScale, fly.wingScale, 1]} />
          </>
        }
      />
    </group>
  );
}

/** Butterflies: a few GLTF-or-procedural butterflies on looping clearing paths. */
function Butterflies({ count, enabled, reducedMotion }: { count: number; enabled: boolean; reducedMotion?: boolean }) {
  // Wing shape: two lobes forming a realistic butterfly wing silhouette.
  const geo = useDisposable(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.04, 0.06, 0.12, 0.07, 0.13, 0.02);
    shape.bezierCurveTo(0.14, -0.02, 0.1, -0.06, 0.06, -0.05);
    shape.bezierCurveTo(0.03, -0.04, 0.01, -0.02, 0, 0);
    return new THREE.ShapeGeometry(shape, 6);
  }, []);
  const mats = useDisposable(() => [
    new THREE.MeshBasicMaterial({ color: '#ff9a4d', side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    new THREE.MeshBasicMaterial({ color: '#67d6ff', side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    new THREE.MeshBasicMaterial({ color: '#ffe066', side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
  ], []);
  const flies = useMemo(() => {
    const r = mulberry32(41);
    return Array.from({ length: count }, () => ({
      radius: 2 + r() * 4,
      y: 1.2 + r() * 1.6,
      speed: 0.4 + r() * 0.5,
      phase: r() * Math.PI * 2,
      mat: Math.floor(r() * 3),
      wingScale: 0.9 + r() * 0.3,
    }));
  }, [count]);
  return (
    <>
      {flies.map((f, i) => (
        <Butterfly key={i} wingGeo={geo} wingMat={mats[f.mat]} fly={f} enabled={enabled} reducedMotion={reducedMotion} />
      ))}
    </>
  );
}

/**
 * A single "hero" firefly on a slow wandering path: an optional GLTF
 * (`jungleFirefly`) with a glowing soft-sprite fallback and a warm point light,
 * so a few close fireflies read as real 3D glow bugs above the ambient sprite
 * swarm. Its brightness pulses gently. Only a handful are placed (each is a
 * light + optional model), so cost stays bounded.
 */
function HeroFirefly({
  spriteTex,
  fly,
  enabled,
  reducedMotion,
}: {
  spriteTex: THREE.Texture;
  fly: { radius: number; y: number; speed: number; phase: number; scale: number };
  enabled: boolean;
  reducedMotion?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const spriteMat = useDisposable(
    () => new THREE.SpriteMaterial({ map: spriteTex, color: '#c8ff6a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    [spriteTex],
  );
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    if (!reducedMotion) {
      const a = t * fly.speed + fly.phase;
      g.position.set(
        Math.cos(a) * fly.radius + Math.sin(t * 0.7 + fly.phase) * 0.4,
        fly.y + Math.sin(a * 1.7) * 0.4,
        Math.sin(a) * fly.radius + Math.cos(t * 0.6 + fly.phase) * 0.4,
      );
    }
    const pulse = 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * 3 + fly.phase), 2);
    if (light.current) light.current.intensity = 1.2 * pulse;
    // Pulse the glow via the mounted sprite's material (ref, not the hook binding).
    const m = spriteRef.current?.material as THREE.SpriteMaterial | undefined;
    if (m) m.opacity = 0.5 + 0.5 * pulse;
  });
  return (
    <group ref={group}>
      <pointLight ref={light} color="#c8ff6a" intensity={1.2} distance={2.2} decay={2} />
      <ArenaModel
        model="jungleFirefly"
        enabled={enabled}
        scale={fly.scale}
        fallback={<sprite ref={spriteRef} material={spriteMat} scale={[0.22 * fly.scale, 0.22 * fly.scale, 1]} />}
      />
    </group>
  );
}

function HeroFireflies({ count, enabled, reducedMotion }: { count: number; enabled: boolean; reducedMotion?: boolean }) {
  const tex = useGlowTexture();
  const flies = useMemo(() => {
    const r = mulberry32(88);
    return Array.from({ length: count }, () => ({
      radius: 1.6 + r() * 2.8,
      y: 1.1 + r() * 1.2,
      speed: 0.25 + r() * 0.35,
      phase: r() * Math.PI * 2,
      scale: 0.8 + r() * 0.6,
    }));
  }, [count]);
  return (
    <>
      {flies.map((f, i) => (
        <HeroFirefly key={i} spriteTex={tex} fly={f} enabled={enabled} reducedMotion={reducedMotion} />
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
      {/* Carved log seat — tapered trunk with flat top. Sized so the usable seat
          surface (mossy cushion top) lands at ≈0.42 to match the shared seated
          HIP_Y=0.44, matching the Space chair convention — the character rests on
          the cushion instead of sinking into it. */}
      <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.42, 0.38, 12]} />
        <meshStandardMaterial color="#4a3320" roughness={1} flatShading />
      </mesh>
      {/* Bark ridges */}
      {[0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.8].map((a, i) => (
        <mesh key={`bark${i}`} position={[Math.sin(a) * 0.37, 0.19, Math.cos(a) * 0.37]} rotation={[0, -a, 0]} castShadow>
          <boxGeometry args={[0.06, 0.34, 0.03]} />
          <meshStandardMaterial color="#3a2716" roughness={1} flatShading />
        </mesh>
      ))}
      {/* Mossy cushion top — usable seat surface (top ≈0.42). */}
      <mesh position={[0, 0.39, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.35, 0.06, 12]} />
        <meshStandardMaterial color="#356b2c" roughness={1} />
      </mesh>
      {/* Gnarled roots splaying at the base */}
      {[0.5, 1.7, 2.9, 4.1, 5.3].map((a, i) => (
        <mesh key={`root${i}`} position={[Math.sin(a) * 0.34, 0.06, Math.cos(a) * 0.34]} rotation={[Math.PI / 2.3, 0, -a]} castShadow>
          <capsuleGeometry args={[0.05, 0.22, 4, 8]} />
          <meshStandardMaterial color="#3a2716" roughness={1} flatShading />
        </mesh>
      ))}
      {/* A vine curling up the back of the stump */}
      <mesh position={[0, 0.22, -0.36]} rotation={[0.2, 0, 0.3]} castShadow>
        <capsuleGeometry args={[0.022, 0.4, 4, 8]} />
        <meshStandardMaterial color="#2f5e28" roughness={0.9} />
      </mesh>
      {[0.18, 0.34].map((y, i) => (
        <mesh key={`leaf${i}`} position={[0.06 * (i ? 1 : -1), 0.18 + y, -0.34]} rotation={[0, i ? 0.6 : -0.6, 0]}>
          <planeGeometry args={[0.14, 0.09]} />
          <meshStandardMaterial color="#49a04a" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
//  World / Table memo split (perf) — see ClassicArena for the rationale. The
//  heavy vegetation/particle world never reconciles on a player-count change;
//  only the mossy-rock table + stump seat ring do.
// ---------------------------------------------------------------------------

const JungleWorld = React.memo(function JungleWorld({
  quality,
  reducedMotion,
}: {
  quality: ArenaProps['quality'];
  reducedMotion?: boolean;
}) {
  const tier = quality.tier;
  const canopy = tier === 'high' ? 20 : tier === 'medium' ? 12 : 6;
  const mid = tier === 'high' ? 22 : tier === 'medium' ? 12 : 6;
  const ferns = tier === 'high' ? 40 : tier === 'medium' ? 20 : 0;

  const buttresses = tier === 'high' ? 7 : tier === 'medium' ? 4 : 0;

  // Merged plant geometries (canopy tree, mid tree, bush, fern frond understory).
  const canopyGeo = useDisposable(() => buildTree(101, '#3a2a18', ['#2f7a2c', '#1f5c20', '#3f8a34']), []);
  const midGeo = useDisposable(() => buildTree(202, '#43301c', ['#3c8a34', '#4fa040', '#2f7a2c']), []);
  const fernGeo = useDisposable(() => buildTree(303, '#2f5d2a', ['#4fa83f', '#6ec44a', '#3c8a34']), []);
  const frondGeo = useDisposable(() => buildFernFrond(404, ['#3c8a34', '#4fa83f', '#2f7a2c']), []);
  const buttressGeo = useDisposable(() => buildRootButtress(505, '#43301c'), []);

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
      {/* Dense fern-frond ground cover + flared root buttresses (non-low). */}
      {ferns > 0 && <VegetationLayer geometry={frondGeo} count={ferns} radiusMin={4} radiusMax={12} scaleMin={0.8} scaleMax={1.8} seed={26} castShadow={false} />}
      {buttresses > 0 && <VegetationLayer geometry={buttressGeo} count={buttresses} radiusMin={9} radiusMax={17} scaleMin={1.6} scaleMax={3} seed={27} />}

      {/* Hero canopy tree: optimized GLTF when present, else procedural. */}
      <ArenaModel
        model="jungleTree"
        enabled={tier !== 'low'}
        position={[-13, 0, -12]}
        rotation={[0, 0.6, 0]}
        scale={6.5}
        castShadow
        fallback={<mesh geometry={canopyGeo}><meshStandardMaterial vertexColors roughness={1} /></mesh>}
      />

      {/* Atmospheric ground mist + shafts of sunlight (high/medium). */}
      {tier !== 'low' && <GroundFog color="#9ad46a" radius={34} y={0.7} opacity={0.2} scale={1.6} speed={0.015} reducedMotion={reducedMotion} />}
      {tier === 'high' && (
        <>
          <VolumetricLight position={[7, 8, 4]} rotation={[0, 0, -0.25]} color="#fff2c0" height={13} topRadius={0.6} bottomRadius={4} opacity={0.1} layers={3} />
          <VolumetricLight position={[-8, 8, -3]} rotation={[0.1, 0, 0.2]} color="#eaffc0" height={13} topRadius={0.5} bottomRadius={3.5} opacity={0.08} layers={2} />
        </>
      )}

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
      {/* Ambient firefly swarm (cheap soft sprites) close to the table. */}
      <DriftField count={tier === 'high' ? 40 : tier === 'medium' ? 20 : 6} quality={quality} area={[6, 2.5, 6]} center={[0, 1.4, 0]} size={0.09} color="#c8ff6a" velocity={[0.02, 0.03, 0.02]} sway={0.5} opacity={0.9} softSprites reducedMotion={reducedMotion} seed={8} />
      {/* A few hero fireflies (GLTF-or-glow with their own light) on top (non-low). */}
      {tier !== 'low' && <HeroFireflies count={tier === 'high' ? 6 : 3} enabled reducedMotion={reducedMotion} />}

      {/* Butterflies (GLTF-or-procedural wings). */}
      {tier !== 'low' && <Butterflies count={tier === 'high' ? 6 : 3} enabled reducedMotion={reducedMotion} />}
    </>
  );
});

const JungleTable = React.memo(function JungleTable({
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
      <MossyRock tableGroupScale={tableGroupScale} />

      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.15} rZ={seat.rZ + 0.15}>
        {() => <Stump />}
      </SeatRing>
    </>
  );
});

export default function JungleArena({ numPlayers, localIndex, quality, tableGroupScale, reducedMotion }: ArenaProps) {
  return (
    <>
      <JungleWorld quality={quality} reducedMotion={reducedMotion} />
      <JungleTable numPlayers={numPlayers} localIndex={localIndex} tableGroupScale={tableGroupScale} />
    </>
  );
}
