"use client";

/**
 * First-visit identity flow. Shown on the landing page when no persistent
 * profile exists yet: the player picks a username + a preset avatar ONCE, and is
 * never re-prompted (the profile persists in localStorage and on the server).
 *
 * Reuses the exact arcade modal pattern already in the codebase (AnimatePresence
 * + spring, panel-arcade, arcade-dots, btn-arcade, arcade-stroke-*). No external
 * assets, layouts, branding, or artwork are copied.
 */
import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, UserPlus } from "lucide-react";
import { useProfileStore } from "../../store/useProfileStore";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { DEFAULT_AVATAR_KEY } from "../../lib/profile/avatars";
import { DEFAULT_OUTFIT_KEY } from "../../lib/cosmetics/outfits";
import { AvatarPicker } from "./AvatarPicker";
import { PresetAvatar } from "./PresetAvatar";

interface CreateProfileModalProps {
  isOpen: boolean;
  /** Called with the created display name so the caller can prefill the name field. */
  onCreated?: (displayName: string) => void;
  /** Optional initial username (e.g. whatever the player already typed on landing). */
  initialName?: string;
}

export function CreateProfileModal({ isOpen, onCreated, initialName = "" }: CreateProfileModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const createProfile = useProfileStore((s) => s.createProfile);
  const loading = useProfileStore((s) => s.loading);
  const storeError = useProfileStore((s) => s.error);

  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR_KEY);
  const [outfit, setOutfit] = useState(DEFAULT_OUTFIT_KEY);
  const [localError, setLocalError] = useState<string | null>(null);

  // Focus the name field on open; this modal has no close affordance (identity
  // is required to proceed) so Escape-to-close is disabled.
  useDialogA11y(dialogRef, isOpen, undefined, {
    closeOnEscape: false,
    initialFocusRef: nameRef,
  });

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Please choose a username.");
      return;
    }
    setLocalError(null);
    const profile = await createProfile(trimmed, avatar, outfit);
    if (profile) onCreated?.(profile.displayName);
  };

  const error = localError || storeError;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 pointer-events-auto"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-profile-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="panel-arcade bg-gradient-to-b from-neutral-900 to-black w-full max-w-lg sm:max-w-xl md:max-w-2xl flex flex-col relative overflow-hidden max-h-[90dvh]"
          >
            <div className="absolute inset-0 arcade-dots pointer-events-none" />

            {/* Header */}
            <div className="relative flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center short:gap-1.5 short:pt-3 short:pb-2">
              <PresetAvatar avatarKey={avatar} size={72} className="arcade-bob short:hidden" />
              <h2
                id="create-profile-title"
                className="font-arcade text-2xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2 short:text-lg"
              >
                <UserPlus size={22} className="text-white" /> Create Profile
              </h2>
              {/* The pitch is onboarding copy, not instruction — on a landscape
                  phone the name field and confirm button matter more. */}
              <p className="font-rounded font-semibold text-white/75 text-xs leading-relaxed short:hidden">
                Set up your player once — your stats, match history, and Player ID
                stick with you across every game.
              </p>
            </div>

            <div className="relative px-6 pb-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 short:pb-3 short:gap-2.5">
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-red-500/90 border-4 border-white rounded-2xl p-3 flex gap-2.5 items-center text-sm text-white font-rounded font-bold shadow-[0_6px_0_0_rgba(0,0,0,0.3)]">
                      <AlertCircle size={18} className="text-white shrink-0" />
                      <span>{error}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="create-profile-name"
                  className="font-arcade text-[0.7rem] uppercase tracking-wide text-white/70 px-1"
                >
                  Username
                </label>
                <input
                  id="create-profile-name"
                  ref={nameRef}
                  type="text"
                  maxLength={12}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                  placeholder="Your Name"
                  aria-label="Username"
                  disabled={loading}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="w-full bg-white/10 border-[3px] border-white/70 rounded-2xl px-4 py-3.5 text-white placeholder-white/50 text-center tracking-wide font-rounded font-bold uppercase focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all text-base"
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-arcade text-[0.7rem] uppercase tracking-wide text-white/70 px-1">
                  Choose Your Character Avatar
                </span>
                <AvatarPicker
                  value={avatar}
                  onChange={(key) => {
                    setAvatar(key);
                    setOutfit(key);
                  }}
                  disabled={loading}
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="btn-arcade w-full bg-gradient-to-b from-lime-400 to-green-600 text-white py-4 text-sm uppercase disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2 mt-1"
              >
                {loading ? "Creating…" : "Let's Play!"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
