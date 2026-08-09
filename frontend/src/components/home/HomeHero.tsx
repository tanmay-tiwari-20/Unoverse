"use client";

import React from "react";
import { Gamepad2, Globe2, Layers, Sparkles, Users } from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    label: "Up to 10 Players",
    tone: "from-violet-500/20 to-purple-600/10 border-violet-400/35 text-violet-300",
  },
  {
    icon: Layers,
    label: "6 Themed Arenas",
    tone: "from-emerald-500/20 to-teal-600/10 border-emerald-400/35 text-emerald-300",
  },
  {
    icon: Gamepad2,
    label: "Real-Time 3D Table",
    tone: "from-sky-500/20 to-blue-600/10 border-sky-400/35 text-sky-300",
  },
  {
    icon: Globe2,
    label: "Cross-Platform",
    tone: "from-amber-500/20 to-orange-600/10 border-amber-400/35 text-amber-300",
  },
] as const;

export interface HomeHeroProps {
  className?: string;
}

export const HomeHero: React.FC<HomeHeroProps> = ({ className = "" }) => (
  <div
    className={`flex flex-col items-center gap-4 text-center short:items-start short:text-left ${className}`}
  >
    {/* Floating Hero Wordmark Block */}
    <div className="arcade-bob flex flex-col items-center gap-2 short:items-start">
      {/* Playful UNO color badge pill */}
      <div className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 border border-white/15 backdrop-blur-md shadow-lg">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
        <span className="font-rounded ml-1 text-[10px] font-extrabold uppercase tracking-widest text-white/80">
          3D Arcade
        </span>
      </div>

      <h1 className="home-wordmark font-arcade arcade-stroke-uno text-yellow-400 drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)] tracking-wide">
        UNOVERSE!
      </h1>

      <div className="flex items-center gap-2">
        <span className="font-rounded text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/90 bg-gradient-to-r from-white/15 to-white/5 px-3.5 py-1 rounded-full border border-white/20 backdrop-blur-md shadow-lg flex items-center gap-1.5">
          <Sparkles size={13} className="text-yellow-300 animate-pulse" aria-hidden="true" />
          Party Card Battle
        </span>
      </div>
    </div>

    {/* Feature Chips */}
    <div className="home-features">
      {FEATURES.map(({ icon: Icon, label, tone }) => (
        <span
          key={label}
          className={`home-chip font-rounded text-[10px] sm:text-[11px] font-bold text-white/90 border bg-gradient-to-br ${tone} backdrop-blur-md transition-all hover:scale-105 hover:border-white/40 cursor-default px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5`}
        >
          <Icon size={13} className="shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      ))}
    </div>
  </div>
);

export default HomeHero;
