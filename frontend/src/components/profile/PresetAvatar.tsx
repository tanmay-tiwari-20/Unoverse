"use client";

/**
 * Renders a preset avatar (resolved from its stored key) as an arcade-styled
 * badge: a gradient disc with the preset's lucide icon and the game's chunky
 * white ring + hard shadow. Self-contained — does not touch the in-game
 * `table/Avatar.tsx`, so the in-game UI is unchanged.
 */
import React from "react";
import { getPresetAvatar } from "../../lib/profile/avatars";

interface PresetAvatarProps {
  /** Stored avatar key (`Profile.avatarUrl`). Null/unknown falls back to default. */
  avatarKey: string | null | undefined;
  /** Disc diameter in px. */
  size?: number;
  className?: string;
}

export function PresetAvatar({ avatarKey, size = 56, className = "" }: PresetAvatarProps) {
  const preset = getPresetAvatar(avatarKey);
  const Icon = preset.Icon;
  // Icon scales with the disc; clamp so tiny chips stay legible.
  const iconSize = Math.max(14, Math.round(size * 0.5));

  return (
    <div
      className={`relative rounded-full bg-gradient-to-b ${preset.gradient} border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${preset.label} avatar`}
    >
      <Icon size={iconSize} className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
    </div>
  );
}
