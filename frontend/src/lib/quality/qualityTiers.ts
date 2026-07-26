/**
 * Graphics quality tiers for the 3D table.
 *
 * A tier is a single named point on the cost/fidelity curve; every renderer knob
 * the scene reads is derived from it, so "drop to Medium" is one decision rather
 * than a dozen scattered conditionals. Tiers are chosen two ways and combined in
 * `useEffectiveQuality`:
 *
 *   - MANUALLY, from the user's existing Settings (Performance Mode, Shadow
 *     Quality, VFX Quality, Post Processing). This is a *ceiling*.
 *   - AUTOMATICALLY, by `AdaptiveQuality` watching sustained framerate. This can
 *     only ever lower the tier, never raise it above what the user asked for.
 *
 * Everything in a profile is either free to change at runtime (DPR, shadow
 * enable/size, particle counts, effect gating) or purely presentational. Nothing
 * here can force the WebGL context to be recreated, which is what keeps a tier
 * change a smooth in-place adjustment instead of a visible scene reload.
 */

export type QualityTier = 'high' | 'medium' | 'low';

/** Ordered worst -> best, so tiers can be compared and clamped numerically. */
export const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

export interface QualityProfile {
  tier: QualityTier;
  /**
   * `[min, max]` device pixel ratio handed to R3F. The renderer clamps the real
   * `devicePixelRatio` into this range, so this is the single biggest lever on
   * fill-rate cost — a 3x-DPR phone renders 9x the pixels of a 1x one.
   */
  dpr: [number, number];
  /** Whether the shadow map is rendered at all (an extra scene pass per light). */
  shadows: boolean;
  /** Shadow map resolution. Ignored when `shadows` is false. */
  shadowMapSize: number;
  /** Anti-aliasing + filmic tone mapping. */
  postProcessing: boolean;
  /** Gate for the 3D action effects (skip/reverse/wild/draw flourishes). */
  effects3D: boolean;
  /**
   * Multiplier applied to every decorative particle count (lamp flies, winner
   * confetti). 0 removes them entirely.
   */
  particleScale: number;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  // Desktop GPUs and recent phones: the scene as designed.
  high: {
    tier: 'high',
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 2048,
    postProcessing: true,
    effects3D: true,
    particleScale: 1,
  },
  // Integrated GPUs, mid-range phones, Chromebooks: keep the look, cut the cost.
  // Shadows survive at half resolution (a quarter of the texels) because they
  // carry most of the table's sense of depth; render resolution, anti-aliasing
  // and particle density absorb the rest of the savings.
  medium: {
    tier: 'medium',
    dpr: [0.9, 1.35],
    shadows: true,
    shadowMapSize: 1024,
    postProcessing: false,
    effects3D: true,
    particleScale: 0.5,
  },
  // Anything that still can't hold a playable framerate. Everything optional is
  // gone; what remains is the table, the cards and the lighting needed to read
  // them. The game is fully playable here — only the flourishes are absent.
  low: {
    tier: 'low',
    dpr: [0.7, 1],
    shadows: false,
    shadowMapSize: 512,
    postProcessing: false,
    effects3D: false,
    particleScale: 0,
  },
};

/** Lower of two tiers. Used to let any single source of "go simpler" win. */
export const minTier = (a: QualityTier, b: QualityTier): QualityTier =>
  TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b;

/** One step down the ladder; returns `low` unchanged (already the floor). */
export const downgradeTier = (tier: QualityTier): QualityTier =>
  TIER_ORDER[Math.max(0, TIER_ORDER.indexOf(tier) - 1)];

/** One step up the ladder; returns `high` unchanged (already the ceiling). */
export const upgradeTier = (tier: QualityTier): QualityTier =>
  TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(tier) + 1)];

/**
 * Scale a decorative element count by the tier's particle budget.
 *
 * Rounds up so a non-zero budget never silently deletes a single-item effect,
 * and returns exactly 0 when the budget is 0.
 */
export const scaleParticles = (count: number, particleScale: number): number =>
  particleScale <= 0 ? 0 : Math.max(1, Math.ceil(count * particleScale));

// ---------------------------------------------------------------------------
// Framerate thresholds driving automatic tier selection.
// ---------------------------------------------------------------------------

/**
 * Sustained FPS below this is treated as "this device cannot afford the current
 * tier". Set at 40 rather than 30 so we act while the game is merely choppy,
 * not after it has become unplayable.
 */
export const DOWNGRADE_FPS = 40;

/**
 * Sustained FPS above this means there is headroom to restore fidelity. The gap
 * to DOWNGRADE_FPS is deliberately wide — that hysteresis band is what stops a
 * device sitting exactly at the boundary from oscillating between tiers.
 */
export const UPGRADE_FPS = 55;

/** Length of one framerate sample window, in milliseconds. */
export const SAMPLE_WINDOW_MS = 1000;

/** Consecutive bad samples required before dropping a tier. */
export const DOWNGRADE_SAMPLES = 3;

/** Consecutive good samples required before restoring a tier. */
export const UPGRADE_SAMPLES = 8;

/**
 * Samples ignored after the scene starts or a tier changes. Mount, shader
 * compilation and texture upload all produce a burst of slow frames that says
 * nothing about steady-state performance.
 */
export const WARMUP_SAMPLES = 3;
