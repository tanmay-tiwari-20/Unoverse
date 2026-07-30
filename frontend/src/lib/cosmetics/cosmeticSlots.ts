/**
 * ============================================================================
 *  Cosmetic slot architecture (forward-looking).
 * ============================================================================
 *
 * This file defines HOW future cosmetics attach to a character, without
 * implementing the cosmetics themselves. The current shipping cosmetic is the
 * body `outfit` (see `outfits.ts`); everything else here is the scaffolding so
 * that hair styles, hats, glasses, gloves, shoes, back-accessories and seasonal
 * items can be added later as pure data + a small render function, with ZERO
 * changes to networking, gameplay, or the seat/character core.
 *
 * ---------------------------------------------------------------------------
 *  Storage & network model (the contract every future slot must obey)
 * ---------------------------------------------------------------------------
 * A character's full cosmetic look is a `CosmeticLoadout`: a flat map of
 * slot → item-key (all strings). It serialises to a single compact object that
 * can live on the profile and ride the EXACT additive broadcast path the
 * `outfit`/`avatar` fields already use:
 *
 *     profile → resolveProfileIdentity → Player.<field> → publicRoom → client
 *
 * Because publicRoom strips only `secret`, any cosmetic field added to Player
 * broadcasts automatically. To keep the wire small and backwards-compatible,
 * the whole loadout is intended to be carried as ONE optional string field
 * (JSON) rather than one Player field per slot — but the shipping code today
 * only uses the dedicated `outfit` string, and this map is the growth path.
 *
 * Anything unknown (a slot the client build doesn't know, an item key it can't
 * resolve) MUST degrade to the slot's default and never throw — see
 * `resolveLoadout`. That keeps mixed client versions visually safe.
 */
import { DEFAULT_OUTFIT_KEY } from './outfits';

/**
 * Every cosmetic attachment point on a character. `outfit` is the only one wired
 * end-to-end today; the rest are declared so pickers, storage and the renderer
 * can be extended slot-by-slot without a schema rethink.
 */
export type CosmeticSlot =
  | 'outfit' // body garment — SHIPPING (outfits.ts)
  | 'hair' // hairstyle mesh (colour already lives in the outfit palette)
  | 'headwear' // hats, helmets, beanies, crowns
  | 'face' // glasses, masks, visors
  | 'hands' // gloves, gauntlets
  | 'feet' // shoes, boots
  | 'back' // capes, backpacks, jetpacks, wings
  | 'aura'; // seasonal/particle flourishes (event cosmetics)

/** Ordered for display; keeps pickers and tabs consistent everywhere. */
export const COSMETIC_SLOTS: CosmeticSlot[] = [
  'outfit', 'hair', 'headwear', 'face', 'hands', 'feet', 'back', 'aura',
];

/**
 * A complete cosmetic selection: slot → item key. Every field optional; a
 * missing slot means "use the slot default". Kept as loose strings so the wire
 * format and stored profiles are stable across client versions.
 */
export type CosmeticLoadout = Partial<Record<CosmeticSlot, string>>;

/**
 * Per-slot defaults. Only `outfit` has a real catalog today; the others resolve
 * to 'none' until their catalogs + renderers land. Adding a catalog later is
 * just: define keys, drop the renderer in WebGLSeats, flip this default.
 */
export const SLOT_DEFAULTS: Record<CosmeticSlot, string> = {
  outfit: DEFAULT_OUTFIT_KEY,
  hair: 'default',
  headwear: 'none',
  face: 'none',
  hands: 'none',
  feet: 'none',
  back: 'none',
  aura: 'none',
};

/** True once a slot has a real catalog + renderer wired end-to-end. */
export const SLOT_ENABLED: Record<CosmeticSlot, boolean> = {
  outfit: true,
  hair: false,
  headwear: false,
  face: false,
  hands: false,
  feet: false,
  back: false,
  aura: false,
};

/**
 * Normalise any (possibly partial, possibly unknown-version) loadout into a
 * fully-populated one, filling every slot with its default. Never throws.
 */
export function resolveLoadout(raw: CosmeticLoadout | null | undefined): Record<CosmeticSlot, string> {
  const out = { ...SLOT_DEFAULTS };
  if (raw) {
    for (const slot of COSMETIC_SLOTS) {
      const v = raw[slot];
      if (typeof v === 'string' && v.length > 0) out[slot] = v;
    }
  }
  return out;
}

/**
 * Serialise a loadout to the compact string carried on the network / stored on
 * the profile. Only non-default slots are written, so today's single-outfit
 * players serialise to just their outfit key's worth of data. Returns `null`
 * when everything is default (nothing to store / send).
 */
export function serializeLoadout(loadout: CosmeticLoadout | null | undefined): string | null {
  if (!loadout) return null;
  const trimmed: CosmeticLoadout = {};
  let any = false;
  for (const slot of COSMETIC_SLOTS) {
    const v = loadout[slot];
    if (typeof v === 'string' && v.length > 0 && v !== SLOT_DEFAULTS[slot]) {
      trimmed[slot] = v;
      any = true;
    }
  }
  return any ? JSON.stringify(trimmed) : null;
}

/** Parse a serialised loadout string; tolerant of null/garbage. */
export function parseLoadout(raw: string | null | undefined): CosmeticLoadout {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      const out: CosmeticLoadout = {};
      for (const slot of COSMETIC_SLOTS) {
        if (typeof obj[slot] === 'string') out[slot] = obj[slot];
      }
      return out;
    }
  } catch {
    /* fall through to empty */
  }
  return {};
}
