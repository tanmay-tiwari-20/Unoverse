'use client';

/**
 * VolcanoArena — an obsidian altar ringed by rivers of molten lava.
 *
 * World: a dark smoke/ember sky with domain-warped ash clouds, a massive
 * displaced volcano cone with a glowing crater and lava rivers (scrolling
 * shader), a displaced obsidian terrain with magma crack seams, eroded temple
 * pillars and arches, obsidian spike formations, and a flowing lava moat.
 * Atmosphere: rising embers (glow sprites), falling ash, smoke columns, and
 * (high tier) a subtle heat-haze shimmer.
 *
 * Platform: a glossy obsidian slab with emissive lava-crack edge and a flowing
 * lava moat. Obsidian thrones ring the seats. The bright lava/ember emissives
 * feed the high-tier bloom pass.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  ArenaProps,
  GradientSky,
  DriftField,
  GlowPoints,
  Instances,
  InstanceTransform,
  PlaySurface,
  ScrollSurface,
  TerrainPlane,
  SeatRing,
  GroundFog,
  useDisposable,
  useShaderClock,
  GLSL_NOISE,
  PLAY_SURFACE_Y,
  BASE_TABLE_RX,
  BASE_TABLE_RZ,
} from './shared/ArenaKit';
import { displaceGeometry, buildTempleArch, buildObsidianSpikes, mulberry32 } from './shared/proceduralGeometry';
import { ArenaModel } from './shared/gltf';
import { getSeatRingRadii } from '../../../utils/tableLayout';

// ---------------------------------------------------------------------------
// Lava moat — flowing fbm shader on an annular ring
// ---------------------------------------------------------------------------

function LavaMoat({ reducedMotion }: { reducedMotion?: boolean }) {
  const geo = useDisposable(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 4.4, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 1.6, 1.2, 0, Math.PI * 2, true, 0);
    s.holes.push(hole);
    return new THREE.ShapeGeometry(s, 96);
  }, []);
  const mat = useDisposable(
    () => new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHot: { value: new THREE.Color('#ffd34d') },
        uMid: { value: new THREE.Color('#ff5a1e') },
        uCrust: { value: new THREE.Color('#2a0a05') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vP;
        uniform float uTime; uniform vec3 uHot, uMid, uCrust;
        ${GLSL_NOISE}
        void main(){
          vec3 p = vec3(vP * 0.9, uTime * 0.15);
          float n = fbm(p);
          float cracks = fbm(p * 2.5 + n);
          float heat = smoothstep(0.35, 0.75, cracks);
          vec3 col = mix(uCrust, uMid, heat);
          col = mix(col, uHot, smoothstep(0.6, 0.95, cracks));
          // bright hot-spot glow for bloom
          col += uHot * smoothstep(0.88, 1.0, cracks) * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
    [],
  );
  useShaderClock(mat, reducedMotion);
  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} />;
}

// ---------------------------------------------------------------------------
// Volcano cone — displaced, with lava rivers and glowing crater
// ---------------------------------------------------------------------------

function VolcanoCone({ reducedMotion }: { reducedMotion?: boolean }) {
  const coneGeo = useDisposable(() => {
    const g = new THREE.ConeGeometry(22, 28, 20, 5, true);
    displaceGeometry(g, { amp: 1.8, freq: 0.18, seed: 3, octaves: 4 });
    return g;
  }, []);
  const coneMat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#160a06', roughness: 1, side: THREE.DoubleSide, flatShading: true }), []);

  // Lava river strips down the flanks.
  const riverGeo = useDisposable(() => new THREE.PlaneGeometry(2.2, 14, 1, 1), []);

  return (
    <group position={[-2, 0, -40]}>
      <mesh geometry={coneGeo} material={coneMat} position={[0, 14, 0]} castShadow />

      {/* Lava rivers on the flanks */}
      {[0, 1.2, -1.0].map((a, i) => (
        <ScrollSurface
          key={i}
          geometry={riverGeo}
          colorLow="#2a0a05" colorMid="#ff5a1e" colorHigh="#ffd34d"
          scale={1.8} speed={0.35} direction={[0, -1]} emissive={1.5} warp={0.4}
          rotation={[-0.55, a, 0]} position={[Math.sin(a) * 8, 14, Math.cos(a) * 8 - 4]}
          reducedMotion={reducedMotion}
        />
      ))}

      {/* Glowing crater */}
      <mesh position={[0, 28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7.5, 32]} />
        <meshBasicMaterial color="#ff6a1e" />
      </mesh>
      {/* Crater inner glow */}
      <mesh position={[0, 28.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4, 24]} />
        <meshBasicMaterial color="#ffd34d" />
      </mesh>
      <pointLight position={[0, 30, 0]} color="#ff5a1e" intensity={60} distance={80} decay={1.2} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Eroded temple pillars + arches
// ---------------------------------------------------------------------------

function Pillars({ count }: { count: number }) {
  const geo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(0.5, 0.62, 4, 8, 2);
    displaceGeometry(g, { amp: 0.08, freq: 3, seed: 7, octaves: 2 });
    return g;
  }, []);
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#1a0f0a', roughness: 1, flatShading: true }), []);
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(71);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.3;
      const rad = 6 + r() * 9;
      const h = 0.6 + r() * 0.9;
      out.push({ position: [Math.cos(a) * rad, 2 * h, Math.sin(a) * rad], rotation: [r() * 0.12, r() * Math.PI, r() * 0.12], scale: [1, h, 1] });
    }
    return out;
  }, [count]);
  return <Instances transforms={transforms} geometry={geo} material={mat} castShadow />;
}

/** Obsidian spike formations — sharp glassy faceted shards, instanced. */
function ObsidianSpikes({ count }: { count: number }) {
  const geo = useDisposable(() => buildObsidianSpikes(88, ['#0d0808', '#160e0a', '#1c0f14']), []);
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.6, flatShading: true, emissive: '#2a0a05', emissiveIntensity: 0.12 }), []);
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(88);
    return Array.from({ length: count }, () => {
      const a = r() * Math.PI * 2;
      const rad = 8 + r() * 14;
      return { position: [Math.cos(a) * rad, 0, Math.sin(a) * rad] as [number, number, number], rotation: [0, r() * Math.PI * 2, 0] as [number, number, number], scale: 1.2 + r() * 2.2 };
    });
  }, [count]);
  return <Instances transforms={transforms} geometry={geo} material={mat} castShadow />;
}

/** Eroded temple arches ringing the altar — welded procedural geometry, instanced. */
function TempleArches({ count }: { count: number }) {
  const geo = useDisposable(() => buildTempleArch(94, '#1a0f0a'), []);
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1, flatShading: true }), []);
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(94);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.2;
      const rad = 10 + r() * 5;
      const s = 1.4 + r() * 1.2;
      out.push({ position: [Math.cos(a) * rad, 0, Math.sin(a) * rad], rotation: [0, -a + Math.PI / 2 + (r() - 0.5) * 0.3, 0], scale: s });
    }
    return out;
  }, [count]);
  if (count <= 0) return null;
  return <Instances transforms={transforms} geometry={geo} material={mat} castShadow />;
}

/** A glowing molten-crack network baked into the obsidian ground near the altar. */
function MoltenCracks({ reducedMotion }: { reducedMotion?: boolean }) {
  const geo = useDisposable(() => new THREE.RingGeometry(4.6, 16, 64, 1), []);
  const mat = useDisposable(
    () => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHot: { value: new THREE.Color('#ff6a1e') },
        uGlow: { value: new THREE.Color('#ffd34d') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vP;
        uniform float uTime; uniform vec3 uHot, uGlow;
        ${GLSL_NOISE}
        void main(){
          float n = fbm(vec3(vP * 0.5, uTime * 0.08));
          // Thin bright seams where the noise crosses a threshold — a crack network.
          float seam = smoothstep(0.03, 0.0, abs(n - 0.5));
          float pulse = 0.6 + 0.4 * sin(uTime * 1.5 + n * 10.0);
          vec3 col = mix(uHot, uGlow, seam) * seam * pulse;
          gl_FragColor = vec4(col, seam * 0.8);
        }
      `,
    }),
    [],
  );
  useShaderClock(mat, reducedMotion);
  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} frustumCulled={false} />;
}

function Torch({ position }: { position: [number, number, number] }) {
  const flameMat = useDisposable(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uHot: { value: new THREE.Color('#fff4a0') },
      uMid: { value: new THREE.Color('#ff8a3a') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vPos;
      void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv; varying vec3 vPos;
      uniform float uTime; uniform vec3 uHot, uMid;
      ${GLSL_NOISE}
      void main(){
        // Flame rises upward — sample noise scrolling up
        float n = fbm(vec3(vPos.x*6.0, vPos.y*4.0 - uTime*2.5, vPos.z*6.0));
        // Taper toward tip
        float taper = 1.0 - vUv.y;
        float flame = smoothstep(0.0, 0.6, n * taper);
        vec3 col = mix(uMid, uHot, smoothstep(0.3, 0.8, n));
        float a = flame * (0.5 + 0.5 * n) * smoothstep(1.0, 0.4, vUv.y);
        gl_FragColor = vec4(col, a);
      }
    `,
  }), []);
  useShaderClock(flameMat);
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 1.2, 6]} />
        <meshStandardMaterial color="#241109" roughness={1} />
      </mesh>
      {/* Flame cone */}
      <mesh material={flameMat} position={[0, 1.42, 0]}>
        <coneGeometry args={[0.12, 0.38, 8, 4, true]} />
      </mesh>
      {/* Ember glow disc at base of flame */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.28, 0]}>
        <circleGeometry args={[0.1, 12]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight position={[0, 1.38, 0]} color="#ff8a3a" intensity={8} distance={6} decay={2} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Obsidian altar platform
// ---------------------------------------------------------------------------

function ObsidianAltar({ tableGroupScale }: { tableGroupScale: [number, number, number] }) {
  const surfaceMat = useDisposable(
    () => new THREE.MeshPhysicalMaterial({ color: '#0d0808', roughness: 0.22, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    [],
  );
  const baseGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(BASE_TABLE_RX * 0.75, BASE_TABLE_RX * 1.08, PLAY_SURFACE_Y - 0.04, 8, 2);
    displaceGeometry(g, { amp: 0.05, freq: 4, seed: 11, octaves: 2 });
    return g;
  }, []);

  return (
    <group scale={tableGroupScale}>
      <PlaySurface rX={BASE_TABLE_RX} rZ={BASE_TABLE_RZ} thickness={0.14} surfaceMaterial={surfaceMat} edgeColor="#ff5a1e" edgeIntensity={1.1} />

      {/* Stepped obsidian base */}
      <mesh geometry={baseGeo} position={[0, PLAY_SURFACE_Y / 2 - 0.02, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#0f0908" roughness={0.5} metalness={0.35} flatShading />
      </mesh>

      {/* Glowing lava seam ring at the base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[BASE_TABLE_RX * 1.0, BASE_TABLE_RX * 1.14, 48]} />
        <meshBasicMaterial color="#ff5a1e" transparent opacity={0.65} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Throne() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.6, 0.56]} />
        <meshStandardMaterial color="#0f0908" roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.78, -0.22]} castShadow>
        <boxGeometry args={[0.52, 0.6, 0.08]} />
        <meshStandardMaterial color="#140b09" roughness={0.4} metalness={0.35} />
      </mesh>
      {/* Lava-crack emissive trim */}
      <mesh position={[0, 0.62, 0.29]}>
        <planeGeometry args={[0.45, 0.03]} />
        <meshBasicMaterial color="#ff5a1e" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Smoke column — a slow rising additive cylinder
// ---------------------------------------------------------------------------

function SmokeColumn({ position, reducedMotion }: { position: [number, number, number]; reducedMotion?: boolean }) {
  const mat = useDisposable(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#3a2a24') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime; uniform vec3 uColor;
      ${GLSL_NOISE}
      void main(){
        float n = fbm(vec3(vUv.x*3.0, vUv.y*2.0 - uTime*0.4, 0.0));
        float a = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.5, vUv.y) * (0.3 + 0.4*n);
        gl_FragColor = vec4(uColor, a);
      }
    `,
  }), []);
  useShaderClock(mat, reducedMotion);
  return (
    <mesh material={mat} position={position}>
      <cylinderGeometry args={[1.2, 0.4, 10, 12, 1, true]} />
    </mesh>
  );
}

export default function VolcanoArena({ numPlayers, localIndex, quality, tableGroupScale, reducedMotion }: ArenaProps) {
  const tier = quality.tier;
  const seat = getSeatRingRadii(numPlayers);
  const pillars = tier === 'high' ? 14 : tier === 'medium' ? 8 : 4;
  const spikes = tier === 'high' ? 18 : tier === 'medium' ? 10 : 5;
  const arches = tier === 'high' ? 6 : tier === 'medium' ? 3 : 0;
  // Hero temple fallback geometry (an eroded arch), built once.
  const heroArchGeo = useDisposable(() => buildTempleArch(96, '#1a0f0a'), []);

  return (
    <>
      <fog attach="fog" args={['#1a0805', 12, 68]} />

      <hemisphereLight args={['#5a1a0a', '#0a0403', 0.7]} />
      <directionalLight
        position={[-4, 8, -6]}
        intensity={0.7}
        color="#ff8a5a"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 0.6, 0]} intensity={10} color="#ff5a1e" distance={7} decay={2} />
      <pointLight position={[0, 2.4, 3]} intensity={7} color="#ffd0a0" distance={9} decay={1.6} />

      <GradientSky
        quality={quality}
        top="#3a0f08"
        mid="#601c0c"
        bottom="#0c0402"
        cloud
        cloudColor="#1a0e0a"
        cloudScale={1.1}
        cloudStrength={tier === 'high' ? 0.8 : 0.6}
        warp={0.5}
        speed={0.008}
        sunColor="#ff6a1e"
        sunDir={[-2, 28, -40]}
        sunSize={0.06}
        sunIntensity={0.9}
        reducedMotion={reducedMotion}
      />

      {/* Displaced obsidian terrain. */}
      <TerrainPlane quality={quality} size={90} height={2.4} freq={0.055} seed={6} colorLow="#0a0605" colorHigh="#1a0f0a" roughness={0.6} metalness={0.2} />

      <VolcanoCone reducedMotion={reducedMotion} />
      <Pillars count={pillars} />
      <ObsidianSpikes count={spikes} />
      <TempleArches count={arches} />

      {/* Hero temple structure: optimized GLTF when present, else procedural arch. */}
      <ArenaModel
        model="volcanoTemple"
        enabled={tier !== 'low'}
        position={[-12, 0, -10]}
        rotation={[0, 0.7, 0]}
        scale={3}
        castShadow
        fallback={
          <mesh geometry={heroArchGeo}>
            <meshStandardMaterial vertexColors roughness={0.9} metalness={0.1} flatShading />
          </mesh>
        }
      />
      {tier !== 'low' && <MoltenCracks reducedMotion={reducedMotion} />}

      <Torch position={[-3.4, 0, 1.6]} />
      <Torch position={[3.4, 0, 1.6]} />
      <Torch position={[0, 0, -3.6]} />

      {/* Smoke columns (gated to non-low). */}
      {tier !== 'low' && (
        <>
          <SmokeColumn position={[-2, 14, -40]} reducedMotion={reducedMotion} />
          <SmokeColumn position={[3, 8, -22]} reducedMotion={reducedMotion} />
        </>
      )}

      <LavaMoat reducedMotion={reducedMotion} />

      {/* Rising embers — soft glow sprites. */}
      <GlowPoints count={tier === 'high' ? 80 : tier === 'medium' ? 40 : 14} quality={quality} radiusMin={2} radiusMax={12} size={0.35} color="#ff8a3a" color2="#ffd34d" opacity={0.9} reducedMotion={reducedMotion} seed={2} />
      {/* Falling ash. */}
      {tier !== 'low' && (
        <DriftField count={tier === 'high' ? 80 : 40} quality={quality} area={[26, 16, 26]} center={[0, 8, 0]} size={0.05} color="#3a2a24" velocity={[0.1, -0.35, 0.05]} sway={0.3} glow={false} opacity={0.5} reducedMotion={reducedMotion} seed={10} />
      )}
      {/* Drifting embers close to the table. */}
      <DriftField count={tier === 'high' ? 60 : tier === 'medium' ? 30 : 10} quality={quality} area={[10, 6, 10]} center={[0, 2, 0]} size={0.06} color="#ff8a3a" velocity={[0.05, 0.5, 0.02]} sway={0.35} opacity={0.9} reducedMotion={reducedMotion} seed={2} />
      {/* Hot, smoky ground haze for depth (non-low). */}
      {tier !== 'low' && <GroundFog color="#5a1a0a" radius={28} y={0.6} opacity={0.24} scale={1.6} speed={0.016} reducedMotion={reducedMotion} />}

      <ObsidianAltar tableGroupScale={tableGroupScale} />

      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.15} rZ={seat.rZ + 0.15}>
        {() => <Throne />}
      </SeatRing>
    </>
  );
}
