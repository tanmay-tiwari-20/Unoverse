import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  // UI State (Not persisted)
  isSettingsOpen: boolean;
  isReportBugOpen: boolean;
  isControlsOpen: boolean;
  isAboutOpen: boolean;

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
  
  cardAnimations: boolean;
  cameraMotion: boolean;
  cameraSensitivity: number;
  autoDeclareUno: boolean;
  
  // Setters
  setIsSettingsOpen: (isOpen: boolean) => void;
  setIsReportBugOpen: (isOpen: boolean) => void;
  setIsControlsOpen: (isOpen: boolean) => void;
  setIsAboutOpen: (isOpen: boolean) => void;

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
  
  setCardAnimations: (enabled: boolean) => void;
  setCameraMotion: (enabled: boolean) => void;
  setCameraSensitivity: (sens: number) => void;
  setAutoDeclareUno: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default non-persisted UI state
      isSettingsOpen: false,
      isReportBugOpen: false,
      isControlsOpen: false,
      isAboutOpen: false,

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
      
      cardAnimations: true,
      cameraMotion: true,
      cameraSensitivity: 50,
      autoDeclareUno: false,

      // UI Actions (don't technically need persistence but they are part of the store)
      setIsSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      setIsReportBugOpen: (isOpen) => set({ isReportBugOpen: isOpen }),
      setIsControlsOpen: (isOpen) => set({ isControlsOpen: isOpen }),
      setIsAboutOpen: (isOpen) => set({ isAboutOpen: isOpen }),

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
      
      setCardAnimations: (enabled) => set({ cardAnimations: enabled }),
      setCameraMotion: (enabled) => set({ cameraMotion: enabled }),
      setCameraSensitivity: (sens) => set({ cameraSensitivity: sens }),
      setAutoDeclareUno: (enabled) => set({ autoDeclareUno: enabled }),
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
        cardAnimations: state.cardAnimations,
        cameraMotion: state.cameraMotion,
        cameraSensitivity: state.cameraSensitivity,
        autoDeclareUno: state.autoDeclareUno,
      }),
    }
  )
);
