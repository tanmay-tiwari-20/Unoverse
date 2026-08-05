/**
 * ============================================================================
 *  Persistent player-profile client store.
 * ============================================================================
 *
 * Holds the durable player identity on the client: the immutable `profileId`,
 * the private `profileSecret` (proof of ownership for edits — never broadcast),
 * and cached display fields. Persisted to localStorage (key `unoverse:profile`)
 * via zustand `persist`, modeled on `useSettingsStore`, so identity survives
 * refresh, tab close, and reconnects — the player is created ONCE and never
 * re-prompted.
 *
 * SERVER-AUTHORITATIVE: this store never treats stat values as truth. The cached
 * `PublicProfile` is a display snapshot re-fetched from the server (on open /
 * after a match); the client only ever SENDS create/rename/avatar/reset intents,
 * authenticated by the secret.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicProfile } from '../types/profile';
import { DEFAULT_AVATAR_KEY } from '../lib/profile/avatars';
import { DEFAULT_OUTFIT_KEY } from '../lib/cosmetics/outfits';
import * as profileApi from '../lib/profile/profileApi';

interface ProfileState {
  // ---- Persisted identity ---------------------------------------------------
  profileId: string | null;
  profileSecret: string | null;
  /** Cached display name (fast paint before the server view is re-fetched). */
  displayName: string | null;
  /** Cached preset avatar key. */
  avatar: string | null;
  /** Cached cosmetic outfit (skin) key. */
  outfit: string | null;

  // ---- Runtime-only ---------------------------------------------------------
  /** Latest server-served public view, for the profile UI. Never persisted. */
  cachedProfile: PublicProfile | null;
  /** True until the persisted store has rehydrated (avoids a create-modal flash). */
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  /** UI flag: profile modal open. */
  isProfileOpen: boolean;

  // ---- Actions --------------------------------------------------------------
  setHydrated: () => void;
  setIsProfileOpen: (open: boolean) => void;
  createProfile: (displayName: string, avatar?: string | null, outfit?: string | null) => Promise<PublicProfile | null>;
  refreshProfile: () => Promise<PublicProfile | null>;
  renameProfile: (displayName: string) => Promise<PublicProfile | null>;
  setAvatar: (avatar: string | null) => Promise<PublicProfile | null>;
  setOutfit: (outfit: string | null) => Promise<PublicProfile | null>;
  resetProfile: () => Promise<PublicProfile | null>;
  /** Drop a local identity the server no longer recognises. */
  clearIdentity: () => void;
  clearError: () => void;
}

/** Fold a fresh server view into the cache + cached display fields. */
function adopt(profile: PublicProfile) {
  return {
    cachedProfile: profile,
    displayName: profile.displayName,
    avatar: profile.avatarUrl,
    outfit: profile.outfit,
  };
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profileId: null,
      profileSecret: null,
      displayName: null,
      avatar: null,
      outfit: null,

      cachedProfile: null,
      hydrated: false,
      loading: false,
      error: null,
      isProfileOpen: false,

      setHydrated: () => set({ hydrated: true }),
      setIsProfileOpen: (open) => set({ isProfileOpen: open }),

      createProfile: async (displayName, avatar, outfit) => {
        set({ loading: true, error: null });
        try {
          const { profile, secret } = await profileApi.createProfile({
            displayName: displayName.trim(),
            avatar: avatar ?? DEFAULT_AVATAR_KEY,
            outfit: outfit ?? DEFAULT_OUTFIT_KEY,
          });
          set({
            profileId: profile.id,
            profileSecret: secret,
            ...adopt(profile),
            loading: false,
          });
          return profile;
        } catch (e: any) {
          set({ loading: false, error: e?.message || 'Failed to create profile' });
          return null;
        }
      },

      refreshProfile: async () => {
        const { profileId } = get();
        if (!profileId) return null;
        set({ loading: true });
        try {
          const profile = await profileApi.fetchProfile(profileId);
          set({ ...adopt(profile), loading: false });
          return profile;
        } catch (e: any) {
          set({ loading: false, error: e?.message || 'Failed to load profile' });
          return null;
        }
      },

      renameProfile: async (displayName) => {
        const { profileId, profileSecret } = get();
        if (!profileId || !profileSecret) return null;
        set({ loading: true, error: null });
        try {
          const profile = await profileApi.patchProfile(profileId, profileSecret, {
            displayName: displayName.trim(),
          });
          set({ ...adopt(profile), loading: false });
          return profile;
        } catch (e: any) {
          set({ loading: false, error: e?.message || 'Failed to rename profile' });
          return null;
        }
      },

      setAvatar: async (avatar) => {
        const { profileId, profileSecret } = get();
        if (!profileId || !profileSecret) return null;
        set({ loading: true, error: null });
        try {
          const profile = await profileApi.patchProfile(profileId, profileSecret, { avatar });
          set({ ...adopt(profile), loading: false });
          return profile;
        } catch (e: any) {
          set({ loading: false, error: e?.message || 'Failed to change avatar' });
          return null;
        }
      },

      setOutfit: async (outfit) => {
        const { profileId, profileSecret } = get();
        if (!profileId || !profileSecret) return null;
        set({ loading: true, error: null });
        try {
          const profile = await profileApi.patchProfile(profileId, profileSecret, { outfit });
          set({ ...adopt(profile), loading: false });
          return profile;
        } catch (e: any) {
          set({ loading: false, error: e?.message || 'Failed to change outfit' });
          return null;
        }
      },

      resetProfile: async () => {
        const { profileId, profileSecret } = get();
        if (!profileId || !profileSecret) return null;
        set({ loading: true, error: null });
        try {
          const profile = await profileApi.resetProfile(profileId, profileSecret);
          set({ ...adopt(profile), loading: false });
          return profile;
        } catch (e: any) {
          set({ loading: false, error: e?.message || 'Failed to reset profile' });
          return null;
        }
      },

      /**
       * Forget the persisted identity, keeping the display name so the create
       * flow can prefill it.
       *
       * Called when the server reports it has never heard of this profileId —
       * the identity is unusable (its secret authenticates nothing and no stats
       * can be attributed to it), so holding onto it only produces failures. The
       * landing page's create-profile gate is `hydrated && !profileId`, so
       * clearing it here is what re-opens that flow. `hydrated` is deliberately
       * left true: localStorage HAS been read, and resetting it would flash the
       * returning-player UI.
       */
      clearIdentity: () =>
        set({
          profileId: null,
          profileSecret: null,
          cachedProfile: null,
          avatar: null,
          outfit: null,
        }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'unoverse:profile',
      // Persist ONLY the durable identity + cached display fields — never the
      // runtime UI flags or the server-served stats snapshot (always re-fetched).
      partialize: (state) => ({
        profileId: state.profileId,
        profileSecret: state.profileSecret,
        displayName: state.displayName,
        avatar: state.avatar,
        outfit: state.outfit,
      }),
      // Flip `hydrated` once localStorage has been read so the landing page can
      // distinguish "no profile yet" from "not loaded yet" and avoid flashing the
      // create-profile modal for returning players.
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated();
      },
    },
  ),
);
