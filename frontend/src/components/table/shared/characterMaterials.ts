import * as THREE from 'three';
import { type Outfit } from '../../../lib/cosmetics/outfits';

/**
 * ============================================================================
 *  characterMaterials — shared PBR material system for stylized avatars.
 * ============================================================================
 *
 * PURELY VISUAL. Both the seated in-game characters (`WebGLSeats`) and the
 * standing home/outfit-preview character (`components/home/PreviewCharacter`)
 * build their look from the SAME outfit palette so a player's skin reads
 * identically everywhere. This module owns nothing about pose or placement —
 * only the numeric PBR materials derived from an `Outfit`.
 *
 * A character's materials are a small pool of shared `MeshStandardMaterial`s
 * (5 per character) created once from the palette and disposed on unmount. No
 * textures, no skinned meshes, no morph targets — all colour/PBR is numeric,
 * so there is nothing to stream and nothing to GC beyond the shared materials.
 */

/** One character's shared PBR material set, derived from an outfit palette. */
export interface CharacterMaterials {
  jacket: THREE.MeshStandardMaterial;   // torso / upper garment (primary)
  pants: THREE.MeshStandardMaterial;    // lower body (secondary)
  accent: THREE.MeshStandardMaterial;   // trims / collar / neon (accent + emissive)
  skin: THREE.MeshStandardMaterial;     // face / hands / neck
  hair: THREE.MeshStandardMaterial;     // hair cap
  dispose: () => void;
}

export function buildMaterials(o: Outfit): CharacterMaterials {
  const jacket = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.primary),
    roughness: o.roughness,
    metalness: o.metalness,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.secondary),
    roughness: Math.min(1, o.roughness + 0.05),
    metalness: o.metalness * 0.6,
  });
  const accentColor = new THREE.Color(o.accent);
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: Math.max(0.15, o.roughness - 0.25),
    metalness: Math.min(1, o.metalness + 0.15),
    emissive: accentColor,
    emissiveIntensity: o.emissiveIntensity,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.skin),
    roughness: 0.72,
    metalness: 0.0,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.hair),
    roughness: 0.85,
    metalness: 0.05,
  });
  return {
    jacket, pants, accent, skin, hair,
    dispose: () => {
      jacket.dispose();
      pants.dispose();
      accent.dispose();
      skin.dispose();
      hair.dispose();
    },
  };
}

// A single shared eye material for every character (pure cosmetic, never disposed
// per-character — module-scoped and reused so eyes cost nothing per player).
export const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#141018', roughness: 0.3, metalness: 0.1 });
