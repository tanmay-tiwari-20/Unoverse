import type { ArenaId } from '../arenas/types';

/**
 * A PBR material palette + metadata for one outfit. Colours are hex strings
 * consumed by `meshStandardMaterial`. The renderer maps material zones (jacket,
 * trims/accents, trousers, skin, hair) onto these so a single palette dresses
 * the whole character consistently.
 */
export interface Outfit {
  /** Stable identifier stored on the profile. Never rename. */
  key: string;
  /** Human-readable label shown in the picker. */
  label: string;
  /** Which themed arena this skin is styled for (hint only; never a gate). */
  arenaAffinity?: ArenaId;

  // ---- Material palette (all cosmetic) -------------------------------------
  /** Main garment colour (jacket / hoodie / suit body). */
  primary: string;
  /** Secondary garment colour (trousers / lower body / sleeves). */
  secondary: string;
  /** Accent colour (trims, zips, seams, panels, emissive strips). */
  accent: string;
  /** Skin tone (face / hands). */
  skin: string;
  /** Hair colour. */
  hair: string;
  /** Fabric character: 0 = matte cloth, 1 = polished/metallic (leather≈0.2, suit≈0.6). */
  metalness: number;
  /** Surface roughness: high = cloth, low = leather/plastic/metal. */
  roughness: number;
  /** Accent emissive strength (neon strips, glowing trims). 0 = none. */
  emissiveIntensity: number;
  /** Tailwind gradient for the 2D picker swatch (`from-… to-…`). */
  gradient: string;
}

/**
 * The wardrobe. Order is the display order in the picker; the FIRST entry is the
 * default for players with no outfit set. Append-only — never reorder existing
 * keys out from under stored profiles (order only affects display, but keep it
 * stable for muscle memory).
 */
export const OUTFITS: Outfit[] = [
  // ---- Casual / everyday ----------------------------------------------------
  {
    key: 'casual',
    label: 'Casual',
    primary: '#3b82f6', secondary: '#1e3a5f', accent: '#f8fafc', skin: '#e8b48f', hair: '#3a2a1a',
    metalness: 0.0, roughness: 0.85, emissiveIntensity: 0.0,
    gradient: 'from-sky-400 to-blue-700',
  },
  {
    key: 'hoodie',
    label: 'Hoodie',
    primary: '#6b7280', secondary: '#374151', accent: '#f59e0b', skin: '#d99a6c', hair: '#1a1410',
    metalness: 0.0, roughness: 0.95, emissiveIntensity: 0.0,
    gradient: 'from-slate-400 to-slate-700',
  },
  {
    key: 'varsity',
    label: 'Varsity',
    primary: '#b91c1c', secondary: '#f5f5f4', accent: '#facc15', skin: '#c98a5e', hair: '#0e0a06',
    metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0,
    gradient: 'from-red-500 to-red-800',
  },
  {
    key: 'streetwear',
    label: 'Streetwear',
    primary: '#18181b', secondary: '#27272a', accent: '#22d3ee', skin: '#b87a52', hair: '#1c1c1c',
    metalness: 0.15, roughness: 0.6, emissiveIntensity: 0.15,
    gradient: 'from-zinc-700 to-black',
  },

  {
    key: 'pilot',
    label: 'Star Pilot',
    arenaAffinity: 'space',
    primary: '#e2e8f0', secondary: '#64748b', accent: '#38bdf8', skin: '#e0aa82', hair: '#2b2b2b',
    metalness: 0.55, roughness: 0.35, emissiveIntensity: 0.6,
    gradient: 'from-slate-200 to-sky-500',
  },
  {
    key: 'explorer',
    label: 'Explorer',
    arenaAffinity: 'jungle',
    primary: '#4d7c0f', secondary: '#3f2d1a', accent: '#d9c27a', skin: '#c07d4c', hair: '#2a1c0e',
    metalness: 0.05, roughness: 0.9, emissiveIntensity: 0.0,
    gradient: 'from-lime-700 to-yellow-800',
  },
  {
    key: 'winter',
    label: 'Winter Parka',
    arenaAffinity: 'glacier',
    primary: '#0ea5e9', secondary: '#e0f2fe', accent: '#f0f9ff', skin: '#dda57f', hair: '#3a2a1a',
    metalness: 0.0, roughness: 1.0, emissiveIntensity: 0.0,
    gradient: 'from-sky-500 to-cyan-100',
  },
  {
    key: 'cyberpunk',
    label: 'Cyberpunk',
    arenaAffinity: 'cyber',
    primary: '#1e1b4b', secondary: '#0f0f1a', accent: '#f0abfc', skin: '#c88a5e', hair: '#e879f9',
    metalness: 0.4, roughness: 0.4, emissiveIntensity: 1.4,
    gradient: 'from-indigo-900 to-fuchsia-600',
  },
  {
    key: 'adventurer',
    label: 'Adventurer',
    arenaAffinity: 'volcano',
    primary: '#7c2d12', secondary: '#292524', accent: '#f97316', skin: '#b5734a', hair: '#1a120c',
    metalness: 0.15, roughness: 0.75, emissiveIntensity: 0.2,
    gradient: 'from-orange-800 to-stone-800',
  },
  {
    key: 'tavern',
    label: 'Tavern Garb',
    arenaAffinity: 'classic',
    primary: '#78350f', secondary: '#44280f', accent: '#d6a35c', skin: '#d09564', hair: '#2a1a0e',
    metalness: 0.1, roughness: 0.85, emissiveIntensity: 0.0,
    gradient: 'from-amber-800 to-yellow-950',
  },
];

/** The key assigned to a brand-new / outfit-less player. */
export const DEFAULT_OUTFIT_KEY = OUTFITS[0].key;

/**
 * Key → palette lookup. A `Map` on purpose (not a plain object): stored keys are
 * untrusted strings off a profile / the wire, and a plain object would resolve
 * inherited names like `constructor` or `toString` to a truthy NON-outfit, which
 * would then reach the renderer as undefined colours and NaN PBR values. A Map
 * only ever answers with something we put in it.
 */
const BY_KEY: Map<string, Outfit> = new Map(OUTFITS.map((o) => [o.key, o]));

/** The palette every fallback lands on. Guaranteed present (it's OUTFITS[0]). */
const DEFAULT_OUTFIT: Outfit = OUTFITS[0];

/**
 * Resolve a stored outfit key to its palette. Unknown / null / non-string keys
 * fall back to the default so rendering never breaks on legacy or missing
 * values. Always returns a complete `Outfit` — never undefined, never throws.
 */
export function getOutfit(key: string | null | undefined): Outfit {
  if (typeof key !== 'string' || key.length === 0) return DEFAULT_OUTFIT;
  return BY_KEY.get(key) ?? DEFAULT_OUTFIT;
}

const NEUTRAL_OUTFITS: Outfit[] = OUTFITS.filter((o) => !o.arenaAffinity);
export function outfitForName(name: string | null | undefined): Outfit {
  if (typeof name !== 'string' || name.length === 0) return DEFAULT_OUTFIT;
  if (NEUTRAL_OUTFITS.length === 0) return DEFAULT_OUTFIT;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NEUTRAL_OUTFITS[h % NEUTRAL_OUTFITS.length];
}
