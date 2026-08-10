import React, { useRef, useMemo, useLayoutEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface PhysicalCardProps {
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string;
  isFaceUp: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  animateSpawn?: 'drop' | 'none' | 'deal';
  onClick?: () => void;
  blankFace?: boolean;
}

const canvasCache: Record<string, { front: HTMLCanvasElement, back: HTMLCanvasElement }> = {};

// Helper to generate a shared, extremely lightweight noise map for paper grain
let sharedBumpMap: THREE.CanvasTexture | null = null;
const getSharedBumpMap = () => {
  if (sharedBumpMap) return sharedBumpMap;
  
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080'; // Neutral bump
    ctx.fillRect(0, 0, size, size);
    
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Extremely subtle variation for soft paper grain
      const noise = 128 + (Math.random() - 0.5) * 5; 
      data[i] = noise;
      data[i+1] = noise;
      data[i+2] = noise;
    }
    ctx.putImageData(imgData, 0, 0);
  }
  
  sharedBumpMap = new THREE.CanvasTexture(canvas);
  sharedBumpMap.wrapS = THREE.RepeatWrapping;
  sharedBumpMap.wrapT = THREE.RepeatWrapping;
  sharedBumpMap.repeat.set(2, 3);
  sharedBumpMap.minFilter = THREE.LinearFilter;
  sharedBumpMap.magFilter = THREE.LinearFilter;
  sharedBumpMap.needsUpdate = true;
  return sharedBumpMap;
};

// Helper to create a clean, 3D rounded card geometry with smooth corners and precise UV mapping.
// This permanently eliminates black corner artifacts caused by rectangular sharp box geometries.
let sharedCardGeometry: THREE.BufferGeometry | null = null;
const getSharedCardGeometry = (): THREE.BufferGeometry => {
  if (sharedCardGeometry) return sharedCardGeometry;

  const width = 0.124;
  const height = 0.002;
  const depth = 0.184;
  const radius = 0.010; // 10mm smooth rounded corner
  const segmentsPerCorner = 6;

  const geometry = new THREE.BufferGeometry();
  const w2 = width / 2;
  const h2 = height / 2;
  const d2 = depth / 2;
  const r = Math.min(radius, w2, d2);

  // Outline perimeter of rounded rectangle on X-Z plane
  const centers = [
    { x: w2 - r, z: d2 - r, aStart: 0, aEnd: Math.PI / 2 },
    { x: -w2 + r, z: d2 - r, aStart: Math.PI / 2, aEnd: Math.PI },
    { x: -w2 + r, z: -d2 + r, aStart: Math.PI, aEnd: Math.PI * 1.5 },
    { x: w2 - r, z: -d2 + r, aStart: Math.PI * 1.5, aEnd: Math.PI * 2 },
  ];

  const outline: { x: number; z: number }[] = [];
  for (const c of centers) {
    for (let i = 0; i < segmentsPerCorner; i++) {
      const angle = c.aStart + (c.aEnd - c.aStart) * (i / segmentsPerCorner);
      outline.push({
        x: c.x + Math.cos(angle) * r,
        z: c.z + Math.sin(angle) * r,
      });
    }
  }

  const N = outline.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // 1. Top face (+Y = +h2, Front of card)
  const topCenterIdx = 0;
  positions.push(0, h2, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  const topPerimeterStartIdx = 1;
  for (let i = 0; i < N; i++) {
    const pt = outline[i];
    positions.push(pt.x, h2, pt.z);
    normals.push(0, 1, 0);
    uvs.push((pt.x + w2) / width, (d2 - pt.z) / depth);
  }

  const topFaceIndicesStart = indices.length;
  for (let i = 0; i < N; i++) {
    const current = topPerimeterStartIdx + i;
    const next = topPerimeterStartIdx + ((i + 1) % N);
    indices.push(topCenterIdx, next, current);
  }
  const topFaceIndicesCount = indices.length - topFaceIndicesStart;

  // 2. Bottom face (-Y = -h2, Back of card)
  const bottomCenterIdx = positions.length / 3;
  positions.push(0, -h2, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  const bottomPerimeterStartIdx = bottomCenterIdx + 1;
  for (let i = 0; i < N; i++) {
    const pt = outline[i];
    positions.push(pt.x, -h2, pt.z);
    normals.push(0, -1, 0);
    uvs.push((pt.x + w2) / width, (d2 - pt.z) / depth);
  }

  const bottomFaceIndicesStart = indices.length;
  for (let i = 0; i < N; i++) {
    const current = bottomPerimeterStartIdx + i;
    const next = bottomPerimeterStartIdx + ((i + 1) % N);
    indices.push(bottomCenterIdx, current, next);
  }
  const bottomFaceIndicesCount = indices.length - bottomFaceIndicesStart;

  // 3. Side wall rim
  const sideStartIdx = positions.length / 3;
  for (let i = 0; i < N; i++) {
    const pt = outline[i];
    let nx = pt.x;
    let nz = pt.z;
    for (const c of centers) {
      const dx = pt.x - c.x;
      const dz = pt.z - c.z;
      if (Math.abs(Math.hypot(dx, dz) - r) < 0.001) {
        const len = Math.hypot(dx, dz);
        if (len > 0.00001) { nx = dx / len; nz = dz / len; }
        break;
      }
    }

    positions.push(pt.x, h2, pt.z);
    normals.push(nx, 0, nz);
    uvs.push(i / N, 1);

    positions.push(pt.x, -h2, pt.z);
    normals.push(nx, 0, nz);
    uvs.push(i / N, 0);
  }

  const sideIndicesStart = indices.length;
  for (let i = 0; i < N; i++) {
    const iNext = (i + 1) % N;
    const topCurr = sideStartIdx + i * 2;
    const botCurr = sideStartIdx + i * 2 + 1;
    const topNext = sideStartIdx + iNext * 2;
    const botNext = sideStartIdx + iNext * 2 + 1;

    indices.push(topCurr, botCurr, topNext);
    indices.push(topNext, botCurr, botNext);
  }
  const sideIndicesCount = indices.length - sideIndicesStart;

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  // Material groups: Group 0 = side rim, Group 1 = front face (+Y), Group 2 = back face (-Y)
  geometry.addGroup(sideIndicesStart, sideIndicesCount, 0);
  geometry.addGroup(topFaceIndicesStart, topFaceIndicesCount, 1);
  geometry.addGroup(bottomFaceIndicesStart, bottomFaceIndicesCount, 2);

  sharedCardGeometry = geometry;
  return geometry;
};

// Helper to generate and cache canvases (prevents DOM canvas limit crash)
const getCardCanvases = (color: string, value: string) => {
  const cacheKey = `${color}-${value}`;
  if (canvasCache[cacheKey]) {
    return canvasCache[cacheKey];
  }

  // Hi-res face for crisp text/edges even when viewed at oblique angles.
  const W = 512;
  const H = 760;

  const colorMap: Record<string, string> = {
    red: '#ef4444',    // Tailwind red-500
    blue: '#3b82f6',   // Tailwind blue-500
    green: '#22c55e',  // Tailwind green-500
    yellow: '#eab308', // Tailwind yellow-500
    wild: '#171717',   // Tailwind neutral-900
  };

  // Convert an internal value to its UNO glyph.
  const toGlyph = (v: string): string => {
    if (v === 'draw_two') return '+2';
    if (v === 'wild_draw_four') return '+4';
    if (v === 'skip') return '⊘';
    if (v === 'reverse') return '⇄';
    if (v === 'wild') return 'W';
    return v;
  };

  // Rounded-rect path helper.
  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Draw a tilted white center oval with the value drawn inside it.
  const drawCenterOval = (ctx: CanvasRenderingContext2D, body: string, glyph: string, isWild: boolean) => {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 12); // -15deg tilt

    // White oval badge
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, W * 0.34, H * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // For a Wild card, fill the oval with the 4 quadrant colours.
    if (isWild) {
      const quad = [
        { c: '#ef4444', s: Math.PI * 1.5, e: Math.PI * 2.0 }, // red
        { c: '#3b82f6', s: 0,            e: Math.PI * 0.5 }, // blue
        { c: '#eab308', s: Math.PI * 0.5, e: Math.PI * 1.0 }, // yellow
        { c: '#22c55e', s: Math.PI * 1.0, e: Math.PI * 1.5 }, // green
      ];
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, W * 0.30, H * 0.265, 0, 0, Math.PI * 2);
      ctx.clip();
      quad.forEach(({ c, s, e }) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, W * 0.5, s, e);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    }

    // Center value glyph
    ctx.fillStyle = isWild ? '#ffffff' : body;
    ctx.font = `900 ${glyph.length > 1 ? 150 : 200}px "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isWild) {
      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(glyph, 0, 8);
    }
    ctx.fillText(glyph, 0, 8);
    ctx.restore();
  };

  // Draw a small corner index (top-left, and rotated bottom-right).
  const drawCornerIndices = (ctx: CanvasRenderingContext2D, glyph: string) => {
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${glyph.length > 1 ? 64 : 78}px "Arial Black", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.fillText(glyph, 38, 32);

    ctx.save();
    ctx.translate(W - 38, H - 32);
    ctx.rotate(Math.PI);
    ctx.fillText(glyph, 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
  };

  const glyph = toGlyph(value);
  const body = colorMap[color] || '#ffffff';
  const isWild = color === 'wild';

  // ── Front canvas ──
  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = W;
  frontCanvas.height = H;
  const fctx = frontCanvas.getContext('2d');
  if (fctx) {
    // Fill entire canvas edge-to-edge with crisp white card stock
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, W, H);

    // Colored body inset
    fctx.fillStyle = body;
    roundRect(fctx, 22, 22, W - 44, H - 44, 42);
    fctx.fill();

    // Subtle inner border highlight
    fctx.strokeStyle = 'rgba(0,0,0,0.12)';
    fctx.lineWidth = 4;
    roundRect(fctx, 22, 22, W - 44, H - 44, 42);
    fctx.stroke();

    drawCenterOval(fctx, body, glyph, isWild);
    drawCornerIndices(fctx, glyph);
  }

  // ── Back canvas (Playful Bright Unoverse Original Design) ──
  const backCanvas = document.createElement('canvas');
  backCanvas.width = W;
  backCanvas.height = H;
  const bctx = backCanvas.getContext('2d');
  if (bctx) {
    // 1. Edge-to-edge rich royal blue background base
    bctx.fillStyle = '#1d4ed8';
    bctx.fillRect(0, 0, W, H);

    // Vibrant diagonal/radial gradient wash
    const grad = bctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.75);
    grad.addColorStop(0, '#3b82f6');
    grad.addColorStop(0.6, '#1d4ed8');
    grad.addColorStop(1, '#1e1b4b');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, W, H);

    // 2. Playful micro polka dot pattern
    bctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    const dotSpacing = 28;
    for (let x = 14; x < W; x += dotSpacing) {
      for (let y = 14; y < H; y += dotSpacing) {
        const offset = ((Math.floor(x / dotSpacing) + Math.floor(y / dotSpacing)) % 2) * 6;
        bctx.beginPath();
        bctx.arc(x, y + offset, 2.5, 0, Math.PI * 2);
        bctx.fill();
      }
    }

    // 3. Playful Double Borders
    // Outer crisp white rounded frame
    bctx.strokeStyle = '#ffffff';
    bctx.lineWidth = 6;
    roundRect(bctx, 22, 22, W - 44, H - 44, 38);
    bctx.stroke();

    // Inset golden yellow line
    bctx.strokeStyle = '#facc15';
    bctx.lineWidth = 4;
    roundRect(bctx, 32, 32, W - 64, H - 64, 30);
    bctx.stroke();

    // Corner playful 4-pointed golden stars
    const cornerStars = [
      { x: 48, y: 48 },
      { x: W - 48, y: 48 },
      { x: 48, y: H - 48 },
      { x: W - 48, y: H - 48 },
    ];
    cornerStars.forEach(({ x, y }) => {
      bctx.save();
      bctx.translate(x, y);
      bctx.fillStyle = '#fde047';
      bctx.beginPath();
      bctx.moveTo(0, -7);
      bctx.quadraticCurveTo(0, 0, 7, 0);
      bctx.quadraticCurveTo(0, 0, 0, 7);
      bctx.quadraticCurveTo(0, 0, -7, 0);
      bctx.quadraticCurveTo(0, 0, 0, -7);
      bctx.closePath();
      bctx.fill();
      bctx.restore();
    });

    // 4. Central Tilted White Oval Badge with Vibrant 4-Color Unoverse Crest
    bctx.save();
    bctx.translate(W / 2, H / 2);
    bctx.rotate(-Math.PI / 12); // -15deg playful tilt

    // Outer golden shadow ring around oval
    bctx.fillStyle = '#f59e0b';
    bctx.beginPath();
    bctx.ellipse(0, 0, W * 0.36, H * 0.28, 0, 0, Math.PI * 2);
    bctx.fill();

    // White badge oval
    bctx.fillStyle = '#ffffff';
    bctx.beginPath();
    bctx.ellipse(0, 0, W * 0.34, H * 0.26, 0, 0, Math.PI * 2);
    bctx.fill();

    // Inner 4-Color Quadrant Disk for Unoverse (Red, Blue, Yellow, Green)
    const quadR = W * 0.26;
    const quad = [
      { c: '#ef4444', s: Math.PI * 1.5, e: Math.PI * 2.0 }, // red
      { c: '#3b82f6', s: 0,            e: Math.PI * 0.5 }, // blue
      { c: '#eab308', s: Math.PI * 0.5, e: Math.PI * 1.0 }, // yellow
      { c: '#22c55e', s: Math.PI * 1.0, e: Math.PI * 1.5 }, // green
    ];
    bctx.save();
    bctx.beginPath();
    bctx.ellipse(0, 0, quadR, quadR * (H * 0.26 / (W * 0.34)), 0, 0, Math.PI * 2);
    bctx.clip();
    quad.forEach(({ c, s, e }) => {
      bctx.fillStyle = c;
      bctx.beginPath();
      bctx.moveTo(0, 0);
      bctx.arc(0, 0, W * 0.4, s, e);
      bctx.closePath();
      bctx.fill();
    });
    bctx.restore();

    // White ring separator inside quadrant
    bctx.strokeStyle = '#ffffff';
    bctx.lineWidth = 5;
    bctx.beginPath();
    bctx.ellipse(0, 0, quadR, quadR * (H * 0.26 / (W * 0.34)), 0, 0, Math.PI * 2);
    bctx.stroke();

    // Center bold white Unoverse Starburst Emblem (4-pointed star)
    bctx.fillStyle = '#ffffff';
    bctx.beginPath();
    bctx.moveTo(0, -32);
    bctx.quadraticCurveTo(0, 0, 32, 0);
    bctx.quadraticCurveTo(0, 0, 0, 32);
    bctx.quadraticCurveTo(0, 0, -32, 0);
    bctx.quadraticCurveTo(0, 0, 0, -32);
    bctx.closePath();
    bctx.fill();
    bctx.strokeStyle = 'rgba(0,0,0,0.2)';
    bctx.lineWidth = 2;
    bctx.stroke();

    // Central Golden Core Dot
    bctx.fillStyle = '#fde047';
    bctx.beginPath();
    bctx.arc(0, 0, 8, 0, Math.PI * 2);
    bctx.fill();

    bctx.restore();
  }

  const canvases = { front: frontCanvas, back: backCanvas };
  canvasCache[cacheKey] = canvases;
  return canvases;
};

export const PhysicalCard: React.FC<PhysicalCardProps> = ({
  color,
  value,
  isFaceUp,
  position,
  rotation,
  animateSpawn = 'none',
  onClick,
  blankFace = false,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const currentPos = useRef(new THREE.Vector3(...position));
  const isMounted = useRef(false);
  const { gl } = useThree();
  const maxAnisotropy = useMemo(() => gl.capabilities.getMaxAnisotropy(), [gl]);

  const cardGeometry = useMemo(() => getSharedCardGeometry(), []);

  useLayoutEffect(() => {
    if (meshRef.current) {
      if (!isMounted.current && animateSpawn === 'drop') {
        currentPos.current.set(targetPos.x, targetPos.y + 0.5, targetPos.z);
      } else {
        currentPos.current.copy(targetPos);
      }
      meshRef.current.position.copy(currentPos.current);

      const finalRotation = isFaceUp 
        ? rotation 
        : [rotation[0], rotation[1], rotation[2] + Math.PI];
      meshRef.current.rotation.set(finalRotation[0], finalRotation[1], finalRotation[2]);
    }
    isMounted.current = true;
  }, [targetPos, animateSpawn, isFaceUp, rotation]);

  useFrame(() => {
    if (meshRef.current && animateSpawn === 'drop') {
      currentPos.current.lerp(targetPos, 0.15);
      meshRef.current.position.copy(currentPos.current);
    }
  });

  const materials = useMemo(() => {
    const { front, back } = getCardCanvases(color, value);

    const frontTex = new THREE.CanvasTexture(front);
    frontTex.colorSpace = THREE.SRGBColorSpace;
    frontTex.generateMipmaps = true;
    frontTex.minFilter = THREE.LinearMipmapLinearFilter;
    frontTex.magFilter = THREE.LinearFilter;
    frontTex.anisotropy = maxAnisotropy;
    frontTex.needsUpdate = true;

    const backTex = new THREE.CanvasTexture(back);
    backTex.colorSpace = THREE.SRGBColorSpace;
    backTex.generateMipmaps = true;
    backTex.minFilter = THREE.LinearMipmapLinearFilter;
    backTex.magFilter = THREE.LinearFilter;
    backTex.anisotropy = maxAnisotropy;
    backTex.needsUpdate = true;

    const bumpMap = getSharedBumpMap();

    const edgeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0f172a, 
      roughness: 0.7, 
      metalness: 0.1,
      bumpMap: bumpMap,
      bumpScale: 0.0003,
    });
    
    const frontMaterial = blankFace 
      ? new THREE.MeshBasicMaterial({ color: 0x111111 })
      : new THREE.MeshBasicMaterial({ map: frontTex, toneMapped: false });

    const backMaterial = new THREE.MeshBasicMaterial({ 
      map: backTex,
      toneMapped: false
    });

    return [
      edgeMaterial,  // Group 0: side wall
      frontMaterial, // Group 1: top face (+Y)
      backMaterial,  // Group 2: bottom face (-Y)
    ];
  }, [color, value, blankFace, maxAnisotropy]);

  const [hovered, setHovered] = useState(false);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const finalPosition = position;
    const finalRotation = isFaceUp 
      ? rotation 
      : [rotation[0], rotation[1], rotation[2] + Math.PI];

    // Target positions based on hover
    const targetY = hovered && onClick ? finalPosition[1] + 0.05 : finalPosition[1];
    
    // Smoothly interpolate current position and rotation to target
    const dt = 1.0 - Math.exp(-15 * delta); // Frame-rate independent lerp factor

    if (animateSpawn === 'deal') {
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, dt * 0.5);
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, finalRotation[0], dt * 0.5);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, finalRotation[1], dt * 0.5);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, finalRotation[2], dt * 0.5);
    } else {
      meshRef.current.position.lerp(new THREE.Vector3(finalPosition[0], targetY, finalPosition[2]), dt);
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, finalRotation[0], dt);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, finalRotation[1], dt);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, finalRotation[2], dt);
    }

    // Smooth hover emissive glow on side rim
    if (materials[0] && materials[0] instanceof THREE.MeshStandardMaterial) {
      materials[0].emissive.setHex(hovered && onClick ? 0x334155 : 0x000000);
    }
  });

  return (
    <mesh 
      ref={meshRef}
      geometry={cardGeometry}
      material={materials} 
      castShadow 
      receiveShadow
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      onPointerOver={(e) => {
        if (onClick) {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        if (onClick) {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }
      }}
    />
  );
};
