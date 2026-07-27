/**
 * proceduralGeometry — pure, framework-free geometry builders for the arenas.
 *
 * These take flat primitives to "handcrafted" detail entirely in code, so the
 * arenas stay 100% asset-free while looking far richer than a box or a cone:
 *
 *  - `displaceGeometry` warps a mesh's vertices with fBm value-noise, turning
 *    spheres into boulders/asteroids/moons and cones/planes into eroded rock and
 *    rolling terrain. Baked ONCE at build time — no per-frame cost.
 *  - `mergeColored` bakes a per-part vertex colour and welds many small
 *    geometries into ONE `BufferGeometry`. Combined with an `InstancedMesh` and a
 *    `vertexColors` material, a whole forest / crystal field / ruin set draws in a
 *    single call while each instance can still be tinted for variety.
 *  - `buildTree` / `buildRockCluster` / `buildCrystalCluster` / `buildMountain`
 *    compose the two above into the recurring props every arena needs.
 *
 * Nothing here is React-aware; callers wrap the results in `useDisposable` so the
 * GPU buffers are released on unmount.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Deterministic noise (so a rebuild never reshuffles the world)
// ---------------------------------------------------------------------------

/** Small fast seeded PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** Fractal Brownian motion — layered value noise, returns ~[0,1]. */
export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let value = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise(x * freq, y * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Displacement
// ---------------------------------------------------------------------------

export interface DisplaceOptions {
  /** Peak displacement distance along the vertex normal. */
  amp: number;
  /** Noise frequency — higher = rockier/more detailed. */
  freq?: number;
  seed?: number;
  octaves?: number;
  /** Push out only (true) or in and out (false). */
  positiveOnly?: boolean;
  /** Optional per-vertex mask by local Y (min,max) so e.g. only tops erode. */
  yInfluence?: (y: number) => number;
}

/**
 * Warp a geometry's vertices with fBm noise, in place, then recompute normals.
 * Returns the same geometry for chaining.
 */
export function displaceGeometry(geo: THREE.BufferGeometry, opts: DisplaceOptions): THREE.BufferGeometry {
  const { amp, freq = 1, seed = 1, octaves = 4, positiveOnly = false, yInfluence } = opts;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const o = seed * 0.137;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let n = fbm3(x * freq + o, y * freq + o, z * freq + o, octaves);
    n = positiveOnly ? n : n * 2 - 1;
    if (yInfluence) n *= yInfluence(y);
    const d = n * amp;
    pos.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Coloured merge
// ---------------------------------------------------------------------------

export interface ColoredPart {
  geometry: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
}

/** Bake a flat colour into a geometry's vertex `color` attribute (non-indexed). */
function bakeColor(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const count = g.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Weld several coloured parts into one geometry carrying a `color` attribute.
 * Render with a `vertexColors` material; instance for one draw call. The source
 * part geometries are disposed (their data now lives in the merged buffer).
 */
export function mergeColored(parts: ColoredPart[]): THREE.BufferGeometry {
  const baked = parts.map((p) => bakeColor(p.geometry, p.color));
  const merged = mergeGeometries(baked, false);
  baked.forEach((g) => g.dispose());
  if (!merged) throw new Error('mergeColored: geometry merge failed');
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// Composed props (origin at the base, y=0, so they sit on the ground)
// ---------------------------------------------------------------------------

/**
 * A detailed canopy tree: a tapered, slightly bent trunk plus several displaced
 * foliage clusters, colours baked in. Height ~1 unit; scale per instance.
 */
export function buildTree(seed: number, trunkColor = '#3a2a18', leafColors = ['#2f7a2c', '#1f5c20', '#3f8a34']): THREE.BufferGeometry {
  const r = mulberry32(seed);
  const parts: ColoredPart[] = [];
  const trunkH = 0.6 + r() * 0.25;
  const trunk = new THREE.CylinderGeometry(0.03, 0.07, trunkH, 6, 3);
  trunk.translate(0, trunkH / 2, 0);
  displaceGeometry(trunk, { amp: 0.012, freq: 6, seed: seed + 1, octaves: 2 });
  parts.push({ geometry: trunk, color: trunkColor });

  const clusters = 3 + Math.floor(r() * 3);
  for (let i = 0; i < clusters; i++) {
    const size = 0.16 + r() * 0.14;
    const foliage = new THREE.IcosahedronGeometry(size, 1);
    displaceGeometry(foliage, { amp: size * 0.35, freq: 3, seed: seed + 10 + i, octaves: 2 });
    const ang = r() * Math.PI * 2;
    const rad = r() * 0.12;
    foliage.translate(Math.cos(ang) * rad, trunkH + 0.05 + r() * 0.22, Math.sin(ang) * rad);
    parts.push({ geometry: foliage, color: leafColors[Math.floor(r() * leafColors.length)] });
  }
  return mergeColored(parts);
}

/** A clumped boulder pile — a few displaced rocks welded together. */
export function buildRockCluster(seed: number, colors = ['#5a5142', '#4c4536', '#6a6152']): THREE.BufferGeometry {
  const r = mulberry32(seed);
  const parts: ColoredPart[] = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const size = 0.18 + r() * 0.3;
    const rock = new THREE.IcosahedronGeometry(size, 1);
    displaceGeometry(rock, { amp: size * 0.4, freq: 2.5, seed: seed + i * 7, octaves: 3 });
    rock.translate((r() - 0.5) * 0.4, size * 0.6, (r() - 0.5) * 0.4);
    parts.push({ geometry: rock, color: colors[Math.floor(r() * colors.length)] });
  }
  return mergeColored(parts);
}

/** A cluster of elongated faceted crystals fanning out from a base. */
export function buildCrystalCluster(seed: number, colors = ['#bfe9ff', '#9fd6ff', '#d8f2ff']): THREE.BufferGeometry {
  const r = mulberry32(seed);
  const parts: ColoredPart[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.4 + r() * 0.9;
    const rad = 0.06 + r() * 0.1;
    const shard = new THREE.ConeGeometry(rad, h, 5);
    shard.translate(0, h / 2, 0);
    const tilt = (r() - 0.5) * 0.7;
    const yaw = r() * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, yaw, (r() - 0.5) * 0.4));
    m.setPosition((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    shard.applyMatrix4(m);
    parts.push({ geometry: shard, color: colors[Math.floor(r() * colors.length)] });
  }
  return mergeColored(parts);
}

/**
 * A jagged mountain/peak: a displaced cone with its base at y=0 and an optional
 * lighter snow-cap colour blended toward the summit.
 */
export function buildMountain(seed: number, radius = 1, height = 1, rock = '#5b5148', snow = '#eef6ff'): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, 7, 4);
  geo.translate(0, height / 2, 0);
  displaceGeometry(geo, { amp: radius * 0.28, freq: 1.6, seed, octaves: 4, yInfluence: (y) => 0.4 + (y / height) * 0.6 });
  // Bake a height-based rock→snow gradient into vertex colours.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const p = g.attributes.position as THREE.BufferAttribute;
  const cRock = new THREE.Color(rock), cSnow = new THREE.Color(snow), tmp = new THREE.Color();
  const arr = new Float32Array(p.count * 3);
  void pos;
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) / height - 0.45) * 2.2, 0, 1);
    tmp.copy(cRock).lerp(cSnow, t * t);
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
