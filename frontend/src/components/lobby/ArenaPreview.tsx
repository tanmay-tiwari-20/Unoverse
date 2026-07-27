'use client';

/**
 * ArenaPreview — procedural, asset-free thumbnails for the arena picker.
 *
 * Each card is pure CSS + inline SVG driven by `ArenaMeta` (gradient + accents +
 * motif), colour-matched to the in-scene 3D theme so the picker reads as the same
 * world without loading any Three.js. `ArenaGrid` is the shared selectable grid
 * used by both the create-room modal and the in-lobby re-picker.
 */

import React from 'react';
import { Shuffle } from 'lucide-react';
import { ArenaMeta, ArenaSelection } from '../../lib/arenas/types';
import { ARENA_LIST } from '../../lib/arenas/registry';

/** Small procedural motif layered over the gradient, one per arena theme. */
function Motif({ motif, accent, accent2 }: { motif: ArenaMeta['motif']; accent: string; accent2: string }) {
  switch (motif) {
    case 'tavern':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <radialGradient id="lamp" cx="50%" cy="30%" r="45%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#lamp)" />
          <ellipse cx="50" cy="72" rx="30" ry="8" fill={accent2} opacity="0.5" />
        </svg>
      );
    case 'stars':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 40 }).map((_, i) => {
            const x = (i * 37) % 100;
            const y = (i * 53) % 100;
            const r = (i % 3) * 0.4 + 0.4;
            return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.4 + (i % 3) * 0.2} />;
          })}
          <circle cx="72" cy="30" r="10" fill={accent2} opacity="0.6" />
          <circle cx="24" cy="60" r="5" fill={accent} opacity="0.7" />
        </svg>
      );
    case 'leaves':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <circle key={i} cx={(i * 29) % 100} cy={15 + ((i * 17) % 40)} r={7 + (i % 3) * 3} fill={i % 2 ? accent : accent2} opacity="0.55" />
          ))}
          <path d="M0 82 Q50 68 100 82 L100 100 L0 100 Z" fill={accent2} opacity="0.5" />
        </svg>
      );
    case 'aurora':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <linearGradient id="aur" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent} stopOpacity="0" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.8" />
              <stop offset="100%" stopColor={accent2} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 40 Q30 15 55 35 T100 30 L100 55 Q60 40 30 60 T0 55 Z" fill="url(#aur)" />
          <path d="M0 60 Q40 45 70 62 T100 58 L100 74 Q55 62 25 78 T0 72 Z" fill="url(#aur)" opacity="0.6" />
        </svg>
      );
    case 'neon':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {[20, 40, 60, 80].map((x) => (
            <rect key={x} x={x} y={30 + (x % 30)} width={8} height={70} fill={x % 40 ? accent : accent2} opacity="0.55" />
          ))}
          {[35, 55, 75].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={accent} strokeWidth="0.5" opacity="0.4" />
          ))}
        </svg>
      );
    case 'lava':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <radialGradient id="glow" cx="50%" cy="90%" r="60%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <polygon points="30,55 50,25 70,55" fill={accent2} opacity="0.5" />
          <rect x="0" y="60" width="100" height="40" fill="url(#glow)" />
          {[15, 45, 78].map((x, i) => (
            <path key={x} d={`M${x} 70 q5 8 0 16 t0 14`} stroke={accent} strokeWidth="1.4" fill="none" opacity={0.7 - i * 0.15} />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

export function ArenaPreview({
  meta,
  selected,
  disabled,
  onClick,
}: {
  meta: ArenaMeta;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${meta.name}: ${meta.description}`}
      className={`group relative rounded-2xl overflow-hidden border-2 text-left transition-transform ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-[1.03]'
      }`}
      style={{
        borderColor: selected ? meta.accent : 'rgba(255,255,255,0.18)',
        boxShadow: selected ? `0 0 0 2px ${meta.accent}, 0 0 20px ${meta.accent}66` : undefined,
      }}
    >
      {/* Gradient backdrop */}
      <div
        className="aspect-[4/3] w-full relative"
        style={{ background: `linear-gradient(160deg, ${meta.gradient[0]}, ${meta.gradient[1]}, ${meta.gradient[2]})` }}
      >
        <Motif motif={meta.motif} accent={meta.accent} accent2={meta.accent2} />
        {/* Platform hint at the base */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-2 w-2/3 h-3 rounded-[50%]"
          style={{ background: meta.accent, opacity: 0.35, filter: 'blur(2px)' }}
        />
      </div>

      {/* Label bar */}
      <div className="px-2.5 py-2 bg-black/70">
        <div className="font-arcade text-[10px] uppercase tracking-wide text-white truncate" style={{ color: selected ? meta.accent : '#fff' }}>
          {meta.name}
        </div>
        <div className="font-rounded text-[9px] leading-tight text-white/60 mt-0.5 line-clamp-2">{meta.description}</div>
      </div>
    </button>
  );
}

/** The "surprise me" card — resolves to a concrete themed arena server-side. */
function RandomCard({ selected, disabled, onClick }: { selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label="Random arena — a surprise themed world chosen for you"
      className={`group relative rounded-2xl overflow-hidden border-2 text-left transition-transform ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-[1.03]'
      }`}
      style={{
        borderColor: selected ? '#ffd34d' : 'rgba(255,255,255,0.18)',
        boxShadow: selected ? '0 0 0 2px #ffd34d, 0 0 20px #ffd34d66' : undefined,
      }}
    >
      <div className="aspect-[4/3] w-full relative flex items-center justify-center bg-[conic-gradient(from_0deg,#5fd0ff,#8ff06a,#a8ecff,#ff4fd8,#ff7a2f,#5fd0ff)]">
        <div className="absolute inset-0 bg-black/40" />
        <Shuffle size={30} className="relative text-white drop-shadow" />
      </div>
      <div className="px-2.5 py-2 bg-black/70">
        <div className="font-arcade text-[10px] uppercase tracking-wide" style={{ color: selected ? '#ffd34d' : '#fff' }}>
          Random
        </div>
        <div className="font-rounded text-[9px] leading-tight text-white/60 mt-0.5 line-clamp-2">A surprise themed world.</div>
      </div>
    </button>
  );
}

/**
 * Selectable arena grid, shared by the create modal and the lobby re-picker.
 * `value` is the current selection (a concrete id or `random`); `onChange` fires
 * with the picked selection.
 */
export function ArenaGrid({
  value,
  onChange,
  disabled,
  includeRandom = true,
}: {
  value: ArenaSelection;
  onChange: (sel: ArenaSelection) => void;
  disabled?: boolean;
  includeRandom?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {includeRandom && <RandomCard selected={value === 'random'} disabled={disabled} onClick={() => onChange('random')} />}
      {ARENA_LIST.map((meta) => (
        <ArenaPreview key={meta.id} meta={meta} selected={value === meta.id} disabled={disabled} onClick={() => onChange(meta.id)} />
      ))}
    </div>
  );
}
