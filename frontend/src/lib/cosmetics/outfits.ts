/**
 * ============================================================================
 *  Player outfit (skin) catalog.
 * ============================================================================
 *
 * A purely COSMETIC wardrobe for the in-game 3D player characters (see
 * `components/table/WebGLSeats.tsx`). An outfit is stored on a profile as a
 * string KEY (exactly like `avatarUrl`); the key is resolved here to a PBR
 * material palette so the same outfit renders identically for every client who
 * sees that player. Outfits never touch gameplay, networking logic, scoring or
 * capacity — they ride the same additive, secret-free broadcast path as `avatar`
 * (profile → resolveProfileIdentity → Player.outfit → publicRoom → client).
 *
 * DESIGN — mirrors `lib/profile/avatars.ts` on purpose so the two catalogs feel
 * identical to work with:
 *   - Keys are STABLE identifiers. Never rename an existing key or a stored
 *     profile would lose its outfit. Add new outfits by APPENDING; the first
 *     entry is the default assigned to brand-new / outfit-less players.
 *   - Everything an outfit needs to render is data here (colours + PBR knobs),
 *     so adding a skin is a one-line catalog entry — no renderer change.
 *   - `arenaAffinity` is an optional hint (which themed world a skin suits) used
 *     only to group/spotlight arena-themed skins in the picker. It is NEVER a
 *     gate: every outfit is selectable and valid in every arena.
 *
 * FUTURE COSMETICS (hair, hats, glasses, gloves, back-bling, …) are modeled
 * separately in `cosmeticSlots.ts` so they can be added without changing this
 * outfit palette or the core character. This file stays focused on the body
 * outfit alone.
 */
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
  /** Short flavour line for the picker. */
  description: string;
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
    description: 'Everyday tee and jeans.',
    primary: '#3b82f6', secondary: '#1e3a5f', accent: '#f8fafc', skin: '#e8b48f', hair: '#3a2a1a',
    metalness: 0.0, roughness: 0.85, emissiveIntensity: 0.0,
    gradient: 'from-sky-400 to-blue-700',
  },
  {
    key: 'hoodie',
    label: 'Hoodie',
    description: 'Cozy pullover hoodie.',
    primary: '#6b7280', secondary: '#374151', accent: '#f59e0b', skin: '#d99a6c', hair: '#1a1410',
    metalness: 0.0, roughness: 0.95, emissiveIntensity: 0.0,
    gradient: 'from-slate-400 to-slate-700',
  },
  {
    key: 'varsity',
    label: 'Varsity',
    description: 'Leather-sleeved varsity jacket.',
    primary: '#b91c1c', secondary: '#f5f5f4', accent: '#facc15', skin: '#c98a5e', hair: '#0e0a06',
    metalness: 0.2, roughness: 0.5, emissiveIntensity: 0.0,
    gradient: 'from-red-500 to-red-800',
  },
  {
    key: 'streetwear',
    label: 'Streetwear',
    description: 'Bold urban techwear.',
    primary: '#18181b', secondary: '#27272a', accent: '#22d3ee', skin: '#b87a52', hair: '#1c1c1c',
    metalness: 0.15, roughness: 0.6, emissiveIntensity: 0.15,
    gradient: 'from-zinc-700 to-black',
  },

  // ---- Arena-themed ---------------------------------------------------------
  {
    key: 'pilot',
    label: 'Star Pilot',
    description: 'Sleek space-station flight suit.',
    arenaAffinity: 'space',
    primary: '#e2e8f0', secondary: '#64748b', accent: '#38bdf8', skin: '#e0aa82', hair: '#2b2b2b',
    metalness: 0.55, roughness: 0.35, emissiveIntensity: 0.6,
    gradient: 'from-slate-200 to-sky-500',
  },
  {
    key: 'explorer',
    label: 'Explorer',
    description: 'Rugged jungle expedition gear.',
    arenaAffinity: 'jungle',
    primary: '#4d7c0f', secondary: '#3f2d1a', accent: '#d9c27a', skin: '#c07d4c', hair: '#2a1c0e',
    metalness: 0.05, roughness: 0.9, emissiveIntensity: 0.0,
    gradient: 'from-lime-700 to-yellow-800',
  },
  {
    key: 'winter',
    label: 'Winter Parka',
    description: 'Insulated glacier parka.',
    arenaAffinity: 'glacier',
    primary: '#0ea5e9', secondary: '#e0f2fe', accent: '#f0f9ff', skin: '#dda57f', hair: '#3a2a1a',
    metalness: 0.0, roughness: 1.0, emissiveIntensity: 0.0,
    gradient: 'from-sky-500 to-cyan-100',
  },
  {
    key: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neon-laced cyber jacket.',
    arenaAffinity: 'cyber',
    primary: '#1e1b4b', secondary: '#0f0f1a', accent: '#f0abfc', skin: '#c88a5e', hair: '#e879f9',
    metalness: 0.4, roughness: 0.4, emissiveIntensity: 1.4,
    gradient: 'from-indigo-900 to-fuchsia-600',
  },
  {
    key: 'adventurer',
    label: 'Adventurer',
    description: 'Ash-worn volcano explorer kit.',
    arenaAffinity: 'volcano',
    primary: '#7c2d12', secondary: '#292524', accent: '#f97316', skin: '#b5734a', hair: '#1a120c',
    metalness: 0.15, roughness: 0.75, emissiveIntensity: 0.2,
    gradient: 'from-orange-800 to-stone-800',
  },
  {
    key: 'tavern',
    label: 'Tavern Garb',
    description: 'Classic leather-and-linen traveler.',
    arenaAffinity: 'classic',
    primary: '#78350f', secondary: '#44280f', accent: '#d6a35c', skin: '#d09564', hair: '#2a1a0e',
    metalness: 0.1, roughness: 0.85, emissiveIntensity: 0.0,
    gradient: 'from-amber-800 to-yellow-950',
  },
];

/** The key assigned to a brand-new / outfit-less player. */
export const DEFAULT_OUTFIT_KEY = OUTFITS[0].key;

const BY_KEY: Record<string, Outfit> = Object.fromEntries(
  OUTFITS.map((o) => [o.key, o]),
);

/**
 * Resolve a stored outfit key to its palette. Unknown / null keys fall back to
 * the default so rendering never breaks on legacy or missing values.
 */
export function getOutfit(key: string | null | undefined): Outfit {
  return (key && BY_KEY[key]) || BY_KEY[DEFAULT_OUTFIT_KEY];
}

/**
 * Deterministically pick an outfit for a player who has none set (profile-less
 * guests, bots). Keyed off the stable player name so the same player always
 * looks the same to everyone, and a table of guests looks varied rather than
 * uniform. Never returns the arena-affinity skins at random — only the neutral
 * everyday set — so unset players read as "default" not "themed".
 */
const NEUTRAL_KEYS = OUTFITS.filter((o) => !o.arenaAffinity).map((o) => o.key);
export function outfitForName(name: string | null | undefined): Outfit {
  if (!name) return BY_KEY[DEFAULT_OUTFIT_KEY];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BY_KEY[NEUTRAL_KEYS[h % NEUTRAL_KEYS.length]];
}
