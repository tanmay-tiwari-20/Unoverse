'use client';

/**
 * GlacierArena — a carved ice arena beneath shimmering northern lights.
 *
 * World: a cool domain-warped sky with a multi-band aurora, a snow-capped
 * displaced mountain ring, a fresnel frozen lake, layered ice-crystal clusters
 * (fBm-built, instanced), a rolling snow terrain, drifting snowfall, wind-blown
 * ice particles and cold ground mist.
 *
 * Platform: a translucent MeshPhysicalMaterial ice slab with internal emissive
 * crack lines and glowing crystal edges on a frosted faceted base. Ice blocks
 * serve as seats. Quality-tier gates the aurora shader, terrain segments,
 * particle counts and shadows.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  ArenaProps,
  GradientSky,
  DriftField,
  Instances,
  InstanceTransform,
  PlaySurface,
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
import { displaceGeometry, buildCrystalCluster, buildMountain, buildIceCliff, mulberry32 } from './shared/proceduralGeometry';
import { ArenaModel } from './shared/gltf';
import { getSeatRingRadii } from '../../../utils/tableLayout';

// ---------------------------------------------------------------------------
// Aurora — multi-band curtain, additive, high/medium only
// ---------------------------------------------------------------------------

function Aurora({ reducedMotion }: { reducedMotion?: boolean }) {
  // Two overlapping bands at different heights for depth.
  const geoA = useDisposable(() => new THREE.CylinderGeometry(48, 48, 24, 72, 1, true, -1.3, 2.6), []);
  const geoB = useDisposable(() => new THREE.CylinderGeometry(44, 44, 18, 64, 1, true, 0.4, 2.2), []);
  const mat = useDisposable(
    () => new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color('#57f5b0') },
        uColorB: { value: new THREE.Color('#5aa8ff') },
        uColorC: { value: new THREE.Color('#c060ff') },
        uBand: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uBand; uniform vec3 uColorA, uColorB, uColorC;
        ${GLSL_NOISE}
        void main(){
          float bands = fbm(vec3(vUv.x*5.0 + uBand, uTime*0.12, 0.0));
          float curtain = smoothstep(0.18, 0.88, bands + vUv.y*0.35);
          float vert = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          float hue = fbm(vec3(vUv.x*3.0, uTime*0.08, uBand));
          vec3 col = hue < 0.5 ? mix(uColorA, uColorB, hue*2.0) : mix(uColorB, uColorC, (hue-0.5)*2.0);
          float a = curtain * vert * 0.65;
          gl_FragColor = vec4(col, a);
        }
      `,
    }),
    [],
  );
  const matB = useDisposable(
    () => new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color('#57f5b0') },
        uColorB: { value: new THREE.Color('#5aa8ff') },
        uColorC: { value: new THREE.Color('#c060ff') },
        uBand: { value: 3.7 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uBand; uniform vec3 uColorA, uColorB, uColorC;
        ${GLSL_NOISE}
        void main(){
          float bands = fbm(vec3(vUv.x*5.0 + uBand, uTime*0.12, 0.0));
          float curtain = smoothstep(0.18, 0.88, bands + vUv.y*0.35);
          float vert = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          float hue = fbm(vec3(vUv.x*3.0, uTime*0.08, uBand));
          vec3 col = hue < 0.5 ? mix(uColorA, uColorB, hue*2.0) : mix(uColorB, uColorC, (hue-0.5)*2.0);
          float a = curtain * vert * 0.45;
          gl_FragColor = vec4(col, a);
        }
      `,
    }),
    [],
  );
  useShaderClock(mat, reducedMotion);
  useShaderClock(matB, reducedMotion);
  return (
    <>
      <mesh geometry={geoA} material={mat} position={[0, 22, 0]} frustumCulled={false} />
      <mesh geometry={geoB} material={matB} position={[0, 26, 0]} frustumCulled={false} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Crystal clusters — fBm-built, instanced
// ---------------------------------------------------------------------------

function CrystalField({ count }: { count: number }) {
  const geo = useDisposable(() => buildCrystalCluster(31, ['#bfe9ff', '#9fd6ff', '#d8f2ff']), []);
  const mat = useDisposable(
    () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.12,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
      emissive: '#2a6aa0',
      emissiveIntensity: 0.3,
    }),
    [],
  );
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(31);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const rad = 5 + r() * 16;
      out.push({
        position: [Math.cos(a) * rad, 0, Math.sin(a) * rad],
        rotation: [0, r() * Math.PI * 2, 0],
        scale: 0.6 + r() * 2.4,
      });
    }
    return out;
  }, [count]);
  return <Instances transforms={transforms} geometry={geo} material={mat} castShadow />;
}

// ---------------------------------------------------------------------------
// Mountain ring — displaced, vertex-coloured (rock→snow gradient)
// ---------------------------------------------------------------------------

function MountainRing() {
  const geo = useDisposable(() => buildMountain(41, 1, 1, '#8aa8c0', '#eef6ff'), []);
  const mat = useDisposable(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), []);
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(41);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rad = 34 + r() * 10;
      const h = 12 + r() * 18;
      out.push({ position: [Math.cos(a) * rad, -1, Math.sin(a) * rad], rotation: [0, r() * Math.PI, 0], scale: [h * 0.8, h, h * 0.8] });
    }
    return out;
  }, []);
  return <Instances transforms={transforms} geometry={geo} material={mat} />;
}

// ---------------------------------------------------------------------------
// Ice cliffs — blocky faceted glacier masses ringing the mid-ground
// ---------------------------------------------------------------------------

function IceCliffRing({ count }: { count: number }) {
  const geo = useDisposable(() => buildIceCliff(52, '#7fb8dd', '#eaf6ff'), []);
  const mat = useDisposable(
    () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.05,
      flatShading: true,
      transparent: true,
      opacity: 0.95,
      emissive: '#183a52',
      emissiveIntensity: 0.15,
    }),
    [],
  );
  const transforms = useMemo<InstanceTransform[]>(() => {
    const r = mulberry32(52);
    const out: InstanceTransform[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.5;
      const rad = 20 + r() * 8;
      const s = 2.2 + r() * 3.4;
      out.push({
        position: [Math.cos(a) * rad, -0.4, Math.sin(a) * rad],
        rotation: [0, r() * Math.PI * 2, 0],
        scale: [s * (0.7 + r() * 0.5), s * (0.9 + r() * 0.8), s * (0.7 + r() * 0.5)],
      });
    }
    return out;
  }, [count]);
  if (count <= 0) return null;
  return <Instances transforms={transforms} geometry={geo} material={mat} castShadow />;
}

function FrozenLake({ reducedMotion }: { reducedMotion?: boolean }) {
  const geo = useDisposable(() => new THREE.CircleGeometry(28, 64), []);
  const mat = useDisposable(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#a8d8f0') },
      uCrack: { value: new THREE.Color('#5ab8e8') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos; varying vec3 vNorm;
      void main(){ vPos = position; vNorm = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vPos; varying vec3 vNorm;
      uniform float uTime; uniform vec3 uColor, uCrack;
      ${GLSL_NOISE}
      void main(){
        // Crack network via fbm.
        float n = fbm(vec3(vPos.x*0.8, vPos.y*0.8, 0.0));
        float crack = smoothstep(0.48, 0.52, n);
        // Fresnel rim.
        float fr = pow(1.0 - abs(vNorm.y), 3.0);
        vec3 col = mix(uColor, uCrack, crack * 0.6);
        col += vec3(0.4, 0.6, 0.8) * fr * 0.4;
        float a = 0.55 + fr * 0.25;
        gl_FragColor = vec4(col, a);
      }
    `,
  }), []);
  useShaderClock(mat, reducedMotion);
  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Ice slab platform
// ---------------------------------------------------------------------------

function IceSlab({ tableGroupScale }: { tableGroupScale: [number, number, number] }) {
  const surfaceMat = useDisposable(
    () => new THREE.MeshPhysicalMaterial({
      color: '#cdeeff',
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.55,
      thickness: 0.7,
      transparent: true,
      opacity: 0.92,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    }),
    [],
  );
  // Displaced ice base — faceted, slightly translucent.
  const baseGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(BASE_TABLE_RX * 0.95, BASE_TABLE_RX * 1.08, PLAY_SURFACE_Y - 0.04, 10, 2);
    displaceGeometry(g, { amp: 0.06, freq: 3, seed: 9, octaves: 2 });
    return g;
  }, []);
  // Emissive crack lines baked into a ring mesh.
  const crackMat = useDisposable(
    () => new THREE.MeshBasicMaterial({ color: '#8fdcff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );

  return (
    <group scale={tableGroupScale}>
      <PlaySurface rX={BASE_TABLE_RX} rZ={BASE_TABLE_RZ} thickness={0.14} surfaceMaterial={surfaceMat} edgeColor="#8fdcff" edgeIntensity={1.5} />

      {/* Frosted faceted ice base */}
      <mesh geometry={baseGeo} position={[0, PLAY_SURFACE_Y / 2 - 0.02, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#a9d4ec" roughness={0.35} metalness={0.05} transmission={0.25} thickness={0.4} transparent opacity={0.9} flatShading />
      </mesh>

      {/* Emissive crack ring at the base of the slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PLAY_SURFACE_Y - 0.01, 0]}>
        <ringGeometry args={[BASE_TABLE_RX * 0.55, BASE_TABLE_RX * 0.62, 48]} />
        <primitive object={crackMat} attach="material" />
      </mesh>
    </group>
  );
}

function IceBlock() {
  const geo = useDisposable(() => {
    const g = new THREE.BoxGeometry(0.6, 0.6, 0.6, 2, 2, 2);
    // Slightly displace vertices for a natural ice-chunk look
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i,
        pos.getX(i) + (Math.sin(i * 7.3) * 0.025),
        pos.getY(i) + (Math.sin(i * 3.1) * 0.02),
        pos.getZ(i) + (Math.sin(i * 5.7) * 0.025),
      );
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} position={[0, 0.3, 0]} rotation={[0, 0.3, 0]} castShadow receiveShadow>
      <meshPhysicalMaterial color="#cdeeff" roughness={0.08} transmission={0.5} thickness={0.5} transparent opacity={0.92} clearcoat={0.9} clearcoatRoughness={0.05} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export default function GlacierArena({ numPlayers, localIndex, quality, tableGroupScale, reducedMotion }: ArenaProps) {
  const tier = quality.tier;
  const seat = getSeatRingRadii(numPlayers);
  const crystals = tier === 'high' ? 36 : tier === 'medium' ? 20 : 10;
  // Hero-formation fallback geometry (procedural crystal cluster), built once.
  const heroFallbackGeo = useDisposable(() => buildCrystalCluster(77, ['#bfe9ff', '#9fd6ff', '#d8f2ff']), []);

  return (
    <>
      <fog attach="fog" args={['#0e2437', 18, 90]} />

      <hemisphereLight args={['#dff2ff', '#1a2c3a', 1.0]} />
      <directionalLight
        position={[-5, 10, 4]}
        intensity={1.8}
        color="#eaf6ff"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 1.6, 0]} intensity={5} color="#8fdcff" distance={6} decay={2} />
      <pointLight position={[0, 2.4, 3]} intensity={8} color="#ffffff" distance={9} decay={1.5} />

      <GradientSky
        quality={quality}
        top="#0a2a46"
        mid="#163a56"
        bottom="#06121e"
        cloud
        cloudColor="#2a7aaa"
        cloudScale={1.3}
        cloudStrength={tier === 'high' ? 0.38 : 0.24}
        warp={0.35}
        speed={0.004}
        sunColor="#c8e8ff"
        sunDir={[-5, 10, 4]}
        sunSize={0.04}
        sunIntensity={0.6}
        reducedMotion={reducedMotion}
      />

      {tier !== 'low' && <Aurora reducedMotion={reducedMotion} />}

      {/* Snow terrain + frozen lake. */}
      <TerrainPlane quality={quality} size={90} height={1.8} freq={0.04} seed={8} colorLow="#c8dff0" colorHigh="#eef6ff" roughness={0.95} />
      <FrozenLake reducedMotion={reducedMotion} />

      <MountainRing />
      <IceCliffRing count={tier === 'high' ? 12 : tier === 'medium' ? 7 : 0} />
      <CrystalField count={crystals} />

      {/* Hero ice formation: optimized GLTF when present, else procedural crystals. */}
      <ArenaModel
        model="glacierFormation"
        enabled={tier !== 'low'}
        position={[-11, 0, -9]}
        rotation={[0, 0.5, 0]}
        scale={3.2}
        castShadow
        fallback={
          <mesh geometry={heroFallbackGeo}>
            <meshStandardMaterial vertexColors roughness={0.12} metalness={0.05} transparent opacity={0.9} emissive="#2a6aa0" emissiveIntensity={0.3} />
          </mesh>
        }
      />

      {/* Low cold ground fog drifting over the ice (non-low). */}
      {tier !== 'low' && <GroundFog color="#cfe8f5" radius={30} y={0.5} opacity={0.22} scale={1.5} speed={0.012} reducedMotion={reducedMotion} />}

      {/* Snowfall. */}
      <DriftField count={tier === 'high' ? 160 : tier === 'medium' ? 80 : 35} quality={quality} area={[22, 14, 22]} center={[0, 7, 0]} size={0.07} color="#ffffff" velocity={[0.12, -0.55, 0.06]} sway={0.45} glow={false} opacity={0.9} softSprites reducedMotion={reducedMotion} seed={6} />
      {/* Wind-blown ice particles. */}
      {tier !== 'low' && (
        <DriftField count={tier === 'high' ? 60 : 30} quality={quality} area={[18, 4, 18]} center={[0, 2, 0]} size={0.04} color="#c8e8ff" velocity={[0.3, 0.0, 0.1]} sway={0.15} opacity={0.7} reducedMotion={reducedMotion} seed={14} />
      )}
      {/* Cold ground mist. */}
      {tier !== 'low' && (
        <DriftField count={tier === 'high' ? 40 : 20} quality={quality} area={[14, 3, 14]} center={[0, 1.5, 0]} size={0.32} color="#cfe8f5" velocity={[0.05, 0.0, 0.03]} sway={0.2} opacity={0.18} glow={false} softSprites reducedMotion={reducedMotion} seed={12} />
      )}

      <IceSlab tableGroupScale={tableGroupScale} />

      <SeatRing numPlayers={numPlayers} localIndex={localIndex} rX={seat.rX + 0.15} rZ={seat.rZ + 0.15}>
        {() => <IceBlock />}
      </SeatRing>
    </>
  );
}
