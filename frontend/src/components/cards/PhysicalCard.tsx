import React, { useRef, useMemo, useLayoutEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
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

  // Front canvas
  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = 256;
  frontCanvas.height = 380;
  const fctx = frontCanvas.getContext('2d');
  if (fctx) {
    const colorMap: Record<string, string> = {
      red: '#ef4444',    // Tailwind red-500
      blue: '#3b82f6',   // Tailwind blue-500
      green: '#22c55e',  // Tailwind green-500
      yellow: '#eab308', // Tailwind yellow-500
      wild: '#171717',   // Tailwind neutral-900
    };
    
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, 256, 380);

    fctx.fillStyle = colorMap[color] || '#ffffff';
    fctx.fillRect(10, 10, 236, 360);

    fctx.fillStyle = '#ffffff';
    fctx.beginPath();
    fctx.ellipse(128, 190, 90, 140, 0, 0, 2 * Math.PI);
    fctx.fill();

    fctx.fillStyle = color === 'wild' ? '#000000' : (colorMap[color] || '#000000');
    fctx.font = 'bold 80px sans-serif';
    fctx.textAlign = 'center';
    fctx.textBaseline = 'middle';
    
    let displayVal = value;
    if (value === 'draw_two') displayVal = '+2';
    if (value === 'wild_draw_four') displayVal = '+4';
    if (value === 'skip') displayVal = '⊘';
    if (value === 'reverse') displayVal = '⇄';
    if (value === 'wild') displayVal = 'W';

    fctx.fillText(displayVal, 128, 190);

    fctx.font = 'bold 40px sans-serif';
    fctx.fillStyle = '#ffffff';
    fctx.fillText(displayVal, 40, 50);
    
    fctx.save();
    fctx.translate(216, 330);
    fctx.rotate(Math.PI);
    fctx.fillText(displayVal, 0, 0);
    fctx.restore();
  }

  // Back canvas
  const backCanvas = document.createElement('canvas');
  backCanvas.width = 256;
  backCanvas.height = 380;
  const bctx = backCanvas.getContext('2d');
  if (bctx) {
    bctx.fillStyle = '#ffffff';
    bctx.fillRect(0, 0, 256, 380);

    bctx.fillStyle = '#111111';
    bctx.fillRect(10, 10, 236, 360);

    bctx.fillStyle = '#cc0000';
    bctx.beginPath();
    bctx.ellipse(128, 190, 90, 140, 0, 0, 2 * Math.PI);
    bctx.fill();

    bctx.fillStyle = '#ffe200';
    bctx.font = 'bold 60px sans-serif';
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.save();
    bctx.translate(128, 190);
    bctx.rotate(-Math.PI / 4);
    bctx.fillText('UNO', 0, 0);
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
    frontTex.needsUpdate = true; // Ensure it updates if newly created

    const backTex = new THREE.CanvasTexture(back);
    backTex.colorSpace = THREE.SRGBColorSpace;
    backTex.generateMipmaps = true;
    backTex.minFilter = THREE.LinearMipmapLinearFilter;
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
  }, [color, value]);

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
