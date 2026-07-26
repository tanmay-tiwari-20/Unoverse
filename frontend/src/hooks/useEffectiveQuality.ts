'use client';

import { useMemo } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  QUALITY_PROFILES,
  QualityProfile,
  QualityTier,
  minTier,
} from '../lib/quality/qualityTiers';

/**
 * Collapse the user's manual graphics settings into a single tier.
 *
 * The Settings panel predates tiers and exposes four independent knobs. Rather
 * than replace them (which would change the UI), each is read as a cap and the
 * strictest one wins — so "Performance Mode on" or "Shadows: low" still means
 * exactly what it always did, just expressed as a tier.
 */
function manualTier(settings: {
  performanceMode: boolean;
  shadowQuality: 'low' | 'medium' | 'high';
  vfxQuality: 'low' | 'medium' | 'high';
  postProcessing: boolean;
}): QualityTier {
  // Performance Mode is the user explicitly asking for the cheapest scene.
  if (settings.performanceMode) return 'low';

  let tier: QualityTier = 'high';
  // Shadows off is the defining characteristic of the low tier.
  if (settings.shadowQuality === 'low') tier = minTier(tier, 'low');
  else if (settings.shadowQuality === 'medium') tier = minTier(tier, 'medium');
  // VFX low disables the 3D action effects, which is also a low-tier trait.
  if (settings.vfxQuality === 'low') tier = minTier(tier, 'low');
  else if (settings.vfxQuality === 'medium') tier = minTier(tier, 'medium');
  // Post-processing off separates high from medium.
  if (!settings.postProcessing) tier = minTier(tier, 'medium');
  return tier;
}

export interface EffectiveQuality extends QualityProfile {
  /** Tier implied by the user's manual settings, before adaptive scaling. */
  manualTier: QualityTier;
  /** Tier the adaptive monitor currently believes the device can sustain. */
  autoTier: QualityTier;
  /** True when adaptive scaling is actively holding quality below the manual tier. */
  isAutoDowngraded: boolean;
  adaptiveQuality: boolean;
}

/**
 * The single source of truth for "how expensive should the scene be right now".
 *
 * Combines the user's manual settings with the adaptive monitor's verdict by
 * taking the LOWER of the two. That direction matters: automatic scaling exists
 * to keep the game playable, not to override intent, so it can pull quality down
 * on a struggling device but can never push it past a ceiling the user chose.
 * When the device recovers, `autoTier` climbs back and quality is restored — up
 * to, and never beyond, the manual tier.
 */
export function useEffectiveQuality(): EffectiveQuality {
  const performanceMode = useSettingsStore((s) => s.performanceMode);
  const shadowQuality = useSettingsStore((s) => s.shadowQuality);
  const vfxQuality = useSettingsStore((s) => s.vfxQuality);
  const postProcessing = useSettingsStore((s) => s.postProcessing);
  const adaptiveQuality = useSettingsStore((s) => s.adaptiveQuality);
  const autoTier = useSettingsStore((s) => s.autoTier);

  return useMemo(() => {
    const manual = manualTier({ performanceMode, shadowQuality, vfxQuality, postProcessing });
    const effective = adaptiveQuality ? minTier(manual, autoTier) : manual;
    return {
      ...QUALITY_PROFILES[effective],
      manualTier: manual,
      autoTier,
      isAutoDowngraded: adaptiveQuality && effective !== manual,
      adaptiveQuality,
    };
  }, [performanceMode, shadowQuality, vfxQuality, postProcessing, adaptiveQuality, autoTier]);
}
