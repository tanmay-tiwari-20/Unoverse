"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { OUTFITS, getOutfit } from "../../lib/cosmetics/outfits";
import PreviewStage from "../home/PreviewStage";

interface OutfitPickerProps {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  /** Render the built-in 3D preview above the grid. Default true. */
  showPreview?: boolean;
}

export function OutfitPicker({ value, onChange, disabled, showPreview = true }: OutfitPickerProps) {
  // Same catalog lookup the stage does internally — used here only for the
  // preview's backdrop tint and caption, so those track the selection too.
  const selectedOutfit = getOutfit(value);

  return (
    <div className="flex flex-col gap-3">
      {/* Live preview. The stage paints no background of its own, so the
          outfit's own gradient shows through behind the character. */}
      {showPreview && (
        <div
          className={`relative overflow-hidden rounded-2xl border-[3px] border-white/20 bg-gradient-to-b ${selectedOutfit.gradient} shadow-[0_3px_0_0_rgba(0,0,0,0.3)]`}
        >
          <div className="absolute inset-0 bg-black/25" />
          <PreviewStage
            // Remount-free re-skin: the key is data, not identity.
            outfitKey={value}
            className="relative h-48 w-full sm:h-56"
          />
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white/85">
            {selectedOutfit.label}
          </span>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Choose an outfit"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      >
      {OUTFITS.map((outfit) => {
        const selected = outfit.key === value;
        return (
          <motion.button
            key={outfit.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={outfit.label}
            disabled={disabled}
            onClick={() => onChange(outfit.key)}
            whileTap={{ scale: 0.95 }}
            className={`relative flex items-center gap-2.5 rounded-2xl border-[3px] p-2.5 text-left transition-all cursor-pointer disabled:cursor-not-allowed ${
              selected
                ? "border-yellow-400 shadow-[0_0_0_2px_rgba(250,204,21,0.6),0_4px_0_0_rgba(0,0,0,0.3)] scale-[1.03]"
                : "border-white/20 shadow-[0_3px_0_0_rgba(0,0,0,0.3)] hover:border-white/50"
            }`}
          >
            {/* Palette swatch */}
            <span
              className={`h-10 w-10 shrink-0 rounded-xl bg-gradient-to-b ${outfit.gradient} border-2 border-white/60 flex items-end justify-center gap-0.5 p-1`}
            >
              <span className="h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: outfit.primary }} />
              <span className="h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: outfit.accent }} />
              <span className="h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: outfit.secondary }} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                {outfit.label}
              </span>
              {outfit.arenaAffinity && (
                <span className="mt-0.5 inline-block rounded-full bg-black/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white/70">
                  {outfit.arenaAffinity}
                </span>
              )}
            </span>

            {selected && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-yellow-400">
                <Check size={11} className="text-black" strokeWidth={3.5} />
              </span>
            )}
          </motion.button>
        );
      })}
      </div>
    </div>
  );
}
