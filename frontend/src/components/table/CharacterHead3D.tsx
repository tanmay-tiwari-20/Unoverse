import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Outfit } from '../../lib/cosmetics/outfits';
import { getPresetAvatar } from '../../lib/profile/avatars';

interface CharacterHead3DProps {
  outfit: Outfit;
  mats: {
    skin: THREE.Material;
    hair: THREE.Material;
    accent: THREE.Material;
    jacket: THREE.Material;
    trousers?: THREE.Material;
  };
}

// Stable eye material
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x0f172a });

/**
 * High-quality 3D Character Head Renderer
 * Renders custom 3D hair styles, 3D beards & facial hair, and 3D head accessories
 * (headsets, visors, glasses, beanies, crowns) based on the avatar outfit palette.
 */
export const CharacterHead3D: React.FC<CharacterHead3DProps> = ({ outfit, mats }) => {
  // Resolve avatar metadata to get hair style, facial hair, and accessory specs
  const avatarSpec = useMemo(() => {
    return getPresetAvatar(outfit.key);
  }, [outfit.key]);

  const hairStyle = avatarSpec?.details?.hairStyle || '';
  const facialHair = avatarSpec?.details?.facialHair || '';
  const accessory = avatarSpec?.details?.accessory || '';
  const isFemale = avatarSpec?.gender === 'female';

  return (
    <group>
      {/* 1. Base Head Sphere (Skin) */}
      <mesh castShadow material={mats.skin}>
        <sphereGeometry args={[0.12, 20, 20]} />
      </mesh>

      {/* 2. Expressive Eyes */}
      {[-0.045, 0.045].map((x) => (
        <mesh key={`eye${x}`} position={[x, 0.01, 0.108]} material={eyeMaterial}>
          <sphereGeometry args={[0.018, 8, 8]} />
        </mesh>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* 3. 3D HAIRSTYLES                                                   */}
      {/* ------------------------------------------------------------------ */}
      {/* Base Hair Cap */}
      <mesh position={[0, 0.04, -0.02]} scale={[1.06, 0.9, 1.06]} castShadow material={mats.hair}>
        <sphereGeometry args={[0.12, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      </mesh>

      {/* High Bun / Afro Bun / Top Bun (Zara, Tomas, Leo) */}
      {(hairStyle.includes('Bun') || hairStyle.includes('Puff')) && (
        <mesh position={[0, 0.15, -0.01]} scale={[1, 1, 1]} castShadow material={mats.hair}>
          <sphereGeometry args={[0.055, 12, 12]} />
        </mesh>
      )}

      {/* Afro Puff (Amara) */}
      {hairStyle.includes('Afro Puff') && (
        <mesh position={[0, 0.14, -0.01]} scale={[1.3, 1.2, 1.3]} castShadow material={mats.hair}>
          <sphereGeometry args={[0.075, 14, 14]} />
        </mesh>
      )}

      {/* Ponytail (Chloe, Nora) */}
      {hairStyle.includes('Ponytail') && (
        <group position={[0, 0.04, -0.13]} rotation={[0.5, 0, 0]}>
          <mesh castShadow material={mats.hair}>
            <cylinderGeometry args={[0.025, 0.045, 0.14, 8]} />
          </mesh>
        </group>
      )}

      {/* Long Hair Side Locks (Maya, Priya, Aria, Isabella, Keilani, Soraya, Elena) */}
      {(isFemale || hairStyle.includes('Long') || hairStyle.includes('Waves') || hairStyle.includes('Braid')) && (
        <group>
          <mesh position={[-0.11, -0.04, 0.02]} rotation={[0, 0, 0.1]} castShadow material={mats.hair}>
            <boxGeometry args={[0.03, 0.16, 0.08]} />
          </mesh>
          <mesh position={[0.11, -0.04, 0.02]} rotation={[0, 0, -0.1]} castShadow material={mats.hair}>
            <boxGeometry args={[0.03, 0.16, 0.08]} />
          </mesh>
        </group>
      )}

      {/* Slicked Pompadour / Undercut High Front Sweep (Zayn, Alex, Arjun) */}
      {(hairStyle.includes('Pompadour') || hairStyle.includes('Undercut') || hairStyle.includes('Fade')) && (
        <mesh position={[0, 0.12, 0.03]} scale={[1.05, 0.65, 1.25]} castShadow material={mats.hair}>
          <sphereGeometry args={[0.07, 12, 12]} />
        </mesh>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. 3D BEARDS & FACIAL HAIR                                         */}
      {/* ------------------------------------------------------------------ */}
      {/* Full Beard / Boxed Beard (Marcus, Hassan, Arjun, Diego, Kwame) */}
      {(facialHair === 'full_beard' || facialHair === 'boxed_beard' || facialHair === 'short_beard') && (
        <group>
          {/* Beard Jawline Wrap */}
          <mesh position={[0, -0.055, 0.04]} scale={[1.08, 0.65, 0.95]} castShadow material={mats.hair}>
            <sphereGeometry args={[0.09, 12, 12, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.5]} />
          </mesh>
          {/* Mustache Strip */}
          <mesh position={[0, -0.03, 0.112]} material={mats.hair}>
            <boxGeometry args={[0.065, 0.018, 0.025]} />
          </mesh>
        </group>
      )}

      {/* Goatee & Mustache (Zayn, Carlos) */}
      {facialHair === 'goatee' && (
        <group>
          {/* Chin Box */}
          <mesh position={[0, -0.075, 0.095]} material={mats.hair}>
            <boxGeometry args={[0.045, 0.05, 0.04]} />
          </mesh>
          {/* Upper Lip Mustache */}
          <mesh position={[0, -0.03, 0.112]} material={mats.hair}>
            <boxGeometry args={[0.065, 0.018, 0.025]} />
          </mesh>
        </group>
      )}

      {/* Long Viking Beard (Viktor) */}
      {facialHair === 'long_beard' && (
        <group>
          <mesh position={[0, -0.12, 0.06]} rotation={[-0.2, 0, 0]} castShadow material={mats.hair}>
            <coneGeometry args={[0.08, 0.16, 8]} />
          </mesh>
          <mesh position={[0, -0.03, 0.112]} material={mats.hair}>
            <boxGeometry args={[0.07, 0.02, 0.025]} />
          </mesh>
        </group>
      )}

      {/* Mustache & Soul Patch / Chin Beard (Kenji, Mateo, Leo) */}
      {(facialHair === 'mustache_patch' || facialHair === 'chin_beard') && (
        <group>
          <mesh position={[0, -0.03, 0.112]} material={mats.hair}>
            <boxGeometry args={[0.065, 0.018, 0.025]} />
          </mesh>
          <mesh position={[0, -0.07, 0.1]} material={mats.hair}>
            <boxGeometry args={[0.025, 0.03, 0.025]} />
          </mesh>
        </group>
      )}

      {/* 5 O'Clock Heavy Stubble (Tariq, Rex, Alex, Kiran) */}
      {(facialHair === 'heavy_stubble' || facialHair === 'light_stubble') && (
        <mesh position={[0, -0.05, 0.04]} scale={[1.05, 0.5, 0.92]} material={mats.hair}>
          <sphereGeometry args={[0.088, 10, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.45]} />
        </mesh>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. 3D HEAD ACCESSORIES (Headsets, Visors, Glasses, Beanies)        */}
      {/* ------------------------------------------------------------------ */}
      {/* Headsets (Marcus, Maya) */}
      {(accessory.includes('Headset') || accessory.includes('Comms')) && (
        <group>
          {/* Headband */}
          <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.accent}>
            <torusGeometry args={[0.13, 0.012, 8, 16, Math.PI]} />
          </mesh>
          {/* Ear Cups */}
          {[-0.13, 0.13].map((x) => (
            <mesh key={`cup${x}`} position={[x, 0.02, 0]} material={mats.accent}>
              <boxGeometry args={[0.025, 0.06, 0.05]} />
            </mesh>
          ))}
          {/* Cat Ear Accents for Maya */}
          {accessory.includes('Cat-Ear') && (
            <group>
              <mesh position={[-0.08, 0.18, 0]} rotation={[0, 0, -0.2]} material={mats.accent}>
                <coneGeometry args={[0.03, 0.06, 4]} />
              </mesh>
              <mesh position={[0.08, 0.18, 0]} rotation={[0, 0, 0.2]} material={mats.accent}>
                <coneGeometry args={[0.03, 0.06, 4]} />
              </mesh>
            </group>
          )}
        </group>
      )}

      {/* Glasses / Visors (Kenji, Yuki, Zara, Viktor, Chen, Zoe) */}
      {(accessory.includes('Glasses') || accessory.includes('Visor') || accessory.includes('Sunglasses')) && (
        <group position={[0, 0.015, 0.115]}>
          {/* Front Visor/Glasses Bar */}
          <mesh material={mats.accent}>
            <boxGeometry args={[0.11, 0.025, 0.015]} />
          </mesh>
          {/* Glasses Frame Rims */}
          {[-0.035, 0.035].map((x) => (
            <mesh key={`rim${x}`} position={[x, 0, 0.005]} material={mats.accent}>
              <boxGeometry args={[0.035, 0.03, 0.01]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Beanie (Sam) */}
      {accessory.includes('Beanie') && (
        <mesh position={[0, 0.08, -0.01]} scale={[1.12, 0.8, 1.12]} material={mats.jacket}>
          <sphereGeometry args={[0.115, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
      )}
    </group>
  );
};

export default CharacterHead3D;
