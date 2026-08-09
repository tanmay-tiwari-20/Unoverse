"use client";

import { motion } from "framer-motion";
import { Check, Shuffle, Sparkles } from "lucide-react";
import { ArenaMeta, ArenaSelection } from "../../lib/arenas/types";
import { ARENA_LIST } from "../../lib/arenas/registry";

function Motif({
  motif,
  accent,
  accent2,
}: {
  motif: ArenaMeta["motif"];
  accent: string;
  accent2: string;
}) {
  switch (motif) {
    case "tavern":
      return (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <radialGradient id="lamp" cx="50%" cy="30%" r="45%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#lamp)" />
          <ellipse
            cx="50"
            cy="72"
            rx="30"
            ry="8"
            fill={accent2}
            opacity="0.5"
          />
        </svg>
      );
    case "stars":
      return (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {Array.from({ length: 40 }).map((_, i) => {
            const x = (i * 37) % 100;
            const y = (i * 53) % 100;
            const r = (i % 3) * 0.4 + 0.4;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill="#fff"
                opacity={0.4 + (i % 3) * 0.2}
              />
            );
          })}
          <circle cx="72" cy="30" r="10" fill={accent2} opacity="0.6" />
          <circle cx="24" cy="60" r="5" fill={accent} opacity="0.7" />
        </svg>
      );
    case "leaves":
      return (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <circle
              key={i}
              cx={(i * 29) % 100}
              cy={15 + ((i * 17) % 40)}
              r={7 + (i % 3) * 3}
              fill={i % 2 ? accent : accent2}
              opacity="0.55"
            />
          ))}
          <path
            d="M0 82 Q50 68 100 82 L100 100 L0 100 Z"
            fill={accent2}
            opacity="0.5"
          />
        </svg>
      );
    case "aurora":
      return (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <linearGradient id="aur" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent} stopOpacity="0" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.8" />
              <stop offset="100%" stopColor={accent2} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 40 Q30 15 55 35 T100 30 L100 55 Q60 40 30 60 T0 55 Z"
            fill="url(#aur)"
          />
          <path
            d="M0 60 Q40 45 70 62 T100 58 L100 74 Q55 62 25 78 T0 72 Z"
            fill="url(#aur)"
            opacity="0.6"
          />
        </svg>
      );
    case "neon":
      return (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {[20, 40, 60, 80].map((x) => (
            <rect
              key={x}
              x={x}
              y={30 + (x % 30)}
              width={8}
              height={70}
              fill={x % 40 ? accent : accent2}
              opacity="0.55"
            />
          ))}
          {[35, 55, 75].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke={accent}
              strokeWidth="0.5"
              opacity="0.4"
            />
          ))}
        </svg>
      );
    case "lava":
      return (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <radialGradient id="glow" cx="50%" cy="90%" r="60%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <polygon points="30,55 50,25 70,55" fill={accent2} opacity="0.5" />
          <rect x="0" y="60" width="100" height="40" fill="url(#glow)" />
          {[15, 45, 78].map((x, i) => (
            <path
              key={x}
              d={`M${x} 70 q5 8 0 16 t0 14`}
              stroke={accent}
              strokeWidth="1.4"
              fill="none"
              opacity={0.7 - i * 0.15}
            />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

function SelectedTick({ accent }: { accent: string }) {
  return (
    <span
      className="absolute right-1.5 top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full border-2 border-black/50 shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
      style={{ background: accent, color: "#0b1020" }}
      aria-hidden="true"
    >
      <Check size={11} strokeWidth={4} />
    </span>
  );
}

export function ArenaPreview({
  meta,
  selected,
  disabled,
  onClick,
  onHover,
}: {
  meta: ArenaMeta;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  onHover?: (sel: ArenaSelection | null) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover?.(meta.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(meta.id)}
      onBlur={() => onHover?.(null)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${meta.name}: ${meta.description}`}
      whileHover={disabled ? undefined : { scale: 1.03, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`group relative flex flex-col text-left outline-none transition-all ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      style={{
        borderRadius: "var(--ui-radius-md)",
        border: selected
          ? `2px solid ${meta.accent}`
          : "2px solid rgba(255, 255, 255, 0.14)",
        boxShadow: selected
          ? `0 0 0 2px ${meta.accent}33, 0 0 24px ${meta.accent}55, 0 8px 20px rgba(0,0,0,0.5)`
          : "0 4px 12px rgba(0,0,0,0.35)",
      }}
    >
      {/* Inner wrapper with exact inner border-radius clipping */}
      <div className="flex h-full w-full flex-1 flex-col overflow-hidden rounded-[calc(var(--ui-radius-md)-2px)]">
        {selected && <SelectedTick accent={meta.accent} />}

        {selected && (
          <span
            className="font-arcade pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-black/40 px-2 py-0.5 text-[8px] uppercase tracking-wider text-black shadow-md"
            style={{ background: meta.accent }}
          >
            Selected
          </span>
        )}

        {/* Gradient thumbnail backdrop */}
        <div
          className="relative aspect-[4/3] w-full overflow-hidden short:aspect-[16/9]"
          style={{
            background: `linear-gradient(160deg, ${meta.gradient[0]}, ${meta.gradient[1]}, ${meta.gradient[2]})`,
          }}
        >
          <Motif
            motif={meta.motif}
            accent={meta.accent}
            accent2={meta.accent2}
          />

          {/* Ambient base platform reflection */}
          <div
            className="absolute left-1/2 bottom-1.5 h-3.5 w-3/4 -translate-x-1/2 rounded-[50%] transition-opacity group-hover:opacity-60"
            style={{
              background: meta.accent,
              opacity: selected ? 0.5 : 0.3,
              filter: "blur(3px)",
            }}
          />
        </div>

        {/* Label bar */}
        <div className="flex flex-1 flex-col justify-between border-t border-white/10 bg-black/80 px-2.5 py-2 backdrop-blur-md transition-colors group-hover:bg-black/90 rounded-[calc(var(--ui-radius-md)-2px)]">
          <div className="flex items-center justify-between gap-1">
            <div
              className="font-arcade truncate text-[11px] uppercase tracking-wide transition-colors"
              style={{ color: selected ? meta.accent : "#ffffff" }}
            >
              {meta.name}
            </div>
          </div>
          <div className="font-rounded mt-0.5 line-clamp-2 text-[9.5px] font-medium leading-tight text-white/55 short:hidden">
            {meta.description}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/** The "surprise me" card — resolves to a concrete themed arena server-side. */
function RandomCard({
  selected,
  disabled,
  onClick,
  onHover,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  onHover?: (sel: ArenaSelection | null) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover?.("random")}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.("random")}
      onBlur={() => onHover?.(null)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label="Random arena — a surprise themed world chosen for you"
      whileHover={disabled ? undefined : { scale: 1.03, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`group relative flex flex-col text-left outline-none transition-all ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      style={{
        borderRadius: "var(--ui-radius-md)",
        border: selected
          ? "2px solid #ffd34d"
          : "2px solid rgba(255, 255, 255, 0.14)",
        boxShadow: selected
          ? "0 0 0 2px #ffd34d33, 0 0 24px #ffd34d55, 0 8px 20px rgba(0,0,0,0.5)"
          : "0 4px 12px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex h-full w-full flex-1 flex-col overflow-hidden rounded-[calc(var(--ui-radius-md)-2px)]">
        {selected && <SelectedTick accent="#ffd34d" />}

        {selected && (
          <span className="font-arcade pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-black/40 bg-amber-400 px-2 py-0.5 text-[8px] uppercase tracking-wider text-black shadow-md">
            Surprise
          </span>
        )}

        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[conic-gradient(from_0deg,#5fd0ff,#8ff06a,#a8ecff,#ff4fd8,#ff7a2f,#5fd0ff)] short:aspect-[16/9]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity group-hover:bg-black/25" />
          <Shuffle
            size={32}
            className="relative text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
          />
          <Sparkles
            size={16}
            className="absolute right-2.5 top-2.5 text-amber-300 opacity-70 group-hover:animate-pulse"
          />
        </div>

        <div className="flex flex-1 flex-col justify-between border-t border-white/10 bg-black/80 px-2.5 py-2 backdrop-blur-md transition-colors group-hover:bg-black/90 rounded-[calc(var(--ui-radius-md)-2px)]">
          <div className="flex items-center justify-between gap-1">
            <div
              className="font-arcade text-[11px] uppercase tracking-wide transition-colors"
              style={{ color: selected ? "#ffd34d" : "#ffffff" }}
            >
              Random
            </div>
          </div>
          <div className="font-rounded mt-0.5 line-clamp-2 text-[9.5px] font-medium leading-tight text-white/55 short:hidden">
            A surprise themed world chosen for you.
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/**
 * Selectable arena grid, shared by the create modal and the lobby re-picker.
 * `value` is the current selection (a concrete id or `random`); `onChange` fires
 * with the picked selection.
 *
 * The column count is content-aware rather than a scaled-down desktop grid: two
 * across on a phone, three once there is room, and four on a landscape phone
 * where width is plentiful and height is the scarce axis.
 */
export function ArenaGrid({
  value,
  onChange,
  disabled,
  includeRandom = true,
  onHover,
}: {
  value: ArenaSelection;
  onChange: (sel: ArenaSelection) => void;
  disabled?: boolean;
  includeRandom?: boolean;
  onHover?: (sel: ArenaSelection | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:short:grid-cols-4 short:gap-2">
      {includeRandom && (
        <RandomCard
          selected={value === "random"}
          disabled={disabled}
          onClick={() => onChange("random")}
          onHover={onHover}
        />
      )}
      {ARENA_LIST.map((meta) => (
        <ArenaPreview
          key={meta.id}
          meta={meta}
          selected={value === meta.id}
          disabled={disabled}
          onClick={() => onChange(meta.id)}
          onHover={onHover}
        />
      ))}
    </div>
  );
}
