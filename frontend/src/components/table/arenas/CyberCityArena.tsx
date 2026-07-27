'use client';

/**
 * CyberCityArena — a floating holo-platform above a rain-soaked neon megacity.
 *
 * World: a deep magenta/purple domain-warped sky, instanced skyscrapers with
 * procedurally-lit window grids (emissive canvas texture) and neon roof trims,
 * animated holographic billboards (scrolling shader), flying vehicles and drones
 * that leave neon trails, a passing hover-train, streaking rain, a reflective wet
 * deck and low neon ground mist.
 *
 * Platform: a floating holographic slab whose surface runs an animated neon
 * circuit shader, glowing underside and hover beams — no legs. Hover-seats ring
 * it. Quality-tier gates the sky/billboard shaders, tower/drone counts, particles
 * and shadows. The neon emissives feed the high-tier bloom pass.
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
  SeatRing,
  useDisposable,
  useShaderClock,
  PLAY_SURFACE_Y,
  BASE_TABLE_RX,
  BASE_TABLE_RZ,
} from './shared/ArenaKit';
import { mulberry32 } from './shared/proceduralGeometry';
import { getSeatRingRadii } from '../../../utils/tableLayout';

const PALETTE = ['#ff4fd8', '#4ff0ff', '#a24bff', '#ff7a2f', '#5affc0'];

// ---------------------------------------------------------------------------
// Window texture — a lit-window grid baked once into a canvas texture
// ---------------------------------------------------------------------------

function useWindowTexture(): THREE.Texture {
  return useDisposable(() => {
    const w = 64, h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#05030f';
    ctx.fillRect(0, 0, w, h);
    let s = 1234567;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const cols = 6, rows = 20;
    const cw = w / cols, ch = h / rows;
    const lit = ['#4ff0ff', '#ff4fd8', '#ffd36a', '#a24bff', '#ffffff'];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (rand() > 0.42) {
          ctx.fillStyle = lit[Math.floor(rand() * lit.length)];
          ctx.globalAlpha = 0.5 + rand() * 0.5;
          ctx.fillRect(x * cw + cw * 0.2, y * ch + ch * 0.2, cw * 0.6, ch * 0.55);
        }
      }
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function Skyscrapers({ count }: { count: number }) {
  const winTex = useWindowTexture();
  const geo = useDisposable(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useDisposable(
    () => new THREE.MeshStandardMaterial({
      color: '#0a0a16',
      roughness: 0.5,
      metalness: 0.6,
      emissive: '#ffffff',
      emissiveMap: winTex,
      emissiveIntensity: 0.9,
    }),
    [winTex],
  );
  const neonGeo = useDisposable(() => new THREE.BoxGeometry(1, 1, 1), []);
  const neonMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );

  const { towers, trims } = useMemo(() => {
    const r = mulberry32(51);
    const towers: InstanceTransform[] = [];
    const trims: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.2;
      const rad = 15 + r() * 30;
      const w = 1.6 + r() * 3.4;
      const hh = 8 + r() * 34;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      towers.push({ position: [x, hh / 2, z], scale: [w, hh, w] });
      const c = PALETTE[Math.floor(r() * PALETTE.length)];
      trims.push({ position: [x, hh * (0.55 + r() * 0.35), z], scale: [w * 1.03, 0.4 + r(), w * 1.03], color: c });
    }
    return { towers, trims };
  }, [count]);

  return (
    <>
      <Instances transforms={towers} geometry={geo} material={mat} />
      <Instances transforms={trims} geometry={neonGeo} material={neonMat} />
    </>
  );
}

/** Animated holographic billboards on nearby faces. */
function Billboards({ reducedMotion }: { reducedMotion?: boolean }) {
  const geo = useDisposable(() => new THREE.PlaneGeometry(3.2, 4.4), []);
  const specs = useMemo(() => [
    { pos: [-11, 8, -9] as [number, number, number], rot: [0, 0.7, 0] as [number, number, number], cols: ['#22004a', '#ff2fb0', '#ff9ae0'] as [string, string, string] },
    { pos: [12, 10, -7] as [number, number, number], rot: [0, -0.8, 0] as [number, number, number], cols: ['#001a2a', '#1fd0ff', '#a0f0ff'] as [string, string, string] },
    { pos: [4, 12, -14] as [number, number, number], rot: [0, 0.2, 0] as [number, number, number], cols: ['#2a1400', '#ff8a2f', '#ffd36a'] as [string, string, string] },
  ], []);
  return (
    <>
      {specs.map((s, i) => (
        <ScrollSurface
          key={i}
          geometry={geo}
          colorLow={s.cols[0]} colorMid={s.cols[1]} colorHigh={s.cols[2]}
          scale={2} speed={0.3} direction={[0, 1]} emissive={1.3} warp={0.7}
          position={s.pos} rotation={s.rot}
          reducedMotion={reducedMotion}
        />
      ))}
    </>
  );
}

/** Drones + flying vehicles: emissive bodies with point lights on orbits. */
function FlyingTraffic({ count, reducedMotion }: { count: number; reducedMotion?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const specs = useMemo(() => {
    const r = mulberry32(61);
    return Array.from({ length: count }, () => ({
      rad: 5 + r() * 12,
      y: 3 + r() * 8,
      speed: (r() > 0.5 ? 1 : -1) * (0.12 + r() * 0.28),
      phase: r() * Math.PI * 2,
      color: PALETTE[Math.floor(r() * PALETTE.length)],
      vehicle: r() > 0.5,
    }));
  }, [count]);

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const s = specs[i];
      if (!s) return;
      const a = s.phase + t * s.speed;
      child.position.set(Math.cos(a) * s.rad, s.y + Math.sin(t + s.phase) * 0.3, Math.sin(a) * s.rad);
      child.rotation.y = -a;
    });
  });

  return (
    <group ref={group}>
      {specs.map((s, i) => (
        <group key={i}>
          <mesh>
            {s.vehicle
              ? <boxGeometry args={[0.5, 0.12, 0.2]} />
              : <boxGeometry args={[0.24, 0.08, 0.24]} />}
            <meshStandardMaterial color="#111" emissive={s.color} emissiveIntensity={1.2} />
          </mesh>
          {/* neon trail */}
          <mesh position={[s.vehicle ? -0.6 : 0, 0, 0]}>
            <boxGeometry args={[s.vehicle ? 1.0 : 0.05, 0.03, 0.05]} />
            <meshBasicMaterial color={s.color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <pointLight color={s.color} intensity={2} distance={4} decay={2} />
        </group>
      ))}
    </group>
  );
}

/** A hover-train that slides past on a long straight maglev line. */
function HoverTrain({ reducedMotion }: { reducedMotion?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const carGeo = useDisposable(() => new THREE.BoxGeometry(1.4, 0.5, 0.5), []);
  const bodyMat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#12122a', roughness: 0.3, metalness: 0.8, emissive: '#1a3a6a', emissiveIntensity: 0.5 }), []);
  const winMat = useDisposable(() => new THREE.MeshBasicMaterial({ color: '#8fe6ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  useFrame(({ clock }) => {
    if (reducedMotion || !ref.current) return;
    const t = (clock.elapsedTime * 6) % 90;
    ref.current.position.x = -45 + t;
  });
  return (
    <group ref={ref} position={[0, 14, -22]} rotation={[0, 0, 0]}>
      {[0, 1.6, 3.2, 4.8].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh geometry={carGeo} material={bodyMat} />
          <mesh geometry={carGeo} material={winMat} scale={[0.95, 0.4, 1.02]} position={[0, 0.05, 0]} />
        </group>
      ))}
    </group>
  );
}

function HoloPlatform({ tableGroupScale, reducedMotion }: { tableGroupScale: [number, number, number]; reducedMotion?: boolean }) {
  const surfaceMat = useDisposable(
    () => new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color('#4ff0ff') },
        uColorB: { value: new THREE.Color('#ff4fd8') },
        uBase: { value: new THREE.Color('#0a0620') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vP;
        uniform float uTime; uniform vec3 uColorA, uColorB, uBase;
        void main(){
          vec2 g = vP * 6.0;
          vec2 f = abs(fract(g) - 0.5);
          float line = smoothstep(0.46, 0.5, max(f.x, f.y));
          float pulse = 0.5 + 0.5 * sin(uTime * 2.0 + (vP.x + vP.y) * 4.0);
          vec3 neon = mix(uColorA, uColorB, pulse);
          vec3 col = mix(uBase, neon, line * (0.5 + 0.5 * pulse));
          float node = smoothstep(0.12, 0.0, length(f));
          col += neon * node * pulse;
          // data pulse sweeping outward
          float ring = smoothstep(0.03, 0.0, abs(length(vP) - fract(uTime * 0.3)));
          col += uColorA * ring * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
    [],
  );
  useShaderClock(surfaceMat, reducedMotion);

  return (
    <group scale={tableGroupScale}>
      <PlaySurface rX={BASE_TABLE_RX} rZ={BASE_TABLE_RZ} thickness={0.08} surfaceMaterial={surfaceMat} edgeColor="#4ff0ff" edgeIntensity={1.6} receiveShadow={false} />
      {/* Glowing underside of the floating slab */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, PLAY_SURFACE_Y - 0.12, 0]}>
        <ringGeometry args={[BASE_TABLE_RX * 0.3, BASE_TABLE_RX, 48]} />
        <meshBasicMaterial color="#ff4fd8" transparent opacity={0.4} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Hover height marker beam */}
      <mesh position={[0, (PLAY_SURFACE_Y - 0.16) / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, PLAY_SURFACE_Y - 0.16, 8]} />
        <meshBasicMaterial color="#4ff0ff" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function HoverChair() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
        <meshStandardMaterial color="#12101f" roughness={0.4} metalness={0.7} emissive="#3a1a5a" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.8, -0.2]} castShadow>
        <boxGeometry args={[0.48, 0.5, 0.06]} />
        <meshStandardMaterial color="#16132a" roughness={0.4} metalness={0.7} emissive="#1a3a5a" emissiveIntensity={0.5} />
      </mesh>
      {/* hover glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.36, 0]}>
        <ringGeometry args={[0.22, 0.3, 24]} />
        <meshBasicMaterial color="#4ff0ff" transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Wet reflective deck disc beneath the platform (neon-tinted). */
function WetDeck() {
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#0a0818', roughness: 0.25, metalness: 0.9, emissive: '#160a2a', emissiveIntensity: 0.4 }), []);
  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
      <circleGeometry args={[13, 64]} />
    </mesh>
  );
}

export default function CyberCityArena({ numPlayers, localIndex, quality, tableGroupScale, reducedMotion }: ArenaProps) {
  const tier = quality.tier;
  const seat = getSeatRingRadii(numPlayers);
  const towers = tier === 'high' ? 50 : tier === 'medium' ? 30 : 14;
  const traffic = tier === 'high' ? 10 : tier === 'medium' ? 5 : 0;

  return (
    <>
      <fog attach="fog" args={['#0a0518', 16, 78]} />

      <hemisphereLight args={['#3a1a5a', '#05010f', 0.8]} />
      <directionalLight
        position={[3, 9, -4]}
        intensity={0.8}
        color="#b58fff"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 1.4, 0]} intensity={7} color="#4ff0ff" distance={7} decay={2} />
      <pointLight position={[2, 2, 2]} intensity={6} color="#ff4fd8" distance={9} decay={2} />
      <pointLight position={[-2, 2.4, 2.5]} intensity={6} color="#ffffff" distance={9} decay={1.6} />

      <GradientSky
        quality={quality}
        top="#26083f"
        mid="#48105c"
        bottom="#05010f"
        cloud
        cloudColor="#ff3fb0"
        cloudScale={1.3}
        cloudStrength={tier === 'high' ? 0.55 : 0.38}
        warp={0.55}
        speed={0.012}
        reducedMotion={reducedMotion}
      />

      <WetDeck />
      <Skyscrapers count={towers} />
      {tier !== 'low' && <Billboards reducedMotion={reducedMotion} />}
      {tier !== 'low' && <HoverTrain reducedMotion={reducedMotion} />}
      {traffic > 0 && <FlyingTraffic count={traffic} reducedMotion={reducedMotion} />}

      {/* Rain + low neon ground mist. */}
      <DriftField count={tier === 'high' ? 180 : tier === 'medium' ? 90 : 30} quality={quality} area={[22, 14, 22]} center={[0, 6, 0]} size={0.03} color="#8fd6ff" velocity={[0.15, -1.5, 0]} sway={0.05} glow={false} opacity={0.5} reducedMotion={reducedMotion} seed={4} />
      {tier !== 'low' && (
        <DriftField count={tier === 'high' ? 50 : 24} quality={quality} area={[20, 2, 20]} center={[0, 0.6, 0]} size={0.14} color="#ff4fd8" velocity={[0.06, 0.0, 0.04]} sway={0.2} opacity={0.18} reducedMotion={reducedMotion} seed={13} />
      )}

      <HoloPlatform tableGroupScale={tableGroupScale} reducedMotion={reducedMotion} />

      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.15} rZ={seat.rZ + 0.15}>
        {() => <HoverChair />}
      </SeatRing>
    </>
  );
}
