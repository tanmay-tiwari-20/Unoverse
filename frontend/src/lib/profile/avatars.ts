/**
 * ============================================================================
 *  Unoverse Global Human Avatar Catalog & Identity System
 * ============================================================================
 *
 * Polished multiplayer human character avatar collection representing a rich
 * global spectrum of ethnicities, skin tones, hairstyles, facial hair,
 * accessories, and styles.
 *
 * Contains 40 distinct human character presets (20 Male, 20 Female).
 */

export interface PresetAvatarDetails {
  hairStyle: string;
  facialHair?: string;
  accessory?: string;
  clothing: string;
}

export interface PresetAvatar {
  key: string;
  name: string;
  gender: 'male' | 'female';
  style:
    | 'Streetwear'
    | 'Gamer'
    | 'Sci-Fi'
    | 'Adventurer'
    | 'Casual'
    | 'Chic'
    | 'Cyberpunk'
    | 'Sporty'
    | 'Fantasy'
    | 'Modern'
    | 'Retro'
    | 'Rebel';
  skinTone: string;
  hairColor: string;
  /** Tailwind gradient stops for profile card badges and pods. */
  gradient: string;
  details: PresetAvatarDetails;
}

/**
 * The 40 Global Human Avatar Characters (20 Male, 20 Female).
 */
export const PRESET_AVATARS: PresetAvatar[] = [
  // --------------------------------------------------------------------------
  // MALE HUMAN AVATARS (20 Characters)
  // --------------------------------------------------------------------------
  {
    key: 'm_alex',
    name: 'Alex',
    gender: 'male',
    style: 'Streetwear',
    skinTone: '#e5a97d',
    hairColor: '#1c1917',
    gradient: 'from-amber-500 to-yellow-700',
    details: { hairStyle: 'Fade Undercut', facialHair: 'light_stubble', clothing: 'Mustard Hoodie' },
  },
  {
    key: 'm_marcus',
    name: 'Marcus',
    gender: 'male',
    style: 'Gamer',
    skinTone: '#784421',
    hairColor: '#0f172a',
    gradient: 'from-cyan-500 to-blue-700',
    details: { hairStyle: 'Short Textured Fade', facialHair: 'full_beard', accessory: 'Cyan Headset', clothing: 'Navy Tee' },
  },
  {
    key: 'm_kai',
    name: 'Kai',
    gender: 'male',
    style: 'Sci-Fi',
    skinTone: '#fce4ec',
    hairColor: '#e2e8f0',
    gradient: 'from-indigo-500 to-purple-800',
    details: { hairStyle: 'Silver Undercut', facialHair: 'clean_shaven', accessory: 'Sci-Fi Clip', clothing: 'Tactical Jacket' },
  },
  {
    key: 'm_diego',
    name: 'Diego',
    gender: 'male',
    style: 'Adventurer',
    skinTone: '#d99b66',
    hairColor: '#271c19',
    gradient: 'from-orange-500 to-amber-700',
    details: { hairStyle: 'Medium Wavy Hair', facialHair: 'boxed_beard', accessory: 'Scarf', clothing: 'Leather Vest' },
  },
  {
    key: 'm_ethan',
    name: 'Ethan',
    gender: 'male',
    style: 'Casual',
    skinTone: '#ffd6b8',
    hairColor: '#eab308',
    gradient: 'from-blue-400 to-indigo-600',
    details: { hairStyle: 'Messy Golden Blonde', facialHair: 'clean_shaven', clothing: 'Denim Jacket' },
  },
  {
    key: 'm_zayn',
    name: 'Zayn',
    gender: 'male',
    style: 'Chic',
    skinTone: '#c68b59',
    hairColor: '#1e1b4b',
    gradient: 'from-emerald-500 to-teal-700',
    details: { hairStyle: 'Slicked Pompadour', facialHair: 'goatee', accessory: 'Gold Chain', clothing: 'Velvet Jacket' },
  },
  {
    key: 'm_viktor',
    name: 'Viktor',
    gender: 'male',
    style: 'Cyberpunk',
    skinTone: '#f3d0be',
    hairColor: '#09090b',
    gradient: 'from-fuchsia-600 to-purple-900',
    details: { hairStyle: 'Slick Back Undercut', facialHair: 'long_beard', accessory: 'Cyber Glasses', clothing: 'Leather Trench' },
  },
  {
    key: 'm_tariq',
    name: 'Tariq',
    gender: 'male',
    style: 'Sporty',
    skinTone: '#523119',
    hairColor: '#171717',
    gradient: 'from-rose-500 to-red-700',
    details: { hairStyle: 'Buzz Cut Line-up', facialHair: 'heavy_stubble', clothing: 'Varsity Jersey' },
  },
  {
    key: 'm_leo',
    name: 'Leo',
    gender: 'male',
    style: 'Fantasy',
    skinTone: '#f7d6c2',
    hairColor: '#9a3412',
    gradient: 'from-lime-600 to-green-800',
    details: { hairStyle: 'Long Hair Half-Bun', facialHair: 'chin_beard', clothing: 'Forest Tunic' },
  },
  {
    key: 'm_kenji',
    name: 'Kenji',
    gender: 'male',
    style: 'Modern',
    skinTone: '#f4c29d',
    hairColor: '#0c0a09',
    gradient: 'from-slate-600 to-slate-800',
    details: { hairStyle: 'Side-Parted Straight', facialHair: 'mustache_patch', accessory: 'Glasses', clothing: 'Slate Blazer' },
  },
  {
    key: 'm_sam',
    name: 'Sam',
    gender: 'male',
    style: 'Retro',
    skinTone: '#d4996a',
    hairColor: '#261914',
    gradient: 'from-yellow-500 to-orange-600',
    details: { hairStyle: 'Curly Afro Taper', facialHair: 'short_beard', accessory: 'Beanie', clothing: 'Knit Sweater' },
  },
  {
    key: 'm_rex',
    name: 'Rex',
    gender: 'male',
    style: 'Sci-Fi',
    skinTone: '#aa6c39',
    hairColor: '#64748b',
    gradient: 'from-violet-600 to-slate-800',
    details: { hairStyle: 'Short Crop Grey', facialHair: 'heavy_stubble', clothing: 'Commander Suit' },
  },
  {
    key: 'm_arjun',
    name: 'Arjun',
    gender: 'male',
    style: 'Modern',
    skinTone: '#b5794c',
    hairColor: '#171717',
    gradient: 'from-sky-600 to-blue-800',
    details: { hairStyle: 'Thick Dark Pompadour', facialHair: 'boxed_beard', clothing: 'Navy Collar' },
  },
  {
    key: 'm_carlos',
    name: 'Carlos',
    gender: 'male',
    style: 'Streetwear',
    skinTone: '#c98a58',
    hairColor: '#1c1917',
    gradient: 'from-amber-600 to-red-700',
    details: { hairStyle: 'Curly Dark Fade', facialHair: 'goatee', clothing: 'Bomber Jacket' },
  },
  {
    key: 'm_hassan',
    name: 'Hassan',
    gender: 'male',
    style: 'Chic',
    skinTone: '#bd8357',
    hairColor: '#09090b',
    gradient: 'from-teal-600 to-emerald-800',
    details: { hairStyle: 'Groomed Side Part', facialHair: 'full_beard', clothing: 'Tailored Coat' },
  },
  {
    key: 'm_kwame',
    name: 'Kwame',
    gender: 'male',
    style: 'Casual',
    skinTone: '#4a2c17',
    hairColor: '#0f172a',
    gradient: 'from-emerald-500 to-green-700',
    details: { hairStyle: 'Tied Dreadlocks', facialHair: 'short_beard', accessory: 'Gold Stud', clothing: 'Green Jacket' },
  },
  {
    key: 'm_chen',
    name: 'Chen',
    gender: 'male',
    style: 'Casual',
    skinTone: '#f5ccaa',
    hairColor: '#1c1917',
    gradient: 'from-blue-500 to-indigo-700',
    details: { hairStyle: 'Curtain Fringe', facialHair: 'clean_shaven', accessory: 'Wireframe Glasses', clothing: 'Dark Turtleneck' },
  },
  {
    key: 'm_mateo',
    name: 'Mateo',
    gender: 'male',
    style: 'Adventurer',
    skinTone: '#aa6d3f',
    hairColor: '#18181b',
    gradient: 'from-orange-600 to-red-800',
    details: { hairStyle: 'Slicked Dark Waves', facialHair: 'mustache_patch', clothing: 'Denim Vest' },
  },
  {
    key: 'm_tomas',
    name: 'Tomas',
    gender: 'male',
    style: 'Casual',
    skinTone: '#fae3d9',
    hairColor: '#fef08a',
    gradient: 'from-cyan-500 to-blue-600',
    details: { hairStyle: 'Platinum Blonde Bun', facialHair: 'short_beard', clothing: 'Nordic Sweater' },
  },
  {
    key: 'm_kiran',
    name: 'Kiran',
    gender: 'male',
    style: 'Sporty',
    skinTone: '#aa7349',
    hairColor: '#261914',
    gradient: 'from-yellow-500 to-amber-700',
    details: { hairStyle: 'Short Curly Crop', facialHair: 'light_stubble', clothing: 'Casual Polo' },
  },

  // --------------------------------------------------------------------------
  // FEMALE HUMAN AVATARS (20 Characters)
  // --------------------------------------------------------------------------
  {
    key: 'f_maya',
    name: 'Maya',
    gender: 'female',
    style: 'Gamer',
    skinTone: '#d89c72',
    hairColor: '#581c87',
    gradient: 'from-purple-500 to-pink-600',
    details: { hairStyle: 'Long Wavy Purple Streak', accessory: 'Cat-Ear Headset', clothing: 'Graphic Top' },
  },
  {
    key: 'f_sophia',
    name: 'Sophia',
    gender: 'female',
    style: 'Chic',
    skinTone: '#fde2d4',
    hairColor: '#18181b',
    gradient: 'from-teal-400 to-emerald-600',
    details: { hairStyle: 'Sleek Dark Bob', accessory: 'Hoop Earrings', clothing: 'Mint Jacket' },
  },
  {
    key: 'f_zara',
    name: 'Zara',
    gender: 'female',
    style: 'Streetwear',
    skinTone: '#5c361a',
    hairColor: '#09090b',
    gradient: 'from-amber-400 to-orange-600',
    details: { hairStyle: 'High Braided Bun', accessory: 'Retro Sunglasses', clothing: 'Bomber Jacket' },
  },
  {
    key: 'f_elena',
    name: 'Elena',
    gender: 'female',
    style: 'Adventurer',
    skinTone: '#ca8a4b',
    hairColor: '#7c2d12',
    gradient: 'from-yellow-600 to-amber-800',
    details: { hairStyle: 'Auburn Side Braid', accessory: 'Scarf', clothing: 'Utility Vest' },
  },
  {
    key: 'f_chloe',
    name: 'Chloe',
    gender: 'female',
    style: 'Retro',
    skinTone: '#ffe4d6',
    hairColor: '#facc15',
    gradient: 'from-pink-400 to-rose-600',
    details: { hairStyle: 'Blonde Ponytail', accessory: 'Star Hairclip', clothing: 'Pink Track Jacket' },
  },
  {
    key: 'f_yuki',
    name: 'Yuki',
    gender: 'female',
    style: 'Sci-Fi',
    skinTone: '#fef3c7',
    hairColor: '#030712',
    gradient: 'from-cyan-400 to-sky-700',
    details: { hairStyle: 'Straight Hime Cut', accessory: 'Cyan Visor', clothing: 'High-Tech Collar' },
  },
  {
    key: 'f_nora',
    name: 'Nora',
    gender: 'female',
    style: 'Sporty',
    skinTone: '#6b4122',
    hairColor: '#1c1917',
    gradient: 'from-sky-400 to-blue-700',
    details: { hairStyle: 'Braided Ponytail', accessory: 'Sport Visor', clothing: 'Athletic Jersey' },
  },
  {
    key: 'f_aria',
    name: 'Aria',
    gender: 'female',
    style: 'Fantasy',
    skinTone: '#fce7f3',
    hairColor: '#f472b6',
    gradient: 'from-fuchsia-400 to-purple-600',
    details: { hairStyle: 'Long Flowing Pink', accessory: 'Moon Crown', clothing: 'Ethereal Gown' },
  },
  {
    key: 'f_priya',
    name: 'Priya',
    gender: 'female',
    style: 'Modern',
    skinTone: '#b87a4b',
    hairColor: '#171717',
    gradient: 'from-blue-600 to-indigo-800',
    details: { hairStyle: 'Voluminous Dark Waves', accessory: 'Bindi & Earrings', clothing: 'Royal Blue Top' },
  },
  {
    key: 'f_zoe',
    name: 'Zoe',
    gender: 'female',
    style: 'Rebel',
    skinTone: '#fbd5c0',
    hairColor: '#0891b2',
    gradient: 'from-rose-600 to-red-800',
    details: { hairStyle: 'Pixie Cyan Highlight', accessory: 'Ear Cuff', clothing: 'Studded Leather' },
  },
  {
    key: 'f_leila',
    name: 'Leila',
    gender: 'female',
    style: 'Casual',
    skinTone: '#be8452',
    hairColor: '#291a10',
    gradient: 'from-amber-500 to-yellow-700',
    details: { hairStyle: 'Bouncy Dark Curls', accessory: 'Round Glasses', clothing: 'Yellow Turtleneck' },
  },
  {
    key: 'f_nova',
    name: 'Nova',
    gender: 'female',
    style: 'Sci-Fi',
    skinTone: '#a36838',
    hairColor: '#d97706',
    gradient: 'from-violet-500 to-indigo-700',
    details: { hairStyle: 'Short Crop Gold Streak', accessory: 'Comms Mic', clothing: 'Flight Suit' },
  },
  {
    key: 'f_aisha',
    name: 'Aisha',
    gender: 'female',
    style: 'Chic',
    skinTone: '#ba7d52',
    hairColor: '#18181b',
    gradient: 'from-emerald-600 to-teal-800',
    details: { hairStyle: 'Elegant Headwrap', accessory: 'Gold Hoop Earrings', clothing: 'Silk Top' },
  },
  {
    key: 'f_lin',
    name: 'Lin',
    gender: 'female',
    style: 'Modern',
    skinTone: '#f3c7a6',
    hairColor: '#4c1d95',
    gradient: 'from-purple-600 to-indigo-800',
    details: { hairStyle: 'Sleek Bob Purple Tips', accessory: 'Glasses', clothing: 'Designer Blazer' },
  },
  {
    key: 'f_amara',
    name: 'Amara',
    gender: 'female',
    style: 'Streetwear',
    skinTone: '#4a2c17',
    hairColor: '#09090b',
    gradient: 'from-amber-500 to-orange-700',
    details: { hairStyle: 'Voluminous Afro Puff', accessory: 'Gold Hoops', clothing: 'Yellow Top' },
  },
  {
    key: 'f_fatima',
    name: 'Fatima',
    gender: 'female',
    style: 'Casual',
    skinTone: '#bd8054',
    hairColor: '#171717',
    gradient: 'from-emerald-500 to-teal-700',
    details: { hairStyle: 'Long Dark Braid', accessory: 'Nose Ring', clothing: 'Emerald Top' },
  },
  {
    key: 'f_isabella',
    name: 'Isabella',
    gender: 'female',
    style: 'Casual',
    skinTone: '#c68a5c',
    hairColor: '#1c1917',
    gradient: 'from-rose-500 to-pink-700',
    details: { hairStyle: 'Long Wavy Dark Hair', accessory: 'Flower Clip', clothing: 'Coral Top' },
  },
  {
    key: 'f_freja',
    name: 'Freja',
    gender: 'female',
    style: 'Adventurer',
    skinTone: '#fae3d9',
    hairColor: '#fef08a',
    gradient: 'from-sky-500 to-blue-700',
    details: { hairStyle: 'Braided Blonde Crown', clothing: 'Blue Jacket' },
  },
  {
    key: 'f_keilani',
    name: 'Keilani',
    gender: 'female',
    style: 'Casual',
    skinTone: '#b4774b',
    hairColor: '#18181b',
    gradient: 'from-teal-500 to-cyan-700',
    details: { hairStyle: 'Wavy Pacific Hair', accessory: 'Hibiscus Flower', clothing: 'Teal Top' },
  },
  {
    key: 'f_soraya',
    name: 'Soraya',
    gender: 'female',
    style: 'Chic',
    skinTone: '#c28557',
    hairColor: '#09090b',
    gradient: 'from-fuchsia-500 to-purple-700',
    details: { hairStyle: 'Voluminous Dark Curls', accessory: 'Gold Pendant', clothing: 'Purple Dress' },
  },
];

/** Default key assigned to brand-new players. */
export const DEFAULT_AVATAR_KEY = PRESET_AVATARS[0].key;

/**
 * Migration dictionary mapping legacy simple animal/icon avatar keys
 * to suitable new human character avatars.
 */
const LEGACY_MIGRATION_MAP: Record<string, string> = {
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

const BY_KEY: Record<string, PresetAvatar> = Object.fromEntries(
  PRESET_AVATARS.map((a) => [a.key, a]),
);

/**
 * Resolves a stored avatar key to its human avatar character preset.
 * Automatically migrates legacy animal/icon keys and unknown keys to valid human avatars.
 */
export function getPresetAvatar(key: string | null | undefined): PresetAvatar {
  if (!key) return BY_KEY[DEFAULT_AVATAR_KEY];

  // 1. Check legacy migration map
  const migratedKey = LEGACY_MIGRATION_MAP[key];
  if (migratedKey && BY_KEY[migratedKey]) {
    return BY_KEY[migratedKey];
  }

  // 2. Direct key match
  if (BY_KEY[key]) {
    return BY_KEY[key];
  }

  // 3. Fallback to default human character
  return BY_KEY[DEFAULT_AVATAR_KEY];
}
