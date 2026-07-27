/**
 * ============================================================================
 *  Preset avatar catalog.
 * ============================================================================
 *
 * The product decision is a FIXED preset icon set (not uploads / not procedural
 * for profiles). A profile's `avatarUrl` stores one of these string KEYS; the
 * key is resolved to a lucide icon + arcade gradient here so the same avatar
 * renders identically everywhere (profile modal, create flow, chips).
 *
 * Keys are stable identifiers — never rename an existing key or a stored profile
 * would lose its avatar. Add new presets by appending; the first entry is the
 * default assigned to brand-new profiles.
 *
 * NOTE: this is deliberately self-contained and does NOT touch the in-game
 * `components/table/Avatar.tsx` (procedural-from-name), so the in-game UI is
 * unchanged. Profile-less players keep their procedural table avatars.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Cat,
  Dog,
  Bird,
  Rabbit,
  Fish,
  Ghost,
  Rocket,
  Bot,
  Crown,
  Gamepad2,
  Zap,
  Star,
  Flame,
  Sparkles,
  Skull,
  Diamond,
} from 'lucide-react';

export interface PresetAvatar {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Tailwind gradient stops (used as `bg-gradient-to-b from-… to-…`). */
  gradient: string;
}

/**
 * The catalog. Order is the display order in the picker grid; the first entry
 * is the default for new profiles.
 */
export const PRESET_AVATARS: PresetAvatar[] = [
  { key: 'rocket', label: 'Rocket', Icon: Rocket, gradient: 'from-orange-400 to-red-600' },
  { key: 'cat', label: 'Cat', Icon: Cat, gradient: 'from-amber-300 to-orange-500' },
  { key: 'dog', label: 'Dog', Icon: Dog, gradient: 'from-yellow-400 to-amber-600' },
  { key: 'bird', label: 'Bird', Icon: Bird, gradient: 'from-sky-400 to-blue-600' },
  { key: 'rabbit', label: 'Rabbit', Icon: Rabbit, gradient: 'from-pink-300 to-rose-500' },
  { key: 'fish', label: 'Fish', Icon: Fish, gradient: 'from-cyan-400 to-teal-600' },
  { key: 'ghost', label: 'Ghost', Icon: Ghost, gradient: 'from-violet-400 to-purple-700' },
  { key: 'robot', label: 'Robot', Icon: Bot, gradient: 'from-slate-400 to-slate-700' },
  { key: 'crown', label: 'Crown', Icon: Crown, gradient: 'from-yellow-300 to-amber-500' },
  { key: 'gamepad', label: 'Gamer', Icon: Gamepad2, gradient: 'from-lime-400 to-green-600' },
  { key: 'bolt', label: 'Bolt', Icon: Zap, gradient: 'from-amber-300 to-yellow-500' },
  { key: 'star', label: 'Star', Icon: Star, gradient: 'from-fuchsia-400 to-purple-600' },
  { key: 'flame', label: 'Flame', Icon: Flame, gradient: 'from-red-400 to-orange-600' },
  { key: 'sparkles', label: 'Sparkle', Icon: Sparkles, gradient: 'from-pink-400 to-fuchsia-600' },
  { key: 'skull', label: 'Skull', Icon: Skull, gradient: 'from-neutral-400 to-neutral-700' },
  { key: 'diamond', label: 'Diamond', Icon: Diamond, gradient: 'from-cyan-300 to-blue-500' },
];

/** The key assigned to a brand-new profile when none is chosen. */
export const DEFAULT_AVATAR_KEY = PRESET_AVATARS[0].key;

const BY_KEY: Record<string, PresetAvatar> = Object.fromEntries(
  PRESET_AVATARS.map((a) => [a.key, a]),
);

/**
 * Resolve a stored avatar key to its preset. Unknown / null keys fall back to
 * the default preset so rendering never breaks on legacy or missing values.
 */
export function getPresetAvatar(key: string | null | undefined): PresetAvatar {
  return (key && BY_KEY[key]) || BY_KEY[DEFAULT_AVATAR_KEY];
}
