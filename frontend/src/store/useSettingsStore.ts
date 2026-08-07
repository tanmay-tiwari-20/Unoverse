import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getReducedMotionPreference } from '../hooks/useReducedMotion';
import type { QualityTier } from '../lib/quality/qualityTiers';

interface SettingsState {
  // UI State (Not persisted)
  isSettingsOpen: boolean;
  isReportBugOpen: boolean;
  isControlsOpen: boolean;
  isAboutOpen: boolean;
  isHouseRulesOpen: boolean;
  isRulesOpen: boolean;

  // Persisted Settings
  masterVolume: number;
  gameVolume: number;
  ambientVolume: number;
  micVolume: number;
  voiceVolume: number;
  
  showFPS: boolean;
  shadowQuality: 'low' | 'medium' | 'high';
  vfxQuality: 'low' | 'medium' | 'high';
  postProcessing: boolean;
  performanceMode: boolean;
  /**
   * Master switch for automatic graphics scaling. When on, the renderer watches
   * sustained framerate and lowers quality on devices that can't keep up (and
   * restores it when they can). Off = the manual settings above are used exactly
   * as written, however the game runs.
   */
  adaptiveQuality: boolean;

  /**
   * Tier chosen by the adaptive monitor. Runtime-only — deliberately NOT
   * persisted, because it describes how the device is coping *right now* (which
   * changes with thermal state, battery saver, other tabs) and must never be
   * restored as though it were a user preference. It acts as a ceiling combined
   * with the manual settings in `useEffectiveQuality`; it can lower quality
   * below the user's choice but never raise it above.
   */
  autoTier: QualityTier;

  cardAnimations: boolean;
  cameraMotion: boolean;
  cameraSensitivity: number;
  reducedMotion: boolean;
  showLastPlayedBy: boolean;

  /**
   * The player has chosen to play on a portrait phone anyway, dismissing the
   * rotate nudge. Persisted so the choice is honoured for good rather than
   * re-asked every round — some players have rotation locked at the OS level or
   * physically cannot rotate their device, so this must never become a gate.
   */
  allowPortrait: boolean;

  // Setters
  setIsSettingsOpen: (isOpen: boolean) => void;
  setIsReportBugOpen: (isOpen: boolean) => void;
  setIsControlsOpen: (isOpen: boolean) => void;
  setIsAboutOpen: (isOpen: boolean) => void;
  setIsHouseRulesOpen: (isOpen: boolean) => void;
  setIsRulesOpen: (isOpen: boolean) => void;

  setMasterVolume: (vol: number) => void;
  setGameVolume: (vol: number) => void;
  setAmbientVolume: (vol: number) => void;
  setMicVolume: (vol: number) => void;
  setVoiceVolume: (vol: number) => void;
  
  setShowFPS: (show: boolean) => void;
  setShadowQuality: (quality: 'low' | 'medium' | 'high') => void;
  setVfxQuality: (quality: 'low' | 'medium' | 'high') => void;
  setPostProcessing: (enabled: boolean) => void;
  setPerformanceMode: (enabled: boolean) => void;
  setAdaptiveQuality: (enabled: boolean) => void;
  setAutoTier: (tier: QualityTier) => void;

  setCardAnimations: (enabled: boolean) => void;
  setCameraMotion: (enabled: boolean) => void;
  setCameraSensitivity: (sens: number) => void;
  setReducedMotion: (enabled: boolean) => void;
  setShowLastPlayedBy: (enabled: boolean) => void;
  setAllowPortrait: (allowed: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default non-persisted UI state
      isSettingsOpen: false,
      isReportBugOpen: false,
      isControlsOpen: false,
      isAboutOpen: false,
      isHouseRulesOpen: false,
      isRulesOpen: false,

      // Default Persisted Settings
      masterVolume: 100,
      gameVolume: 80,
      ambientVolume: 50,
      micVolume: 100,
      voiceVolume: 100,
      
      showFPS: false,
      shadowQuality: 'high',
      vfxQuality: 'high',
      postProcessing: true,
      performanceMode: false,
      adaptiveQuality: true,
      // Optimistic start: assume the device can handle the full scene, and let
      // the monitor step down within a few seconds if it can't. Starting low and
      // climbing would make every capable device look bad for its first seconds.
      autoTier: 'high',

      cardAnimations: true,
      cameraMotion: true,
      cameraSensitivity: 50,
      reducedMotion: false,
      // Subtle "last played by" indicator near the discard pile — on by default.
      showLastPlayedBy: true,
      // Start by nudging portrait phones toward landscape; flipped permanently
      // the moment the player says they'd rather stay in portrait.
      allowPortrait: false,

      // UI Actions (don't technically need persistence but they are part of the store)
      setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      setIsReportBugOpen: (isOpen) => set({ isReportBugOpen: isOpen }),
      setIsControlsOpen: (isOpen) => set({ isControlsOpen: isOpen }),
      setIsAboutOpen: (isOpen) => set({ isAboutOpen: isOpen }),
      setIsHouseRulesOpen: (isOpen) => set({ isHouseRulesOpen: isOpen }),
      setIsRulesOpen: (isOpen) => set({ isRulesOpen: isOpen }),

      // Settings Actions
      setMasterVolume: (vol) => set({ masterVolume: vol }),
      setGameVolume: (vol) => set({ gameVolume: vol }),
      setAmbientVolume: (vol) => set({ ambientVolume: vol }),
      setMicVolume: (vol) => set({ micVolume: vol }),
      setVoiceVolume: (vol) => set({ voiceVolume: vol }),
      
      setShowFPS: (show) => set({ showFPS: show }),
      setShadowQuality: (quality) => set({ shadowQuality: quality }),
      setVfxQuality: (quality) => set({ vfxQuality: quality }),
      setPostProcessing: (enabled) => set({ postProcessing: enabled }),
      setPerformanceMode: (enabled) => set({ performanceMode: enabled }),
      setAdaptiveQuality: (enabled) => set({
        adaptiveQuality: enabled,
        // Turning auto-scaling off must not leave a downgrade stuck in place —
        // release the ceiling so the manual settings take effect immediately.
        ...(enabled ? {} : { autoTier: 'high' as QualityTier }),
      }),
      setAutoTier: (tier) => set({ autoTier: tier }),

      setCardAnimations: (enabled) => set({ cardAnimations: enabled }),
      setCameraMotion: (enabled) => set({ cameraMotion: enabled }),
      setCameraSensitivity: (sens) => set({ cameraSensitivity: sens }),
      setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
      setShowLastPlayedBy: (enabled) => set({ showLastPlayedBy: enabled }),
      setAllowPortrait: (allowed) => set({ allowPortrait: allowed }),
    }),
    {
      name: 'uno-real-settings', // unique name
      partialize: (state) => ({
        // Only persist the actual settings, not the UI modal states
        masterVolume: state.masterVolume,
        gameVolume: state.gameVolume,
        ambientVolume: state.ambientVolume,
        micVolume: state.micVolume,
        voiceVolume: state.voiceVolume,
        showFPS: state.showFPS,
        shadowQuality: state.shadowQuality,
        vfxQuality: state.vfxQuality,
        postProcessing: state.postProcessing,
        performanceMode: state.performanceMode,
        adaptiveQuality: state.adaptiveQuality,
        // NOTE: `autoTier` is intentionally absent — it is live device state,
        // not a preference. See its declaration above.
        cardAnimations: state.cardAnimations,
        cameraMotion: state.cameraMotion,
        cameraSensitivity: state.cameraSensitivity,
        reducedMotion: state.reducedMotion,
        showLastPlayedBy: state.showLastPlayedBy,
        allowPortrait: state.allowPortrait,
      }),
      // On first load (no persisted data), respect the OS reduced-motion pref
      // and auto-disable heavy animation settings.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const osPrefers = getReducedMotionPreference();
        if (osPrefers && !state.reducedMotion) {
          // First time user with OS reduced-motion enabled
          state.setReducedMotion(true);
          state.setCardAnimations(false);
          state.setCameraMotion(false);
          state.setVfxQuality('low');
        }
      },
    }
  )
);
