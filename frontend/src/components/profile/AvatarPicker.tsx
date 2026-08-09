"use client";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, User, Users } from "lucide-react";
import { PRESET_AVATARS, getPresetAvatar } from "../../lib/profile/avatars";
import { HumanAvatarSvg } from "./HumanAvatarSvg";

interface AvatarPickerProps {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}

type GenderFilter = "all" | "male" | "female";

export function AvatarPicker({ value, onChange, disabled }: AvatarPickerProps) {
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");

  // Selected preset metadata (handles legacy auto-migration key lookup)
  const currentSelected = useMemo(() => getPresetAvatar(value), [value]);

  // Filtered avatar collection by gender
  const filteredAvatars = useMemo(() => {
    return PRESET_AVATARS.filter((a) => {
      if (genderFilter !== "all" && a.gender !== genderFilter) return false;
      return true;
    });
  }, [genderFilter]);

  return (
    <div className="flex flex-col gap-2.5 select-none">
      {/* ------------------------------------------------------------------ */}
      {/* 1. GENDER FILTER TABS                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="ui-hud-glass flex items-center p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setGenderFilter("all")}
            className={`px-2.5 py-1 rounded-lg font-rounded text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
              genderFilter === "all"
                ? "bg-yellow-400 text-black shadow"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <Users size={12} /> All ({PRESET_AVATARS.length})
          </button>
          <button
            type="button"
            onClick={() => setGenderFilter("male")}
            className={`px-2.5 py-1 rounded-lg font-rounded text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
              genderFilter === "male"
                ? "bg-yellow-400 text-black shadow"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <User size={12} /> Guys (20)
          </button>
          <button
            type="button"
            onClick={() => setGenderFilter("female")}
            className={`px-2.5 py-1 rounded-lg font-rounded text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
              genderFilter === "female"
                ? "bg-yellow-400 text-black shadow"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <User size={12} /> Girls (20)
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. AVATAR ICON GRID (Clean, Smooth-Scrolling)                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        role="radiogroup"
        aria-label="Choose a human avatar character"
        className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 max-h-[310px] overflow-y-auto overscroll-contain custom-scrollbar p-2 touch-pan-y"
        style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      >
        <AnimatePresence mode="popLayout">
          {filteredAvatars.map((preset) => {
            const isSelected = currentSelected.key === preset.key;
            return (
              <motion.button
                key={preset.key}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Avatar ${preset.key}`}
                disabled={disabled}
                onClick={() => onChange(preset.key)}
                whileHover={{ scale: disabled ? 1 : 1.08 }}
                whileTap={{ scale: disabled ? 1 : 0.92 }}
                style={{ touchAction: "pan-y" }}
                className={`relative aspect-square rounded-full bg-gradient-to-b ${preset.gradient} border-[3.5px] flex items-center justify-center text-white transition-all cursor-pointer disabled:cursor-not-allowed overflow-visible ${
                  isSelected
                    ? "border-yellow-400 shadow-[0_0_0_3px_rgba(250,204,21,0.6),0_4px_12px_rgba(0,0,0,0.5)] scale-105 z-10"
                    : "border-white/80 shadow-[0_3px_6px_rgba(0,0,0,0.3)] hover:border-white hover:scale-105"
                }`}
              >
                {/* SVG Character Portrait inside Disc */}
                <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
                  <HumanAvatarSvg preset={preset} size={64} />
                </div>

                {/* Selected Indicator Badge */}
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5.5 h-5.5 rounded-full bg-yellow-400 border-2 border-black flex items-center justify-center shadow-md z-20"
                  >
                    <Check size={12} className="text-black" strokeWidth={3.5} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AvatarPicker;
