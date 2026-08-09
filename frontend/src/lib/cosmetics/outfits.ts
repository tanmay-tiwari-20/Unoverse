import type { ArenaId } from '../arenas/types';

/**
 * A PBR material palette + metadata for one outfit / avatar character.
 * Colours are hex strings consumed by `meshStandardMaterial`.
 */
export interface Outfit {
  /** Stable identifier stored on the profile. Never rename. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Which themed arena this skin is styled for (hint only; never a gate). */
  arenaAffinity?: ArenaId;

  // ---- Material palette ----------------------------------------------------
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
  /** Fabric character: 0 = matte cloth, 1 = polished/metallic. */
  metalness: number;
  /** Surface roughness: high = cloth, low = leather/plastic/metal. */
  roughness: number;
  /** Accent emissive strength (neon strips, glowing trims). 0 = none. */
  emissiveIntensity: number;
  /** Tailwind gradient for the 2D picker swatch (`from-… to-…`). */
  gradient: string;
}

/**
 * 3D PBR Material Palettes corresponding to the 40 Human Avatar Characters.
 */
export const AVATAR_OUTFITS: Outfit[] = [
  // MALE AVATAR CHARACTER OUTFITS
  { key: 'm_alex', label: 'Alex', primary: '#d97706', secondary: '#b45309', accent: '#fef3c7', skin: '#e5a97d', hair: '#1c1917', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-amber-500 to-yellow-700' },
  { key: 'm_marcus', label: 'Marcus', primary: '#0f172a', secondary: '#1e293b', accent: '#06b6d4', skin: '#784421', hair: '#0f172a', metalness: 0.3, roughness: 0.5, emissiveIntensity: 0.8, gradient: 'from-cyan-500 to-blue-700' },
  { key: 'm_kai', label: 'Kai', primary: '#18181b', secondary: '#27272a', accent: '#a855f7', skin: '#fce4ec', hair: '#e2e8f0', metalness: 0.6, roughness: 0.35, emissiveIntensity: 1.0, gradient: 'from-indigo-500 to-purple-800' },
  { key: 'm_diego', label: 'Diego', primary: '#78350f', secondary: '#991b1b', accent: '#fca5a5', skin: '#d99b66', hair: '#271c19', metalness: 0.2, roughness: 0.7, emissiveIntensity: 0.0, gradient: 'from-orange-500 to-amber-700' },
  { key: 'm_ethan', label: 'Ethan', primary: '#1d4ed8', secondary: '#64748b', accent: '#fef08a', skin: '#ffd6b8', hair: '#eab308', metalness: 0.0, roughness: 0.85, emissiveIntensity: 0.0, gradient: 'from-blue-400 to-indigo-600' },
  { key: 'm_zayn', label: 'Zayn', primary: '#065f46', secondary: '#022c22', accent: '#fbbf24', skin: '#c68b59', hair: '#1e1b4b', metalness: 0.4, roughness: 0.4, emissiveIntensity: 0.0, gradient: 'from-emerald-500 to-teal-700' },
  { key: 'm_viktor', label: 'Viktor', primary: '#09090b', secondary: '#18181b', accent: '#db2777', skin: '#f3d0be', hair: '#09090b', metalness: 0.5, roughness: 0.3, emissiveIntensity: 1.2, gradient: 'from-fuchsia-600 to-purple-900' },
  { key: 'm_tariq', label: 'Tariq', primary: '#be123c', secondary: '#f8fafc', accent: '#fbbf24', skin: '#523119', hair: '#171717', metalness: 0.1, roughness: 0.6, emissiveIntensity: 0.0, gradient: 'from-rose-500 to-red-700' },
  { key: 'm_leo', label: 'Leo', primary: '#3f6212', secondary: '#15803d', accent: '#fef08a', skin: '#f7d6c2', hair: '#9a3412', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-lime-600 to-green-800' },
  { key: 'm_kenji', label: 'Kenji', primary: '#334155', secondary: '#0f172a', accent: '#f8fafc', skin: '#f4c29d', hair: '#0c0a09', metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-slate-600 to-slate-800' },
  { key: 'm_sam', label: 'Sam', primary: '#ca8a04', secondary: '#a16207', accent: '#fef08a', skin: '#d4996a', hair: '#261914', metalness: 0.0, roughness: 0.9, emissiveIntensity: 0.0, gradient: 'from-yellow-500 to-orange-600' },
  { key: 'm_rex', label: 'Rex', primary: '#312e81', secondary: '#1e1b4b', accent: '#6366f1', skin: '#aa6c39', hair: '#64748b', metalness: 0.6, roughness: 0.3, emissiveIntensity: 0.9, gradient: 'from-violet-600 to-slate-800' },
  { key: 'm_arjun', label: 'Arjun', primary: '#0369a1', secondary: '#0f172a', accent: '#38bdf8', skin: '#b5794c', hair: '#171717', metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-sky-600 to-blue-800' },
  { key: 'm_carlos', label: 'Carlos', primary: '#b45309', secondary: '#451a03', accent: '#fbbf24', skin: '#c98a58', hair: '#1c1917', metalness: 0.2, roughness: 0.6, emissiveIntensity: 0.0, gradient: 'from-amber-600 to-red-700' },
  { key: 'm_hassan', label: 'Hassan', primary: '#115e59', secondary: '#042f2e', accent: '#fef08a', skin: '#bd8357', hair: '#09090b', metalness: 0.3, roughness: 0.4, emissiveIntensity: 0.0, gradient: 'from-teal-600 to-emerald-800' },
  { key: 'm_kwame', label: 'Kwame', primary: '#047857', secondary: '#065f46', accent: '#fbbf24', skin: '#4a2c17', hair: '#0f172a', metalness: 0.1, roughness: 0.85, emissiveIntensity: 0.0, gradient: 'from-emerald-500 to-green-700' },
  { key: 'm_chen', label: 'Chen', primary: '#1e293b', secondary: '#0f172a', accent: '#38bdf8', skin: '#f5ccaa', hair: '#1c1917', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-blue-500 to-indigo-700' },
  { key: 'm_mateo', label: 'Mateo', primary: '#c2410c', secondary: '#431407', accent: '#fbbf24', skin: '#aa6d3f', hair: '#18181b', metalness: 0.2, roughness: 0.7, emissiveIntensity: 0.0, gradient: 'from-orange-600 to-red-800' },
  { key: 'm_tomas', label: 'Tomas', primary: '#0284c7', secondary: '#0369a1', accent: '#fef08a', skin: '#fae3d9', hair: '#fef08a', metalness: 0.0, roughness: 0.9, emissiveIntensity: 0.0, gradient: 'from-cyan-500 to-blue-600' },
  { key: 'm_kiran', label: 'Kiran', primary: '#d97706', secondary: '#78350f', accent: '#fef08a', skin: '#aa7349', hair: '#261914', metalness: 0.1, roughness: 0.7, emissiveIntensity: 0.0, gradient: 'from-yellow-500 to-amber-700' },

  // FEMALE AVATAR CHARACTER OUTFITS
  { key: 'f_maya', label: 'Maya', primary: '#18181b', secondary: '#ec4899', accent: '#38bdf8', skin: '#d89c72', hair: '#581c87', metalness: 0.3, roughness: 0.5, emissiveIntensity: 1.0, gradient: 'from-purple-500 to-pink-600' },
  { key: 'f_sophia', label: 'Sophia', primary: '#2dd4bf', secondary: '#ccfbf1', accent: '#fbbf24', skin: '#fde2d4', hair: '#18181b', metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-teal-400 to-emerald-600' },
  { key: 'f_zara', label: 'Zara', primary: '#d97706', secondary: '#78350f', accent: '#fbbf24', skin: '#5c361a', hair: '#09090b', metalness: 0.4, roughness: 0.4, emissiveIntensity: 0.0, gradient: 'from-amber-400 to-orange-600' },
  { key: 'f_elena', label: 'Elena', primary: '#854d0e', secondary: '#dc2626', accent: '#fef08a', skin: '#ca8a4b', hair: '#7c2d12', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-yellow-600 to-amber-800' },
  { key: 'f_chloe', label: 'Chloe', primary: '#f43f5e', secondary: '#fef08a', accent: '#fbbf24', skin: '#ffe4d6', hair: '#facc15', metalness: 0.1, roughness: 0.7, emissiveIntensity: 0.0, gradient: 'from-pink-400 to-rose-600' },
  { key: 'f_yuki', label: 'Yuki', primary: '#f8fafc', secondary: '#0ea5e9', accent: '#06b6d4', skin: '#fef3c7', hair: '#030712', metalness: 0.6, roughness: 0.3, emissiveIntensity: 1.0, gradient: 'from-cyan-400 to-sky-700' },
  { key: 'f_nora', label: 'Nora', primary: '#0284c7', secondary: '#f0f9ff', accent: '#fbbf24', skin: '#6b4122', hair: '#1c1917', metalness: 0.1, roughness: 0.6, emissiveIntensity: 0.0, gradient: 'from-sky-400 to-blue-700' },
  { key: 'f_aria', label: 'Aria', primary: '#a855f7', secondary: '#f472b6', accent: '#fef08a', skin: '#fce7f3', hair: '#f472b6', metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-fuchsia-400 to-purple-600' },
  { key: 'f_priya', label: 'Priya', primary: '#1d4ed8', secondary: '#fbbf24', accent: '#dc2626', skin: '#b87a4b', hair: '#171717', metalness: 0.3, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-blue-600 to-indigo-800' },
  { key: 'f_zoe', label: 'Zoe', primary: '#18181b', secondary: '#e11d48', accent: '#06b6d4', skin: '#fbd5c0', hair: '#0891b2', metalness: 0.4, roughness: 0.4, emissiveIntensity: 0.0, gradient: 'from-rose-600 to-red-800' },
  { key: 'f_leila', label: 'Leila', primary: '#eab308', secondary: '#ca8a04', accent: '#475569', skin: '#be8452', hair: '#291a10', metalness: 0.0, roughness: 0.9, emissiveIntensity: 0.0, gradient: 'from-amber-500 to-yellow-700' },
  { key: 'f_nova', label: 'Nova', primary: '#4338ca', secondary: '#f59e0b', accent: '#fbbf24', skin: '#a36838', hair: '#d97706', metalness: 0.5, roughness: 0.35, emissiveIntensity: 0.8, gradient: 'from-violet-500 to-indigo-700' },
  { key: 'f_aisha', label: 'Aisha', primary: '#047857', secondary: '#065f46', accent: '#fbbf24', skin: '#ba7d52', hair: '#18181b', metalness: 0.2, roughness: 0.6, emissiveIntensity: 0.0, gradient: 'from-emerald-600 to-teal-800' },
  { key: 'f_lin', label: 'Lin', primary: '#4c1d95', secondary: '#1e1b4b', accent: '#c084fc', skin: '#f3c7a6', hair: '#4c1d95', metalness: 0.3, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-purple-600 to-indigo-800' },
  { key: 'f_amara', label: 'Amara', primary: '#ca8a04', secondary: '#fef08a', accent: '#fbbf24', skin: '#4a2c17', hair: '#09090b', metalness: 0.2, roughness: 0.6, emissiveIntensity: 0.0, gradient: 'from-amber-500 to-orange-700' },
  { key: 'f_fatima', label: 'Fatima', primary: '#059669', secondary: '#047857', accent: '#fbbf24', skin: '#bd8054', hair: '#171717', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-emerald-500 to-teal-700' },
  { key: 'f_isabella', label: 'Isabella', primary: '#e11d48', secondary: '#be123c', accent: '#f43f5e', skin: '#c68a5c', hair: '#1c1917', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-rose-500 to-pink-700' },
  { key: 'f_freja', label: 'Freja', primary: '#0284c7', secondary: '#0369a1', accent: '#fef08a', skin: '#fae3d9', hair: '#fef08a', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-sky-500 to-blue-700' },
  { key: 'f_keilani', label: 'Keilani', primary: '#0d9488', secondary: '#0f766e', accent: '#06b6d4', skin: '#b4774b', hair: '#18181b', metalness: 0.1, roughness: 0.8, emissiveIntensity: 0.0, gradient: 'from-teal-500 to-cyan-700' },
  { key: 'f_soraya', label: 'Soraya', primary: '#7e22ce', secondary: '#6b21a8', accent: '#fbbf24', skin: '#c28557', hair: '#09090b', metalness: 0.3, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-fuchsia-500 to-purple-700' },
];

/** Legacy style outfit options preserved for fallback. */
export const OUTFITS: Outfit[] = [
  ...AVATAR_OUTFITS,
  { key: 'casual', label: 'Casual', primary: '#3b82f6', secondary: '#1e3a5f', accent: '#f8fafc', skin: '#e8b48f', hair: '#3a2a1a', metalness: 0.0, roughness: 0.85, emissiveIntensity: 0.0, gradient: 'from-sky-400 to-blue-700' },
  { key: 'hoodie', label: 'Hoodie', primary: '#6b7280', secondary: '#374151', accent: '#f59e0b', skin: '#d99a6c', hair: '#1a1410', metalness: 0.0, roughness: 0.95, emissiveIntensity: 0.0, gradient: 'from-slate-400 to-slate-700' },
  { key: 'varsity', label: 'Varsity', primary: '#b91c1c', secondary: '#f5f5f4', accent: '#facc15', skin: '#c98a5e', hair: '#0e0a06', metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0, gradient: 'from-red-500 to-red-800' },
  { key: 'streetwear', label: 'Streetwear', primary: '#18181b', secondary: '#27272a', accent: '#22d3ee', skin: '#b87a52', hair: '#1c1c1c', metalness: 0.15, roughness: 0.6, emissiveIntensity: 0.15, gradient: 'from-zinc-700 to-black' },
  { key: 'pilot', label: 'Star Pilot', arenaAffinity: 'space', primary: '#e2e8f0', secondary: '#64748b', accent: '#38bdf8', skin: '#e0aa82', hair: '#2b2b2b', metalness: 0.55, roughness: 0.35, emissiveIntensity: 0.6, gradient: 'from-slate-200 to-sky-500' },
  { key: 'explorer', label: 'Explorer', arenaAffinity: 'jungle', primary: '#4d7c0f', secondary: '#3f2d1a', accent: '#d9c27a', skin: '#c07d4c', hair: '#2a1c0e', metalness: 0.05, roughness: 0.9, emissiveIntensity: 0.0, gradient: 'from-lime-700 to-yellow-800' },
  { key: 'winter', label: 'Winter Parka', arenaAffinity: 'glacier', primary: '#0ea5e9', secondary: '#e0f2fe', accent: '#f0f9ff', skin: '#dda57f', hair: '#3a2a1a', metalness: 0.0, roughness: 1.0, emissiveIntensity: 0.0, gradient: 'from-sky-500 to-cyan-100' },
  { key: 'cyberpunk', label: 'Cyberpunk', arenaAffinity: 'cyber', primary: '#1e1b4b', secondary: '#0f0f1a', accent: '#f0abfc', skin: '#c88a5e', hair: '#e879f9', metalness: 0.4, roughness: 0.4, emissiveIntensity: 1.4, gradient: 'from-indigo-900 to-fuchsia-600' },
  { key: 'adventurer', label: 'Adventurer', arenaAffinity: 'volcano', primary: '#7c2d12', secondary: '#292524', accent: '#f97316', skin: '#b5734a', hair: '#1a120c', metalness: 0.15, roughness: 0.75, emissiveIntensity: 0.2, gradient: 'from-orange-800 to-stone-800' },
  { key: 'tavern', label: 'Tavern Garb', arenaAffinity: 'classic', primary: '#78350f', secondary: '#44280f', accent: '#d6a35c', skin: '#d09564', hair: '#2a1a0e', metalness: 0.1, roughness: 0.85, emissiveIntensity: 0.0, gradient: 'from-amber-800 to-yellow-950' },
];

/** Legacy fallback map for animal/icon avatar keys */
const LEGACY_AVATAR_OUTFIT_MAP: Record<string, string> = {
  rocket: 'm_kai',
  cat: 'f_maya',
  dog: 'm_alex',
  bird: 'f_sophia',
  rabbit: 'f_chloe',
  fish: 'f_elena',
  ghost: 'f_aria',
  robot: 'm_viktor',
  crown: 'm_zayn',
  gamepad: 'm_marcus',
  bolt: 'm_tariq',
  star: 'f_priya',
  flame: 'm_diego',
  sparkles: 'f_zara',
  skull: 'f_zoe',
  diamond: 'm_kenji',
};

/** The key assigned to a brand-new / outfit-less player. */
export const DEFAULT_OUTFIT_KEY = AVATAR_OUTFITS[0].key;

const BY_KEY: Map<string, Outfit> = new Map(OUTFITS.map((o) => [o.key, o]));
const DEFAULT_OUTFIT: Outfit = AVATAR_OUTFITS[0];

/**
 * Resolves an avatar key or outfit key to its 3D character PBR material palette.
 * Automatically synchronizes the 3D character mannequin to resemble the chosen avatar character.
 */
export function getOutfit(key: string | null | undefined): Outfit {
  if (typeof key !== 'string' || key.length === 0) return DEFAULT_OUTFIT;

  // Direct key lookup (avatar character key or outfit key)
  if (BY_KEY.has(key)) {
    return BY_KEY.get(key)!;
  }

  // Legacy avatar key lookup
  const legacyMapped = LEGACY_AVATAR_OUTFIT_MAP[key];
  if (legacyMapped && BY_KEY.has(legacyMapped)) {
    return BY_KEY.get(legacyMapped)!;
  }

  return DEFAULT_OUTFIT;
}

const NEUTRAL_OUTFITS: Outfit[] = OUTFITS.filter((o) => !o.arenaAffinity);
export function outfitForName(name: string | null | undefined): Outfit {
  if (typeof name !== 'string' || name.length === 0) return DEFAULT_OUTFIT;
  if (NEUTRAL_OUTFITS.length === 0) return DEFAULT_OUTFIT;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NEUTRAL_OUTFITS[h % NEUTRAL_OUTFITS.length];
}
