'use client';

/**
 * SpaceStationArena — a metallic command deck adrift in deep space.
 *
 * World: a domain-warped nebula skydome with an in-shader twinkling star layer
 * and a distant sun; soft glow-sprite starfields at two depths; cratered planets
 * and moons (fBm-displaced spheres); a drifting belt of eroded asteroids
 * (instanced, single draw call); orbiting satellites, a distant space station,
 * and streaking comets.
 *
 * Platform: a circular metallic command table with a glowing energy edge, an
 * animated holographic core projection, inset accent rings and a pedestal with
 * under-glow, ringed by astronaut console pods.
 *
 * Everything scales off the quality tier: the nebula/star shader and dust are
 * gated to high/medium (flat gradient at low), star/asteroid counts fall with the
 * particle budget, and only the key light casts shadows. The bright emissive
 * elements (energy edge, holo core, sun, comet trails) are what the high-tier
 * bloom pass picks up.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ArenaProps,
  GradientSky,
  GlowPoints,
  DriftField,
  Instances,
  InstanceTransform,
  PlaySurface,
  SeatRing,
  useDisposable,
  useShaderClock,
  GLSL_NOISE,
  PLAY_SURFACE_Y,
  BASE_TABLE_RX,
  BASE_TABLE_RZ,
} from './shared/ArenaKit';
import { displaceGeometry, mulberry32 } from './shared/proceduralGeometry';
import { getSeatRingRadii } from '../../../utils/tableLayout';

const ACCENT = '#5fd0ff';

// ---------------------------------------------------------------------------
// Celestial bodies
// ---------------------------------------------------------------------------

/** A cratered, softly-lit planet or moon (fBm-displaced sphere, baked once). */
function Planet({
  position,
  radius,
  color,
  emissive = '#000000',
  emissiveIntensity = 0.15,
  ring,
  seed = 1,
  spin = 0.02,
  reducedMotion,
}: {
  position: [number, number, number];
  radius: number;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  ring?: string;
  seed?: number;
  spin?: number;
  reducedMotion?: boolean;
}) {
  const geo = useDisposable(() => {
    const g = new THREE.SphereGeometry(radius, 40, 30);
    displaceGeometry(g, { amp: radius * 0.05, freq: 0.8, seed, octaves: 4 });
    return g;
  }, [radius, seed]);
  const mat = useDisposable(
    () => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.9, metalness: 0.1, flatShading: true }),
    [color, emissive, emissiveIntensity],
  );
  const ringGeo = useDisposable(() => (ring ? new THREE.RingGeometry(radius * 1.35, radius * 2.1, 64) : new THREE.BufferGeometry()), [ring, radius]);
  const ringMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ color: ring ?? '#ffffff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    [ring],
  );

  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (reducedMotion || !ref.current) return;
    ref.current.rotation.y += dt * spin;
  });

  return (
    <group position={position}>
      <group ref={ref}>
        <mesh geometry={geo} material={mat} />
      </group>
      {ring && <mesh geometry={ringGeo} material={ringMat} rotation={[-1.2, 0.3, 0]} />}
    </group>
  );
}

/** Instanced belt of eroded asteroids sharing one displaced geometry. */
function AsteroidBelt({ count }: { count: number }) {
  const geo = useDisposable(() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    displaceGeometry(g, { amp: 0.4, freq: 2.2, seed: 5, octaves: 3 });
    return g;
  }, []);
  const mat = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: '#7a736a', roughness: 1, metalness: 0.15, flatShading: true }),
    [],
  );
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(11);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = 24 + r() * 24;
      const y = 3 + r() * 28;
      out.push({
        position: [Math.cos(a) * rad, y, Math.sin(a) * rad],
        rotation: [r() * Math.PI, r() * Math.PI, r() * Math.PI],
        scale: 0.4 + r() * 2.4,
        color: `hsl(${28 + r() * 12}, 12%, ${34 + r() * 18}%)`,
      });
    }
    return out;
  }, [count]);
  return <Instances transforms={transforms} geometry={geo} material={mat} />;
}

function Satellite({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0.4, 0.7, 0.1]}>
      <mesh>
        <boxGeometry args={[0.6, 0.5, 0.5]} />
        <meshStandardMaterial color="#c9cdd4" roughness={0.4} metalness={0.85} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.95, 0, 0]}>
          <boxGeometry args={[1.2, 0.02, 0.4]} />
          <meshStandardMaterial color="#2a4a8a" emissive="#1f4fa0" emissiveIntensity={0.6} roughness={0.3} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={ACCENT} />
      </mesh>
    </group>
  );
}

/** A distant modular space station: a spine, rings and glowing modules. */
function SpaceStation({ position }: { position: [number, number, number] }) {
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#aeb6c4', roughness: 0.45, metalness: 0.8 }), []);
  const glow = useDisposable(() => new THREE.MeshBasicMaterial({ color: '#8fe6ff' }), []);
  return (
    <group position={position} rotation={[0.3, -0.5, 0.15]} scale={2.2}>
      <mesh material={mat}>
        <cylinderGeometry args={[0.12, 0.12, 3, 12]} />
      </mesh>
      {[-1, -0.4, 0.4, 1].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={i % 2 ? glow : mat}>
          <torusGeometry args={[0.5, 0.06, 8, 24]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.8, 0, 0]} material={mat}>
          <boxGeometry args={[0.9, 0.5, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

/** A streaking comet: bright head + a stretched additive tail, on a slow orbit. */
function Comet({ radius, y, speed, phase }: { radius: number; y: number; speed: number; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  const tailMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + phase;
    ref.current.position.set(Math.cos(t) * radius, y + Math.sin(t * 0.7) * 3, Math.sin(t) * radius);
    ref.current.rotation.y = -t + Math.PI / 2;
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0, -1.6]} rotation={[Math.PI / 2, 0, 0]} material={tailMat}>
        <coneGeometry args={[0.16, 3.2, 8, 1, true]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Holographic command core (animated projection above the table)
// ---------------------------------------------------------------------------

function HoloCore({ reducedMotion }: { reducedMotion?: boolean }) {
  const mat = useDisposable(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(ACCENT) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vPos;
      uniform float uTime; uniform vec3 uColor;
      ${GLSL_NOISE}
      void main(){
        // Horizontal scan lines + a rising energy shimmer.
        float scan = 0.5 + 0.5 * sin(vPos.y * 60.0 - uTime * 4.0);
        float shimmer = fbm(vPos * 4.0 + vec3(0.0, -uTime, 0.0));
        float a = (0.28 + 0.4 * scan) * (0.5 + 0.5 * shimmer);
        gl_FragColor = vec4(uColor * (1.2 + shimmer), a);
      }
    `,
  }), []);
  useShaderClock(mat, reducedMotion);

  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (reducedMotion || !ref.current) return;
    ref.current.rotation.y += dt * 0.3;
  });

  return (
    <group position={[0, PLAY_SURFACE_Y + 0.5, 0]}>
      <group ref={ref}>
        <mesh material={mat}>
          <icosahedronGeometry args={[0.28, 1]} />
        </mesh>
        <mesh material={mat} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.012, 8, 48]} />
        </mesh>
        <mesh material={mat} rotation={[Math.PI / 2.6, 0.4, 0]}>
          <torusGeometry args={[0.52, 0.01, 8, 48]} />
        </mesh>
      </group>
      <pointLight intensity={3} color={ACCENT} distance={2.5} decay={2} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Command platform
// ---------------------------------------------------------------------------

function CommandPlatform({ tableGroupScale }: { tableGroupScale: [number, number, number] }) {
  const surfaceMat = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: '#161b26', roughness: 0.32, metalness: 0.9 }),
    [],
  );
  const holoMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const panelMat = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: '#0e131c', roughness: 0.45, metalness: 0.75 }),
    [],
  );

  // Radial mechanical panel spokes around the pedestal.
  const spokes = useMemo(() => Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2), []);

  return (
    <group scale={tableGroupScale}>
      <PlaySurface rX={BASE_TABLE_RX} rZ={BASE_TABLE_RZ} thickness={0.09} surfaceMaterial={surfaceMat} edgeColor={ACCENT} edgeIntensity={1.4} />

      {/* Inset glowing accent rings on the surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PLAY_SURFACE_Y + 0.006, 0]}>
        <ringGeometry args={[0.55, 0.6, 64]} />
        <primitive object={holoMat} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PLAY_SURFACE_Y + 0.006, 0]}>
        <ringGeometry args={[0.9, 0.93, 64]} />
        <primitive object={holoMat} attach="material" />
      </mesh>

      {/* Central pedestal + mechanical spoke panels down to the deck */}
      <mesh position={[0, PLAY_SURFACE_Y / 2, 0]}>
        <cylinderGeometry args={[0.42, 0.62, PLAY_SURFACE_Y, 24]} />
        <meshStandardMaterial color="#0e131c" roughness={0.5} metalness={0.75} />
      </mesh>
      {spokes.map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.72, 0.16, Math.sin(a) * 0.72]} rotation={[0, -a, 0]} material={panelMat} castShadow>
          <boxGeometry args={[0.16, 0.3, 0.5]} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.95, 1.05, 0.06, 32]} />
        <meshStandardMaterial color="#12161f" roughness={0.6} metalness={0.6} />
      </mesh>
      {/* Under-glow ring at the base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}>
        <ringGeometry args={[1.0, 1.14, 48]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.55} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ConsolePod() {
  return (
    <group>
      {/* Seat base */}
      <mesh position={[0, 0.24, 0.05]} castShadow>
        <boxGeometry args={[0.5, 0.48, 0.5]} />
        <meshStandardMaterial color="#1b2130" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.62, -0.18]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.08]} />
        <meshStandardMaterial color="#232b3d" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Curved control console in front */}
      <mesh position={[0, 0.4, 0.42]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.62, 0.1, 0.26]} />
        <meshStandardMaterial color="#141922" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Glowing console screen */}
      <mesh position={[0, 0.58, 0.32]} rotation={[-0.5, 0, 0]}>
        <planeGeometry args={[0.46, 0.26]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function SpaceStationArena({ numPlayers, localIndex, quality, tableGroupScale, reducedMotion }: ArenaProps) {
  const tier = quality.tier;
  const seat = getSeatRingRadii(numPlayers);
  const asteroids = tier === 'high' ? 70 : tier === 'medium' ? 34 : 12;

  return (
    <>
      <fog attach="fog" args={['#04060f', 45, 130]} />

      {/* Lighting: cold ambient + a soft blue key that casts the table's shadow. */}
      <hemisphereLight args={['#20304a', '#03040a', 0.7]} />
      <directionalLight
        position={[6, 9, -6]}
        intensity={1.5}
        color="#dcecff"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 1.4, 0]} intensity={6} color={ACCENT} distance={6} decay={2} />
      <pointLight position={[0, 2.6, 3]} intensity={10} color="#ffffff" distance={9} decay={1.5} />

      <GradientSky
        quality={quality}
        top="#070c22"
        mid="#160a34"
        bottom="#01020a"
        cloud
        cloudColor="#6a3ab0"
        cloudScale={1.1}
        cloudStrength={tier === 'high' ? 0.75 : 0.55}
        warp={0.6}
        speed={0.005}
        sunColor="#bcd8ff"
        sunDir={[6, 9, -6]}
        sunSize={0.03}
        sunIntensity={1.2}
        starDensity={tier === 'high' ? 0.12 : 0.08}
        starColor="#dfeaff"
        reducedMotion={reducedMotion}
      />

      {/* Two-depth soft glow starfields. */}
      <GlowPoints count={900} quality={quality} radiusMin={40} radiusMax={58} size={0.5} color="#ffffff" color2="#9fc6ff" twinkle={tier === 'high'} reducedMotion={reducedMotion} seed={3} />
      <GlowPoints count={500} quality={quality} radiusMin={26} radiusMax={40} size={0.28} color="#cfe0ff" color2="#ffd9a0" reducedMotion={reducedMotion} seed={17} />

      {/* Planets, moons, station, satellites */}
      <Planet position={[-28, 20, -34]} radius={7} color="#3a5a8a" emissive="#12203a" emissiveIntensity={0.2} seed={2} spin={0.015} reducedMotion={reducedMotion} />
      <Planet position={[34, 13, -28]} radius={3.6} color="#b0663c" emissive="#3a1c0c" ring="#d8a066" seed={7} spin={0.03} reducedMotion={reducedMotion} />
      <Planet position={[18, 26, -20]} radius={1.5} color="#c8cdd6" seed={13} spin={0.05} reducedMotion={reducedMotion} />
      <SpaceStation position={[-16, 10, -18]} />
      <Satellite position={[11, 9, -13]} />
      <Satellite position={[-13, 6, -9]} />

      <AsteroidBelt count={asteroids} />

      {/* Comets (gated to non-low; motion only, cheap). */}
      {tier !== 'low' && (
        <>
          <Comet radius={30} y={16} speed={0.05} phase={0} />
          {tier === 'high' && <Comet radius={38} y={22} speed={0.035} phase={2.5} />}
        </>
      )}

      {/* Floating dust (gated to non-low). */}
      {tier !== 'low' && (
        <DriftField count={tier === 'high' ? 60 : 30} quality={quality} area={[16, 10, 16]} center={[0, 4, 0]} size={0.05} color="#bcd6ff" velocity={[0.05, 0.02, 0]} sway={0.2} opacity={0.5} reducedMotion={reducedMotion} seed={9} />
      )}

      <CommandPlatform tableGroupScale={tableGroupScale} />
      <HoloCore reducedMotion={reducedMotion} />

      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.18} rZ={seat.rZ + 0.18}>
        {() => <ConsolePod />}
      </SeatRing>
    </>
  );
}
