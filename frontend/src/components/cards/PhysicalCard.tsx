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
    ctx.rotate(-Math.PI / 12); // -15deg tilt, matching the HTML hand card

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
    // White rounded card stock
    fctx.fillStyle = '#ffffff';
    roundRect(fctx, 0, 0, W, H, 56);
    fctx.fill();

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

  // ── Back canvas ──
  const backCanvas = document.createElement('canvas');
  backCanvas.width = W;
  backCanvas.height = H;
  const bctx = backCanvas.getContext('2d');
  if (bctx) {
    bctx.fillStyle = '#ffffff';
    roundRect(bctx, 0, 0, W, H, 56);
    bctx.fill();

    bctx.fillStyle = '#111111';
    roundRect(bctx, 22, 22, W - 44, H - 44, 42);
    bctx.fill();

    // Red center ellipse
    bctx.fillStyle = '#cc0000';
    bctx.save();
    bctx.translate(W / 2, H / 2);
    bctx.rotate(-Math.PI / 12);
    bctx.beginPath();
    bctx.ellipse(0, 0, W * 0.36, H * 0.30, 0, 0, Math.PI * 2);
    bctx.fill();

    // UNO wordmark
    bctx.fillStyle = '#ffe200';
    bctx.font = '900 120px "Arial Black", sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.lineWidth = 10;
    bctx.strokeStyle = 'rgba(0,0,0,0.5)';
    bctx.strokeText('UNO', 0, 6);
    bctx.fillText('UNO', 0, 6);
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
    frontTex.anisotropy = maxAnisotropy; // Keep face crisp at grazing angles
    frontTex.needsUpdate = true; // Ensure it updates if newly created

    const backTex = new THREE.CanvasTexture(back);
    backTex.colorSpace = THREE.SRGBColorSpace;
    backTex.generateMipmaps = true;
    backTex.minFilter = THREE.LinearMipmapLinearFilter;
    backTex.magFilter = THREE.LinearFilter;
    backTex.anisotropy = maxAnisotropy;
    backTex.needsUpdate = true;

    const bumpMap = getSharedBumpMap();

    const premiumCardStock = {
      roughness: 0.65,         // Semi-matte finish
      metalness: 0.05,         // Slight density
      clearcoat: 0.35,         // Premium coated finish
      clearcoatRoughness: 0.4, // Soft reflections
      bumpMap: bumpMap,
      bumpScale: 0.0003,       // Extremely subtle texture only visible in light
    };
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 });
    const frontMaterial = blankFace 
      ? new THREE.MeshBasicMaterial({ color: 0x111111 })
      : new THREE.MeshBasicMaterial({ map: frontTex, toneMapped: false });
    const backMaterial = new THREE.MeshBasicMaterial({ 
      map: backTex,
      toneMapped: false
    });

    return [
      edgeMaterial,  // +x
      edgeMaterial,  // -x
      frontMaterial, // +y
      backMaterial,  // -y
      edgeMaterial,  // +z
      edgeMaterial,  // -z
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

    // Smooth hover emissive glow
    (materials[4] as THREE.MeshStandardMaterial).emissive.setHex(hovered && onClick ? 0x222222 : 0x000000);
    (materials[5] as THREE.MeshStandardMaterial).emissive.setHex(hovered && onClick ? 0x222222 : 0x000000);
  });

  return (
    <mesh 
      ref={meshRef} 
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
      onPointerOut={(e) => {
        if (onClick) {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }
      }}
    >
      <boxGeometry args={[0.124, 0.002, 0.184]} />
    </mesh>
  );
};
