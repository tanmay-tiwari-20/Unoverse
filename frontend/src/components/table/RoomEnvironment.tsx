'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSettingsStore } from '../../store/useSettingsStore';

export interface RoomEnvironmentProps {
  numPlayers: number;
  localIndex: number;
  children?: React.ReactNode;
  isLandingPage?: boolean;
}

function CameraSetup({ isLandingPage }: { isLandingPage?: boolean }) {
  const { camera } = useThree();

  useEffect(() => {
    // Initial camera placement
    let radius = 2.24;
    let y = 1.45;
    let z = radius;

    if (isLandingPage) {
      // Cinematic hero shot for the landing page
      y = 1.6;
      z = 3.5;
    }

    camera.position.set(0, y, z);
    if (isLandingPage) {
      camera.lookAt(0, 0.7, 0); // Look slightly lower at the table
    } else {
      camera.lookAt(0, 1.0, 0);
    }

    const perspCam = camera as THREE.PerspectiveCamera;
    perspCam.fov = 75;
    perspCam.updateProjectionMatrix();
  }, [camera, isLandingPage]);

  return null;
}



function Flies() {
  const fly1Ref = useRef<THREE.Group>(null);
  const fly2Ref = useRef<THREE.Group>(null);
  const wings1Ref = useRef<THREE.Group>(null);
  const wings2Ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (fly1Ref.current && wings1Ref.current) {
      fly1Ref.current.position.x = Math.sin(t * 1.5) * 0.3;
      fly1Ref.current.position.y = 1.3 + Math.sin(t * 2.5) * 0.15;
      fly1Ref.current.position.z = Math.cos(t * 1.8) * 0.3;
      fly1Ref.current.rotation.y = t * 10;
      fly1Ref.current.rotation.z = Math.sin(t * 20) * 0.5;
      // Flap wings rapidly
      wings1Ref.current.rotation.x = Math.sin(t * 150) * 0.6;
    }
    if (fly2Ref.current && wings2Ref.current) {
      fly2Ref.current.position.x = Math.sin(t * 1.2 + 2) * 0.4;
      fly2Ref.current.position.y = 1.2 + Math.cos(t * 2.2) * 0.2;
      fly2Ref.current.position.z = Math.cos(t * 1.9 + 1) * 0.25;
      fly2Ref.current.rotation.y = t * 12;
      fly2Ref.current.rotation.z = Math.cos(t * 22) * 0.5;
      // Flap wings rapidly
      wings2Ref.current.rotation.x = Math.cos(t * 180) * 0.6;
    }
  });

  const FlyModel = ({ flyRef, wingsRef, scale }: any) => (
    <group ref={flyRef} scale={scale}>
      {/* Body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.005, 0.015, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0, 0.012]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color="#3a0d0d" roughness={0.5} />
      </mesh>
      {/* Wings */}
      <group ref={wingsRef} position={[0, 0.005, -0.002]}>
        <mesh position={[0.008, 0, -0.005]} rotation={[-Math.PI / 6, 0.3, 0]}>
          <planeGeometry args={[0.012, 0.02]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.008, 0, -0.005]} rotation={[-Math.PI / 6, -0.3, 0]}>
          <planeGeometry args={[0.012, 0.02]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group>
      <FlyModel flyRef={fly1Ref} wingsRef={wings1Ref} scale={1.8} />
      <FlyModel flyRef={fly2Ref} wingsRef={wings2Ref} scale={1.5} />
    </group>
  );
}

function Floor() {
  const plankXPositions = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i < 80; i++) {
      positions.push(-48 + i * 1.2);
    }
    return positions;
  }, []);

  return (
    <group>
      {/* Main floor plane - Infinite scale */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0c0704" roughness={0.9} />
      </mesh>

      {/* Dark plank separation lines */}
      {plankXPositions.map((x, i) => (
        <mesh key={`plank-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, 0]}>
          <planeGeometry args={[0.012, 100]} />
          <meshStandardMaterial color="#050301" roughness={1.0} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function GameTable() {
  const tabletopGeo = useMemo(() => {
    const shape = new THREE.Shape();
    // Reduced by ~20%: X: 1.15, Z: 0.75
    shape.absellipse(0, 0, 1.15, 0.75, 0, Math.PI * 2, false, 0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
      curveSegments: 64,
    });
    return geo;
  }, []);

  const feltGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 1.11, 0.71, 0, Math.PI * 2, false, 0); // Scaled felt
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.004,
      bevelEnabled: false,
      curveSegments: 64,
    });
    return geo;
  }, []);

  const legPositions: [number, number, number][] = useMemo(
    () => [
      [-0.8, 0.39, 0.5],
      [0.8, 0.39, 0.5],
      [-0.8, 0.39, -0.5],
      [0.8, 0.39, -0.5],
    ],
    []
  );

  return (
    <group>
      {/* Tabletop */}
      <mesh geometry={tabletopGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.83, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial 
          color="#1a0a03" 
          roughness={0.65} 
          metalness={0.1} 
          clearcoat={0.3} 
          clearcoatRoughness={0.4} 
        />
      </mesh>

      {/* Felt surface */}
      <mesh geometry={feltGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.875, 0]} receiveShadow>
        <meshStandardMaterial color="#0c331e" roughness={0.95} />
      </mesh>

      {/* Table legs */}
      {legPositions.map(([x, y, z], i) => (
        <group key={`leg-${i}`}>
          <mesh position={[x, y, z]} castShadow>
            <boxGeometry args={[0.12, 0.78, 0.12]} />
            <meshStandardMaterial color="#120602" roughness={0.8} />
          </mesh>
          {/* Foot pad */}
          <mesh position={[x, 0.015, z]}>
            <boxGeometry args={[0.15, 0.03, 0.15]} />
            <meshStandardMaterial color="#0a0301" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Support rails */}
      <mesh position={[-0.8, 0.25, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 1.0]} />
        <meshStandardMaterial color="#120602" roughness={0.8} />
      </mesh>
      <mesh position={[0.8, 0.25, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 1.0]} />
        <meshStandardMaterial color="#120602" roughness={0.8} />
      </mesh>

      {/* Center cross beam */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[1.6, 0.08, 0.08]} />
        <meshStandardMaterial color="#120602" roughness={0.8} />
      </mesh>
    </group>
  );
}

function HangingLamp({ isLandingPage }: { isLandingPage?: boolean }) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const lampGroupRef = useRef<THREE.Group>(null);

  const shadeGeo = useMemo(() => {
    const points = [
      new THREE.Vector2(0.28, 0.00),
      new THREE.Vector2(0.32, 0.02),
      new THREE.Vector2(0.33, 0.06),
      new THREE.Vector2(0.30, 0.12),
      new THREE.Vector2(0.22, 0.18),
      new THREE.Vector2(0.12, 0.23),
      new THREE.Vector2(0.05, 0.26),
      new THREE.Vector2(0.03, 0.27),
    ];
    return new THREE.LatheGeometry(points);
  }, []);

  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
      spotRef.current.shadow.mapSize.set(2048, 2048);
      spotRef.current.shadow.bias = -0.0005;
      spotRef.current.shadow.camera.near = 0.5;
      spotRef.current.shadow.camera.far = 15;
    }
  }, []);

  useFrame(({ clock }) => {
    if (isLandingPage && lampGroupRef.current) {
      const t = clock.getElapsedTime();
      // Extremely subtle, slow swing (about 1 degree)
      lampGroupRef.current.rotation.z = Math.sin(t * 0.5) * 0.015;
      lampGroupRef.current.rotation.x = Math.cos(t * 0.4) * 0.01;
    }
  });

  return (
    <group ref={lampGroupRef}>
      {/* Ceiling mount */}
      <mesh position={[0, 3.98, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.04, 16]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
      </mesh>

      {/* Cable */}
      <mesh position={[0, 2.75, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 2.5, 8]} />
        <meshStandardMaterial color="#111111" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Shade */}
      <mesh geometry={shadeGeo} position={[0, 1.5, 0]} castShadow>
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Shade rim ring */}
      <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.27, 0.29, 32]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* Dramatic Spotlight (Light comes from INSIDE shade) */}
      <spotLight
        ref={spotRef}
        position={[0, 1.65, 0]}
        angle={Math.PI / 2.8}
        penumbra={0.85}
        intensity={60}
        color="#ffcc77"
        castShadow
        distance={10}
        decay={2}
      />

      {/* Tiny dark flies buzzing around the lamp */}
      <Flies />

      {/* Spotlight target */}
      <object3D ref={targetRef} position={[0, 0.85, 0]} />

      {/* Inner glow point light inside shade */}
      <pointLight position={[0, 1.58, 0]} intensity={2.0} color="#ffb040" distance={2.5} decay={2} />

      {/* Front Fill Light for Player Cards */}
      <pointLight position={[0, 1.8, 2.8]} intensity={15.0} color="#ffffff" distance={8} decay={1.5} />
    </group>
  );
}

function RoomProps() {
  return (
    <group>
      {/* Dim ambient light to make the room subtly visible */}
      <ambientLight intensity={0.4} color="#ffffff" />
      {/* A dim point light high up to wash the walls and roof */}
      <pointLight position={[0, 2.5, 0]} intensity={6.0} color="#ffddaa" distance={15} decay={1.5} />

      {/* Roof */}
      <mesh position={[0, 4.0, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#3d2f26" roughness={1.0} />
      </mesh>

      {/* Back Wall & Props */}
      <group position={[0, 0, -4.5]}>
        {/* Wall */}
        <mesh position={[0, 2.5, -0.1]} receiveShadow>
          <planeGeometry args={[20, 10]} />
          <meshStandardMaterial color="#4a3b32" roughness={1.0} />
        </mesh>
        
        {/* Wooden Shelf */}
        <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 0.05, 0.4]} />
          <meshStandardMaterial color="#5c3a21" roughness={0.9} />
        </mesh>
        {/* Shelf Brackets */}
        <mesh position={[-1.2, 1.65, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.3, 0.3]} />
          <meshStandardMaterial color="#2a1f1a" roughness={0.8} />
        </mesh>
        <mesh position={[1.2, 1.65, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.3, 0.3]} />
          <meshStandardMaterial color="#2a1f1a" roughness={0.8} />
        </mesh>

        {/* Old Books */}
        <mesh position={[-1.0, 1.95, 0]} rotation={[0, 0, 0.1]} castShadow>
          <boxGeometry args={[0.08, 0.25, 0.2]} />
          <meshStandardMaterial color="#3a1c1c" roughness={0.9} />
        </mesh>
        <mesh position={[-0.9, 1.94, 0]} castShadow>
          <boxGeometry args={[0.06, 0.24, 0.22]} />
          <meshStandardMaterial color="#1c243a" roughness={0.9} />
        </mesh>
        <mesh position={[-0.82, 1.95, 0]} castShadow>
          <boxGeometry args={[0.07, 0.26, 0.19]} />
          <meshStandardMaterial color="#243a1c" roughness={0.9} />
        </mesh>

        {/* Small Storage / Card Game Boxes */}
        <mesh position={[0.5, 1.88, 0]} rotation={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.3, 0.1, 0.2]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>
        <mesh position={[0.55, 1.98, 0]} rotation={[0, 0.1, 0]} castShadow>
          <boxGeometry args={[0.2, 0.08, 0.15]} />
          <meshStandardMaterial color="#3a1818" roughness={0.7} />
        </mesh>
      </group>

      {/* Side Wall & Props (Right Side) */}
      <group position={[4.5, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Wall */}
        <mesh position={[0, 2.5, -0.1]} receiveShadow>
          <planeGeometry args={[20, 10]} />
          <meshStandardMaterial color="#4a3b32" roughness={1.0} />
        </mesh>

        {/* Framed Vintage Poster */}
        <group position={[-1, 2.0, 0.02]}>
          {/* Frame */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.9, 1.3, 0.04]} />
            <meshStandardMaterial color="#2a1a10" roughness={0.8} />
          </mesh>
          {/* Canvas/Poster Image Area */}
          <mesh position={[0, 0, 0.022]}>
            <planeGeometry args={[0.8, 1.2]} />
            <meshStandardMaterial color="#140a05" roughness={0.9} />
          </mesh>
        </group>

        {/* Wall Clock */}
        <group position={[1.5, 2.5, 0]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
          </mesh>
          {/* Clock Face */}
          <mesh position={[0, 0, 0.026]}>
            <circleGeometry args={[0.26, 32]} />
            <meshStandardMaterial color="#1a1816" roughness={0.9} />
          </mesh>
        </group>

        {/* Coat Hook */}
        <group position={[1.5, 1.5, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.05, 0.1, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0.05]} castShadow rotation={[-0.2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.1, 8]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.5} />
          </mesh>
        </group>
      </group>

      {/* Left Wall to enclose the room */}
      <group position={[-4.5, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 2.5, -0.1]} receiveShadow>
          <planeGeometry args={[20, 10]} />
          <meshStandardMaterial color="#4a3b32" roughness={1.0} />
        </mesh>
      </group>

      {/* Corner Props (Back Left Corner) */}
      <group position={[-3.5, 0, -3.5]} rotation={[0, Math.PI / 4, 0]}>
        {/* Standing Lamp (Off) */}
        <group position={[-0.5, 0, -0.5]}>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.25, 0.04, 16]} />
            <meshStandardMaterial color="#050505" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 1.6, 8]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.8} />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.25, 0.3, 16]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
          </mesh>
        </group>

        {/* Small Cabinet */}
        <mesh position={[0.5, 0.4, 0.2]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.8, 0.5]} />
          <meshStandardMaterial color="#3a2518" roughness={0.9} />
        </mesh>

        {/* Chair */}
        <group position={[-0.5, 0, 0.8]} rotation={[0, -0.3, 0]}>
          {/* Seat */}
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.4, 0.04, 0.4]} />
            <meshStandardMaterial color="#0a0502" roughness={0.8} />
          </mesh>
          {/* Backrest */}
          <mesh position={[0, 0.75, -0.18]} castShadow receiveShadow>
            <boxGeometry args={[0.35, 0.3, 0.04]} />
            <meshStandardMaterial color="#0a0502" roughness={0.8} />
          </mesh>
          {/* Legs */}
          <mesh position={[-0.16, 0.225, 0.16]} castShadow>
            <boxGeometry args={[0.04, 0.45, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
          <mesh position={[0.16, 0.225, 0.16]} castShadow>
            <boxGeometry args={[0.04, 0.45, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
          <mesh position={[-0.16, 0.4, -0.16]} castShadow>
            <boxGeometry args={[0.04, 0.8, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
          <mesh position={[0.16, 0.4, -0.16]} castShadow>
            <boxGeometry args={[0.04, 0.8, 0.04]} />
            <meshStandardMaterial color="#050201" roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Scene({ numPlayers, localIndex, isLandingPage, children }: RoomEnvironmentProps) {
  const { cameraMotion, cameraSensitivity, shadowQuality, performanceMode } = useSettingsStore();

  return (
    <>
      <CameraSetup isLandingPage={isLandingPage} />
      <OrbitControls 
        makeDefault
        target={[0, 0.9, 0]}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.2} // Keep camera strictly above table horizon
        minAzimuthAngle={-Math.PI / 3}
        maxAzimuthAngle={Math.PI / 3}
        minDistance={1.5}
        maxDistance={4.0}
        enableDamping={true}
        dampingFactor={0.03}
        enableRotate={cameraMotion}
        enablePan={cameraMotion}
        enableZoom={cameraMotion}
        rotateSpeed={cameraSensitivity / 50}
      />
      <fog attach="fog" args={['#080402', 15, 50]} />
      
      {/* Dim ambient room visibility (deep dark blue/brown) */}
      <hemisphereLight args={['#18120c', '#080402', 0.8]} />

      {/* Under-table bounce light for table legs */}
      <pointLight 
        position={[0, 0.4, 0]} 
        intensity={performanceMode ? 15 : 30} 
        color="#ffaa55" 
        distance={5} 
        decay={2} 
        castShadow={!performanceMode && shadowQuality !== 'low'} 
      />

      <Floor />
      <GameTable />
      <HangingLamp isLandingPage={isLandingPage} />
      <RoomProps />
      {children}
    </>
  );
}

export const RoomEnvironment: React.FC<RoomEnvironmentProps> = ({ numPlayers, localIndex, isLandingPage, children }) => {
  const { performanceMode, shadowQuality, postProcessing } = useSettingsStore();
  const enableShadows = !performanceMode && shadowQuality !== 'low';

  return (
    <Canvas
      shadows={enableShadows}
      camera={{ fov: 60, near: 0.1, far: 100 }}
      gl={{
        antialias: postProcessing,
        toneMapping: postProcessing ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping,
        toneMappingExposure: 0.9,
      }}
      style={{ background: '#020101', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <Scene numPlayers={numPlayers} localIndex={localIndex} isLandingPage={isLandingPage}>
        {children}
      </Scene>
    </Canvas>
  );
}
