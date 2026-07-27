'use client';

/**
 * ArenaKit — shared building blocks for every themed arena.
 *
 * Arenas are cosmetic: they swap the world around the table but must preserve
 * the exact play geometry the gameplay layers depend on. Everything here exists
 * to make that easy and safe:
 *
 *  - `PLAY_SURFACE_Y` / `EllipticalSlab` keep every themed platform's top face at
 *    the world height where cards and piles already render (see
 *    `CardFlightAnimations` DRAW/DISCARD at y≈0.92 and the felt at ≈0.88).
 *  - `useDisposable` guarantees every hand-built geometry/material/shader/texture
 *    is released on unmount, so switching rooms never leaks GPU memory.
 *  - The particle / instanced / sky primitives all take the effective quality
 *    tier and scale their own cost from it, so a new arena gets adaptive
 *    performance for free.
 *
 * Nothing here renders seats, cards, camera or controls — those are siblings of
 * the arena in the scene graph and are identical in every world.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectiveQuality } from '../../../../hooks/useEffectiveQuality';
import { scaleParticles } from '../../../../lib/quality/qualityTiers';
import { BASE_TABLE_RX, BASE_TABLE_RZ } from '../../../../utils/tableLayout';
import { fbm3 } from './proceduralGeometry';

/** World-Y of the play surface top. Cards/piles sit just above this (~0.92). */
export const PLAY_SURFACE_Y = 0.88;

/** Base tabletop footprint (matches the reference GameTable ellipse). */
export { BASE_TABLE_RX, BASE_TABLE_RZ };

/**
 * Props every arena scene component receives from the dispatcher. Mirrors what
 * the old hardcoded `Scene` computed, so arenas need nothing from the store.
 */
export interface ArenaProps {
  numPlayers: number;
  localIndex: number;
  quality: EffectiveQuality;
  /** `[sx, 1, sz]` footprint scale from `getTableGroupScale(numPlayers)`. */
  tableGroupScale: [number, number, number];
  isLandingPage?: boolean;
  /** True when the OS / user prefers reduced motion — pause ambient animation. */
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

type Disposable = { dispose?: () => void };

/**
 * Build a Three.js resource once and dispose it on unmount.
 *
 * R3F auto-disposes objects attached via JSX, but hand-built geometries,
 * ShaderMaterials, textures and render targets created in `useMemo` are safest
 * disposed explicitly — especially shaders, which R3F will not always release.
 */
export function useDisposable<T extends Disposable | Disposable[]>(factory: () => T, deps: React.DependencyList): T {
  const value = useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/use-memo
  useEffect(() => {
    return () => {
      const items = Array.isArray(value) ? value : [value];
      items.forEach((item) => item?.dispose?.());
    };
  }, [value]);
  return value;
}

// ---------------------------------------------------------------------------
// Shared GLSL — cheap hash / value-noise / fbm used by the sky & effect shaders.
// ---------------------------------------------------------------------------

export const GLSL_NOISE = /* glsl */ `
  float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){
    vec3 p=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(p+vec3(0,0,0)),hash(p+vec3(1,0,0)),f.x),
                   mix(hash(p+vec3(0,1,0)),hash(p+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(p+vec3(0,0,1)),hash(p+vec3(1,0,1)),f.x),
                   mix(hash(p+vec3(0,1,1)),hash(p+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.02; a*=0.5; }
    return v;
  }
`;

/** Advance a shader's `uTime` uniform each frame (paused under reduced motion). */
export function useShaderClock(material: THREE.ShaderMaterial | null | undefined, paused?: boolean) {
  useFrame((_, delta) => {
    if (!material || paused) return;
    const u = material.uniforms?.uTime;
    // Animating a GPU uniform is inherently an imperative per-frame mutation —
    // the core R3F pattern the React Compiler immutability rule doesn't model.
    // eslint-disable-next-line react-hooks/immutability
    if (u) u.value += delta;
  });
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

/**
 * Large inward-facing sky sphere.
 *
 * High/Medium: a procedural fragment shader (vertical gradient + domain-warped
 * layered fbm "clouds"/nebula — the fake-volumetric technique that gives depth
 * without a per-pixel raymarch cost — plus an optional atmospheric-scattering
 * horizon glow / sun disc and an in-shader twinkling star layer for space). Low:
 * the shader is skipped for a cheap vertical gradient via vertex colours — no
 * noise, no per-frame work.
 *
 * All the atmosphere props (`sun*`, `starDensity`, `warp`) are optional and off
 * by default, so existing callers keep their exact look.
 */
export function GradientSky({
  quality,
  top,
  mid,
  bottom,
  cloud,
  cloudColor,
  cloudScale = 1.2,
  cloudStrength = 0.0,
  speed = 0.01,
  warp = 0.0,
  sunColor,
  sunDir,
  sunSize = 0.04,
  sunIntensity = 1.0,
  starDensity = 0.0,
  starColor = '#ffffff',
  reducedMotion,
  radius = 60,
}: {
  quality: EffectiveQuality;
  top: string;
  mid: string;
  bottom: string;
  cloud?: boolean;
  cloudColor?: string;
  cloudScale?: number;
  cloudStrength?: number;
  speed?: number;
  /** Domain-warp amount for the cloud/nebula fbm (0 = plain, ~0.6 = swirly). */
  warp?: number;
  /** Enables a soft horizon-glow + sun/star disc in the given direction. */
  sunColor?: string;
  sunDir?: [number, number, number];
  sunSize?: number;
  sunIntensity?: number;
  /** In-shader star layer density (0 = none). Great for space skies. */
  starDensity?: number;
  starColor?: string;
  reducedMotion?: boolean;
  radius?: number;
}) {
  const useShader = quality.tier !== 'low' && (!!cloud || starDensity > 0 || !!sunColor);

  const geo = useDisposable(() => new THREE.SphereGeometry(radius, 48, 32), [radius]);

  const shaderMat = useDisposable(() => {
    if (!useShader) return new THREE.MeshBasicMaterial();
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(top) },
        uMid: { value: new THREE.Color(mid) },
        uBottom: { value: new THREE.Color(bottom) },
        uCloud: { value: new THREE.Color(cloudColor ?? mid) },
        uScale: { value: cloudScale },
        uStrength: { value: cloudStrength },
        uSpeed: { value: speed },
        uWarp: { value: warp },
        uSunCol: { value: new THREE.Color(sunColor ?? '#000000') },
        uSunDir: { value: new THREE.Vector3(...(sunDir ?? [0, 0.3, -1])).normalize() },
        uSunSize: { value: sunSize },
        uSunInt: { value: sunColor ? sunIntensity : 0 },
        uStarDensity: { value: starDensity },
        uStarCol: { value: new THREE.Color(starColor) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vDir;
        uniform float uTime, uScale, uStrength, uSpeed, uWarp, uSunSize, uSunInt, uStarDensity;
        uniform vec3 uTop, uMid, uBottom, uCloud, uSunCol, uSunDir, uStarCol;
        ${GLSL_NOISE}
        // Hash for the star layer.
        float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        void main(){
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y*0.5+0.5, 0.0, 1.0);
          vec3 col = h < 0.5 ? mix(uBottom, uMid, h*2.0) : mix(uMid, uTop, (h-0.5)*2.0);

          // Domain-warped nebula / cloud layer.
          if(uStrength > 0.001){
            vec3 p = dir*uScale + vec3(0.0, 0.0, uTime*uSpeed);
            vec3 q = p;
            if(uWarp > 0.001){
              q += uWarp * vec3(fbm(p+vec3(1.7,9.2,0.0)), fbm(p+vec3(8.3,2.8,0.0)), fbm(p+vec3(0.0,4.1,6.3)));
            }
            float n = fbm(q*3.0);
            n = pow(clamp(n,0.0,1.0), 2.0);
            col = mix(col, uCloud, n*uStrength);
          }

          // In-shader star field (cheap: one hash cell lookup) with twinkle.
          if(uStarDensity > 0.001){
            vec2 sc = vec2(atan(dir.z, dir.x)*2.0, asin(clamp(dir.y,-1.0,1.0))) * 40.0;
            vec2 gid = floor(sc);
            float rnd = hash21(gid);
            if(rnd > 1.0 - uStarDensity){
              float tw = 0.6 + 0.4*sin(uTime*3.0 + rnd*30.0);
              float d = length(fract(sc)-0.5);
              float star = smoothstep(0.28, 0.0, d) * tw;
              col += uStarCol * star * (0.5 + rnd);
            }
          }

          // Sun / atmospheric horizon glow.
          if(uSunInt > 0.001){
            float m = max(dot(dir, normalize(uSunDir)), 0.0);
            float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize*0.3, m);
            float halo = pow(m, 8.0);
            col += uSunCol * (disc*1.5 + halo*0.6) * uSunInt;
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [useShader, top, mid, bottom, cloudColor, cloudScale, cloudStrength, speed, warp, sunColor, sunSize, sunIntensity, starDensity, starColor]);

  // Low tier: bake a vertical gradient into vertex colours (no shader / no time).
  const basicMat = useDisposable(() => {
    if (useShader) return new THREE.MeshBasicMaterial(); // unused placeholder
    return new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, depthWrite: false });
  }, [useShader]);

  const gradientGeo = useDisposable(() => {
    if (useShader) return new THREE.BufferGeometry(); // unused placeholder
    const g = new THREE.SphereGeometry(radius, 24, 16);
    const cTop = new THREE.Color(top);
    const cMid = new THREE.Color(mid);
    const cBot = new THREE.Color(bottom);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / radius; // -1..1
      const h = THREE.MathUtils.clamp(y * 0.5 + 0.5, 0, 1);
      if (h < 0.5) tmp.copy(cBot).lerp(cMid, h * 2);
      else tmp.copy(cMid).lerp(cTop, (h - 0.5) * 2);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [useShader, top, mid, bottom, radius]);

  useShaderClock(useShader ? (shaderMat as THREE.ShaderMaterial) : null, reducedMotion);

  if (useShader) {
    return <mesh geometry={geo} material={shaderMat} frustumCulled={false} />;
  }
  return <mesh geometry={gradientGeo} material={basicMat} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Particles / point fields
// ---------------------------------------------------------------------------

/**
 * A static-ish point field (stars, distant lights). `count` is scaled by the
 * quality particle budget. Purely additive points, no per-frame cost unless
 * `twinkle` is on (a single uniform update).
 */
export function PointField({
  count,
  quality,
  radiusMin = 20,
  radiusMax = 55,
  size = 0.25,
  color = '#ffffff',
  color2,
  opacity = 1,
  yMin = -1,
  twinkle = false,
  reducedMotion,
  seed = 1,
}: {
  count: number;
  quality: EffectiveQuality;
  radiusMin?: number;
  radiusMax?: number;
  size?: number;
  color?: string;
  color2?: string;
  opacity?: number;
  yMin?: number;
  twinkle?: boolean;
  reducedMotion?: boolean;
  seed?: number;
}) {
  const n = scaleParticles(count, quality.particleScale);

  const geo = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const cA = new THREE.Color(color);
    const cB = new THREE.Color(color2 ?? color);
    // Deterministic pseudo-random so a re-render doesn't reshuffle the sky.
    let s = seed * 9973;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = radiusMin + rand() * (radiusMax - radiusMin);
      const sq = Math.sqrt(1 - u * u);
      let y = r * u;
      if (y < yMin * r) y = -y; // bias out of the floor
      positions[i * 3] = r * sq * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(y);
      positions[i * 3 + 2] = r * sq * Math.sin(theta);
      tmp.copy(cA).lerp(cB, rand());
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [n, radiusMin, radiusMax, color, color2, yMin, seed]);

  const mat = useDisposable(() => new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  }), [size, opacity]);

  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (!twinkle || reducedMotion || !ref.current) return;
    const m = ref.current.material as THREE.PointsMaterial;
    m.opacity = opacity * (0.75 + 0.25 * Math.sin(clock.elapsedTime * 2));
  });

  if (n <= 0) return null;
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/**
 * Drifting particles (snow, embers, fireflies, dust). Each particle loops within
 * a box and moves per frame. Count scales with the quality budget; motion pauses
 * under reduced motion.
 */
export function DriftField({
  count,
  quality,
  area = [6, 4, 6],
  center = [0, 2, 0],
  size = 0.06,
  color = '#ffffff',
  velocity = [0, -0.4, 0],
  sway = 0.3,
  glow = true,
  opacity = 0.9,
  reducedMotion,
  seed = 7,
}: {
  count: number;
  quality: EffectiveQuality;
  area?: [number, number, number];
  center?: [number, number, number];
  size?: number;
  color?: string;
  velocity?: [number, number, number];
  sway?: number;
  glow?: boolean;
  opacity?: number;
  reducedMotion?: boolean;
  seed?: number;
}) {
  const n = scaleParticles(count, quality.particleScale);

  // Base positions + per-particle phase are plain arrays (no GPU resource).
  const { base, phase } = useMemo(() => {
    const positions = new Float32Array(Math.max(1, n) * 3);
    const ph = new Float32Array(Math.max(1, n));
    let s = seed * 7919;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (rand() - 0.5) * area[0];
      positions[i * 3 + 1] = (rand() - 0.5) * area[1];
      positions[i * 3 + 2] = (rand() - 0.5) * area[2];
      ph[i] = rand() * Math.PI * 2;
    }
    return { base: positions, phase: ph };
  }, [n, area[0], area[1], area[2], seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // The geometry IS a GPU resource — build it from the base positions and dispose
  // it on unmount.
  const geo = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    return g;
  }, [base]);

  const mat = useDisposable(() => new THREE.PointsMaterial({
    size,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  }), [size, color, opacity, glow]);

  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (reducedMotion || !ref.current) return;
    const t = clock.elapsedTime;
    // Mutate the live geometry through the points ref (a mutable ref), not the
    // `geo` value captured from useDisposable — same buffer, lint-clean path.
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const iy = (base[i * 3 + 1] + velocity[1] * t);
      // wrap within the vertical extent
      const y = ((iy + area[1] / 2) % area[1] + area[1]) % area[1] - area[1] / 2;
      const swayX = Math.sin(t * 0.6 + phase[i]) * sway;
      const swayZ = Math.cos(t * 0.5 + phase[i]) * sway;
      pos.setXYZ(
        i,
        base[i * 3] + velocity[0] * t + swayX,
        y,
        base[i * 3 + 2] + velocity[2] * t + swayZ,
      );
    }
    pos.needsUpdate = true;
  });

  if (n <= 0) return null;
  return (
    <points ref={ref} geometry={geo} material={mat} position={center} frustumCulled={false} />
  );
}

// ---------------------------------------------------------------------------
// Soft glow sprites — the AAA replacement for hard square PointsMaterial dots.
// ---------------------------------------------------------------------------

/**
 * A memoized radial-gradient sprite texture (white→transparent), tinted per
 * material via `PointsMaterial.color`. Disposed on unmount. Feeds every soft
 * additive light in the arenas: stars, embers, fireflies, city lights, dust.
 */
export function useGlowTexture(size = 64): THREE.Texture {
  return useDisposable(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [size]);
}

/**
 * Like `PointField` but each point is a soft round glow sprite (via
 * `useGlowTexture`) instead of a hard square — the bloom-friendly look for
 * starfields, fireflies and distant lights. Optional gentle twinkle.
 */
export function GlowPoints({
  count,
  quality,
  radiusMin = 20,
  radiusMax = 55,
  size = 0.6,
  color = '#ffffff',
  color2,
  opacity = 1,
  twinkle = false,
  reducedMotion,
  seed = 1,
}: {
  count: number;
  quality: EffectiveQuality;
  radiusMin?: number;
  radiusMax?: number;
  size?: number;
  color?: string;
  color2?: string;
  opacity?: number;
  twinkle?: boolean;
  reducedMotion?: boolean;
  seed?: number;
}) {
  const n = scaleParticles(count, quality.particleScale);
  const tex = useGlowTexture();

  const geo = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(1, n) * 3);
    const colors = new Float32Array(Math.max(1, n) * 3);
    const cA = new THREE.Color(color);
    const cB = new THREE.Color(color2 ?? color);
    let s = seed * 9973;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = radiusMin + rand() * (radiusMax - radiusMin);
      const sq = Math.sqrt(1 - u * u);
      positions[i * 3] = r * sq * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * u);
      positions[i * 3 + 2] = r * sq * Math.sin(theta);
      tmp.copy(cA).lerp(cB, rand());
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [n, radiusMin, radiusMax, color, color2, seed]);

  const mat = useDisposable(() => new THREE.PointsMaterial({
    size,
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  }), [size, opacity, tex]);

  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }) => {
    if (!twinkle || reducedMotion || !ref.current) return;
    const m = ref.current.material as THREE.PointsMaterial;
    m.opacity = opacity * (0.7 + 0.3 * Math.sin(clock.elapsedTime * 1.7));
  });

  if (n <= 0) return null;
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Scrolling emissive surface — lava flows, rivers/waterfalls, holo billboards.
// ---------------------------------------------------------------------------

/**
 * A flat mesh carrying a scrolling, domain-warped fbm emissive shader. Used for
 * flowing lava, water/waterfalls and animated holographic billboards. The colour
 * ramp (`low`→`mid`→`high`) and flow direction are per-arena; brightness is tuned
 * so the bright bands feed bloom on the high tier.
 */
export function ScrollSurface({
  geometry,
  colorLow,
  colorMid,
  colorHigh,
  scale = 1.5,
  speed = 0.15,
  direction = [0, 1],
  emissive = 1.4,
  warp = 0.5,
  opacity = 1,
  transparent = false,
  reducedMotion,
  ...meshProps
}: {
  geometry: THREE.BufferGeometry;
  colorLow: string;
  colorMid: string;
  colorHigh: string;
  scale?: number;
  speed?: number;
  direction?: [number, number];
  emissive?: number;
  warp?: number;
  opacity?: number;
  transparent?: boolean;
  reducedMotion?: boolean;
} & Omit<React.ComponentProps<'mesh'>, 'geometry' | 'material'>) {
  const mat = useDisposable(() => new THREE.ShaderMaterial({
    transparent,
    depthWrite: !transparent,
    uniforms: {
      uTime: { value: 0 },
      uLow: { value: new THREE.Color(colorLow) },
      uMid: { value: new THREE.Color(colorMid) },
      uHigh: { value: new THREE.Color(colorHigh) },
      uScale: { value: scale },
      uSpeed: { value: speed },
      uDir: { value: new THREE.Vector2(...direction) },
      uEmissive: { value: emissive },
      uWarp: { value: warp },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime, uScale, uSpeed, uEmissive, uWarp, uOpacity;
      uniform vec2 uDir;
      uniform vec3 uLow, uMid, uHigh;
      ${GLSL_NOISE}
      void main(){
        vec2 uv = vUv * uScale;
        vec2 flow = uDir * uTime * uSpeed;
        vec3 p = vec3(uv + flow, uTime * uSpeed * 0.3);
        vec3 q = p;
        q.xy += uWarp * vec2(fbm(p + vec3(0.0,1.3,0.0)), fbm(p + vec3(2.7,0.0,0.0)));
        float n = fbm(q * 2.5);
        n = clamp(n, 0.0, 1.0);
        vec3 col = n < 0.5 ? mix(uLow, uMid, n*2.0) : mix(uMid, uHigh, (n-0.5)*2.0);
        col *= uEmissive;
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  }), [colorLow, colorMid, colorHigh, scale, speed, direction[0], direction[1], emissive, warp, opacity, transparent]);

  useShaderClock(mat, reducedMotion);
  return <mesh geometry={geometry} material={mat} {...meshProps} />;
}

// ---------------------------------------------------------------------------
// Terrain — large displaced, vertex-coloured ground plane.
// ---------------------------------------------------------------------------

/**
 * A big ground plane, displaced with fBm into gentle rolling relief and tinted
 * with a two-tone height/noise gradient baked into vertex colours. Replaces flat
 * background floors (snow field, jungle floor, obsidian plain, city deck). Built
 * once; no per-frame cost. Segment count scales down on the low tier.
 */
export function TerrainPlane({
  quality,
  size = 90,
  height = 2.2,
  freq = 0.06,
  seed = 3,
  colorLow,
  colorHigh,
  roughness = 1,
  metalness = 0,
  y = 0,
  flatShading = false,
  receiveShadow = true,
}: {
  quality: EffectiveQuality;
  size?: number;
  height?: number;
  freq?: number;
  seed?: number;
  colorLow: string;
  colorHigh: string;
  roughness?: number;
  metalness?: number;
  y?: number;
  flatShading?: boolean;
  receiveShadow?: boolean;
}) {
  const geo = useDisposable(() => {
    const seg = quality.tier === 'low' ? 48 : quality.tier === 'medium' ? 96 : 140;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const cLow = new THREE.Color(colorLow);
    const cHigh = new THREE.Color(colorHigh);
    const tmp = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    const o = seed * 0.531;
    // Plane is built in XY (rotated to XZ by the mesh); displace along +Z (local).
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), yy = pos.getY(i);
      const h = fbm3(x * freq + o, yy * freq + o, o, 4);
      const near = Math.max(0, 1 - (x * x + yy * yy) / ((size * 0.28) * (size * 0.28)));
      const z = (h - 0.5) * height * (0.35 + 0.65 * (1 - near)); // flatten toward the centre platform
      pos.setZ(i, z);
      const t = THREE.MathUtils.clamp(h * 1.3, 0, 1);
      tmp.copy(cLow).lerp(cHigh, t);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [quality.tier, size, height, freq, seed, colorLow, colorHigh]);

  const mat = useDisposable(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, flatShading }),
    [roughness, metalness, flatShading],
  );

  return (
    <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow={receiveShadow} />
  );
}

// ---------------------------------------------------------------------------
// Instancing
// ---------------------------------------------------------------------------

export interface InstanceTransform {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color?: string;
}

/**
 * Render many copies of one geometry/material as a single draw call. The
 * canonical way arenas place repeated decor (trees, crystals, asteroids,
 * pillars, drones) cheaply. Instance count is authored by the caller (already
 * quality-scaled where relevant).
 */
export function Instances({
  transforms,
  geometry,
  material,
  castShadow = false,
  receiveShadow = false,
}: {
  transforms: InstanceTransform[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let hasColor = false;
    transforms.forEach((t, i) => {
      p.set(...t.position);
      e.set(...(t.rotation ?? [0, 0, 0]));
      q.setFromEuler(e);
      if (typeof t.scale === 'number') s.setScalar(t.scale);
      else s.set(...(t.scale ?? [1, 1, 1]));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (t.color) { col.set(t.color); mesh.setColorAt(i, col); hasColor = true; }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [transforms]);

  if (!transforms.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, transforms.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Play surface / platform
// ---------------------------------------------------------------------------

/**
 * Build an extruded elliptical slab whose TOP face sits exactly at `topY`. This
 * is the contract every themed platform honours so cards and piles (rendered at
 * fixed world positions) always rest on the surface, regardless of theme.
 *
 * Returns a geometry already translated so its top is at `topY`; render it flat
 * (rotate -PI/2 on X) inside the table group so `tableGroupScale` widens it with
 * the player count exactly like the original table.
 */
export function useEllipticalSlab(rX: number, rZ: number, thickness: number, topY: number, bevel = 0.02) {
  return useDisposable(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rX, rZ, 0, Math.PI * 2, false, 0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 64,
    });
    // Extrude builds in XY extruded along +Z. After we rotate the mesh -PI/2 on
    // X, +Z becomes -Y (down), so the top face lands at (topY - localZ*sign).
    // Simplest: center the geometry then offset in the mesh. We instead bake the
    // translate so the slab's top is at y=0 in local space; the mesh sets topY.
    geo.translate(0, 0, -thickness);
    return geo;
  }, [rX, rZ, thickness, bevel]);
}

/**
 * Convenience wrapper: a themed play surface + optional glowing edge ring at the
 * canonical height. Arenas drop this at the centre of their table group and then
 * build legs / bases / thrones around it.
 */
export function PlaySurface({
  rX = BASE_TABLE_RX,
  rZ = BASE_TABLE_RZ,
  thickness = 0.06,
  surfaceMaterial,
  edgeColor,
  edgeIntensity = 1,
  receiveShadow = true,
}: {
  rX?: number;
  rZ?: number;
  thickness?: number;
  surfaceMaterial: THREE.Material;
  edgeColor?: string;
  edgeIntensity?: number;
  receiveShadow?: boolean;
}) {
  const slab = useEllipticalSlab(rX, rZ, thickness, PLAY_SURFACE_Y);

  const ringGeo = useDisposable(() => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, rX + 0.02, rZ + 0.02, 0, Math.PI * 2, false, 0);
    const h = new THREE.Path();
    h.absellipse(0, 0, rX - 0.03, rZ - 0.03, 0, Math.PI * 2, true, 0);
    s.holes.push(h);
    return new THREE.ShapeGeometry(s, 64);
  }, [rX, rZ]);

  const ringMat = useDisposable(
    () => new THREE.MeshBasicMaterial({
      color: new THREE.Color(edgeColor ?? '#ffffff'),
      transparent: true,
      opacity: Math.min(1, 0.5 * edgeIntensity),
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    [edgeColor, edgeIntensity],
  );

  return (
    <group>
      <mesh
        geometry={slab}
        material={surfaceMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, PLAY_SURFACE_Y, 0]}
        receiveShadow={receiveShadow}
        castShadow
      />
      {edgeColor && (
        <mesh geometry={ringGeo} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, PLAY_SURFACE_Y + 0.002, 0]} />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Themed seat props
// ---------------------------------------------------------------------------

/**
 * Place a themed seat prop at every opponent seat ring position. The human
 * silhouettes (WebGLSeats) are unchanged and still rendered on top; these are
 * purely decorative "chairs/thrones" behind them, matching the arena. The local
 * player's seat (index 0 / angle 0) is skipped to keep the first-person view
 * clear, exactly like the silhouettes.
 */
export function SeatRing({
  numPlayers,
  localIndex,
  rX,
  rZ,
  children,
}: {
  numPlayers: number;
  localIndex: number;
  rX: number;
  rZ: number;
  children: (angle: number) => React.ReactNode;
}) {
  const seats = useMemo(() => {
    const out: { angle: number; key: number }[] = [];
    for (let i = 0; i < numPlayers; i++) {
      const relative = (i - localIndex + numPlayers) % numPlayers;
      if (relative === 0) continue; // local player — first person, no prop
      out.push({ angle: (Math.PI * 2 / numPlayers) * relative, key: i });
    }
    return out;
  }, [numPlayers, localIndex]);

  return (
    <group>
      {seats.map(({ angle, key }) => (
        <group
          key={`seatprop-${key}`}
          position={[Math.sin(angle) * rX, 0, Math.cos(angle) * rZ]}
          rotation={[0, angle + Math.PI, 0]}
        >
          {children(angle)}
        </group>
      ))}
    </group>
  );
}
