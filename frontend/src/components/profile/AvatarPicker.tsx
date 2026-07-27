"use client";

/**
 * A grid of selectable preset avatars, reused by the create-profile and
 * edit-avatar flows. Purely presentational + controlled: the parent owns the
 * selected key. Arcade styling (chunky ring, hard shadow, spring pop) matches
 * the rest of the UI; no external assets.
 */
import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PRESET_AVATARS } from "../../lib/profile/avatars";

interface AvatarPickerProps {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}

export function AvatarPicker({ value, onChange, disabled }: AvatarPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose an avatar"
      className="grid grid-cols-4 gap-2.5 sm:grid-cols-6"
    >
      {PRESET_AVATARS.map((preset) => {
        const Icon = preset.Icon;
        const selected = preset.key === value;
        return (
          <motion.button
            key={preset.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={preset.label}
            disabled={disabled}
            onClick={() => onChange(preset.key)}
            whileTap={{ scale: 0.9 }}
            className={`relative aspect-square rounded-2xl bg-gradient-to-b ${preset.gradient} border-[3px] flex items-center justify-center text-white transition-all cursor-pointer disabled:cursor-not-allowed ${
              selected
                ? "border-yellow-400 shadow-[0_0_0_2px_rgba(250,204,21,0.6),0_4px_0_0_rgba(0,0,0,0.3)] scale-105"
                : "border-white/70 shadow-[0_3px_0_0_rgba(0,0,0,0.3)] hover:border-white"
            }`}
          >
            <Icon size={22} className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
            {selected && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-400 border-2 border-black flex items-center justify-center">
                <Check size={11} className="text-black" strokeWidth={3.5} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
