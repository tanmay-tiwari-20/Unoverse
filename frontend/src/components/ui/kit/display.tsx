'use client';

import React from 'react';

/**
 * Display primitives — tabs, stat tiles, badges, empty/loading states. These are
 * the pieces that repeat across the five surfaces, so keeping them here is what
 * makes the scoreboard, friends list, settings, profile and results screen read
 * as one product rather than five separately-styled panels.
 */

/* --- Tabs ------------------------------------------------------------- */

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Small count bubble (unread requests, friend count). */
  badge?: number;
}

/**
 * Tab strip. Icon + label on wide screens, icon + count only when space is
 * tight, so three tabs never wrap on a 360px phone.
 */
export function TabBar<T extends string>({
  value,
  onChange,
  items,
  label,
  className = '',
}: {
  value: T;
  onChange: (next: T) => void;
  items: readonly TabItem<T>[];
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`ui-segment ${className}`}>
      {items.map((t) => {
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={selected}
            aria-controls={`tabpanel-${t.value}`}
            id={`tab-${t.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className="ui-segment-item flex items-center justify-center gap-1.5"
            style={{ minHeight: 'calc(var(--ui-tap) - 8px)' }}
          >
            {t.icon}
            <span className="truncate">{t.label}</span>
            {t.badge != null && t.badge > 0 && (
              <span
                className={`inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-[15px] ${
                  selected ? 'bg-black/25 text-black' : 'bg-rose-500 text-white'
                }`}
              >
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --- Stats ------------------------------------------------------------ */

export type StatTone = 'default' | 'good' | 'bad' | 'gold' | 'info';

const TONE_TEXT: Record<StatTone, string> = {
  default: 'text-white',
  good: 'text-lime-300',
  bad: 'text-rose-300',
  gold: 'text-yellow-300',
  info: 'text-sky-300',
};

/** Compact number + caption tile. The number leads; the caption never competes. */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  /** Third line — "of 42 games", a delta, a rank. */
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}> = ({ label, value, tone = 'default', sub, icon, className = '' }) => (
  <div className={`ui-tile ${className}`}>
    <span
      className={`font-arcade tabular-nums leading-none text-[clamp(0.95rem,0.8rem+0.8vw,1.35rem)] ${TONE_TEXT[tone]}`}
    >
      {value}
    </span>
    <span className="font-rounded text-[9px] font-bold uppercase tracking-wider text-white/45 leading-tight flex items-center gap-1">
      {icon}
      {label}
    </span>
    {sub && (
      <span className="font-rounded text-[9px] font-bold text-white/35 leading-tight">{sub}</span>
    )}
  </div>
);

/** Section heading inside a panel body. */
export const SectionLabel: React.FC<{
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned trailing content — a count, a "see all" link. */
  trailing?: React.ReactNode;
  className?: string;
}> = ({ children, icon, trailing, className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <span className="ui-section-label">
      {icon}
      {children}
    </span>
    <span className="ui-divider flex-1" />
    {trailing}
  </div>
);

/* --- Badges ----------------------------------------------------------- */

export type BadgeTone = 'neutral' | 'good' | 'bad' | 'gold' | 'info' | 'violet';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-white/10 text-white/70 border-white/15',
  good: 'bg-lime-500/15 text-lime-300 border-lime-400/40',
  bad: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
  gold: 'bg-yellow-500/15 text-yellow-300 border-yellow-400/40',
  info: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-400/40',
};

/**
 * Small status pill. Always carries a glyph or text — never colour alone, so a
 * "host" or "bot" marker still reads for a colour-blind player.
 */
export const Badge: React.FC<{
  children?: React.ReactNode;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  /** Screen-reader text when the badge is icon-only. */
  srLabel?: string;
  title?: string;
  className?: string;
}> = ({ children, tone = 'neutral', icon, srLabel, title, className = '' }) => (
  <span
    title={title}
    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] font-rounded text-[9px] font-bold uppercase tracking-wide leading-[14px] ${BADGE_TONE[tone]} ${className}`}
  >
    {icon}
    {children}
    {srLabel && <span className="sr-only">{srLabel}</span>}
  </span>
);

/* --- Notices ---------------------------------------------------------- */

export type NoticeTone = 'info' | 'good' | 'warn' | 'bad';

// `.ui-note-*` rather than Tailwind tints: globals.css is unlayered, so a
// `border-amber-400/40` utility would lose to `.ui-note`'s border shorthand.
const NOTICE_TONE: Record<NoticeTone, string> = {
  info: 'ui-note-info',
  good: 'ui-note-good',
  warn: 'ui-note-warn',
  bad: 'ui-note-bad',
};

/**
 * One-line explanation of the state a surface is in — "rules are locked",
 * "host only", "all seats taken". Always icon + sentence, so the tone colour is
 * reinforcement rather than the message itself.
 */
export const Notice: React.FC<{
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: NoticeTone;
  /** `alert` only for something that just went wrong; `status` otherwise. */
  role?: 'status' | 'alert';
  className?: string;
}> = ({ children, icon, tone = 'info', role = 'status', className = '' }) => (
  <div role={role} className={`ui-note ${NOTICE_TONE[tone]} ${className}`}>
    {icon && <span className="mt-[1px] shrink-0">{icon}</span>}
    <p className="font-rounded min-w-0 flex-1 text-[11px] font-bold leading-snug">{children}</p>
  </div>
);

/* --- Empty / loading -------------------------------------------------- */

/** The shared "nothing here" block. Icon, one line of what, one line of why. */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, hint, action, className = '' }) => (
  <div
    className={`flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center short:py-4 ${className}`}
  >
    {icon && <span className="text-white/20">{icon}</span>}
    <p className="font-arcade text-[11px] uppercase tracking-wider text-white/60">{title}</p>
    {hint && (
      <p className="font-rounded max-w-[26ch] text-[10px] font-bold leading-snug text-white/35">
        {hint}
      </p>
    )}
    {action && <div className="mt-1.5">{action}</div>}
  </div>
);

/**
 * Loading placeholder shaped like the row it replaces, so the list does not jump
 * when data lands. Pulse only — no shimmer sweep, which would mean an extra
 * animated layer per row.
 */
export const Skeleton: React.FC<{ className?: string; rounded?: string }> = ({
  className = 'h-12',
  rounded = 'rounded-2xl',
}) => (
  <div
    aria-hidden="true"
    className={`animate-pulse bg-white/[0.06] border-2 border-white/[0.04] ${rounded} ${className}`}
  />
);

/** A list of `count` skeleton rows with the row gap already applied. */
export const SkeletonList: React.FC<{ count?: number; height?: string }> = ({
  count = 3,
  height = 'h-14',
}) => (
  <div className="flex flex-col" style={{ gap: 'var(--ui-gap-tight)' }} aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} className={height} />
    ))}
  </div>
);
