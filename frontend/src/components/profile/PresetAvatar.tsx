"use client";

/**
 * Renders a human preset avatar (resolved from its stored key) as an arcade-styled
 * badge: a gradient disc with the character's vector SVG illustration and the game's
 * chunky white ring + hard shadow.
 */
import React from "react";
import { getPresetAvatar } from "../../lib/profile/avatars";
import { HumanAvatarSvg } from "./HumanAvatarSvg";

interface PresetAvatarProps {
  /** Stored avatar key (`Profile.avatarUrl`). Null/unknown or legacy keys fall back safely. */
  avatarKey: string | null | undefined;
  /** Disc diameter in px. */
  size?: number;
  className?: string;
}

export function PresetAvatar({ avatarKey, size = 56, className = "" }: PresetAvatarProps) {
  const preset = getPresetAvatar(avatarKey);

  return (
    <div
      className={`relative rounded-full bg-gradient-to-b ${preset.gradient} border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${preset.name} avatar`}
    >
      <HumanAvatarSvg preset={preset} size={size} />
    </div>
  );
}

export default PresetAvatar;
