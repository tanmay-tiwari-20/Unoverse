'use client';

import React, { useId } from 'react';

/**
 * Form primitives shared by Settings, Profile and the friends search. Each one
 * renders a `.ui-*` class from globals.css, so a visual tweak lands everywhere
 * at once instead of drifting per modal.
 *
 * They also fix a real bug in the old inline versions: those built Tailwind
 * classes by interpolation (`accent-${color}-500`, `bg-${color}-600/20`), which
 * Tailwind's scanner can't see, so the sliders and pickers shipped unstyled.
 * Accent colour is now passed as a CSS custom property instead.
 */

/** One labelled setting row: label + optional hint on the left, control right. */
export const Field: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  /** `stack` puts the control on its own line below (sliders, segments). */
  layout?: 'row' | 'stack';
  disabled?: boolean;
  className?: string;
}> = ({ label, hint, htmlFor, icon, children, layout = 'row', disabled, className = '' }) => (
  <div
    className={`ui-card px-2.5 py-2 sm:px-3 ${
      layout === 'row' ? 'flex items-center gap-3' : 'flex flex-col gap-1.5'
    } ${disabled ? 'opacity-50' : ''} ${className}`}
  >
    <div className={layout === 'row' ? 'min-w-0 flex-1' : 'flex items-center gap-2 min-w-0'}>
      <label
        htmlFor={htmlFor}
        className="font-rounded text-[11px] sm:text-xs font-bold text-white flex items-center gap-1.5 leading-tight"
      >
        {icon && <span className="shrink-0 text-white/60">{icon}</span>}
        <span className="truncate">{label}</span>
      </label>
      {hint && layout === 'row' && (
        <p className="font-rounded text-[10px] leading-snug text-white/45 mt-0.5">{hint}</p>
      )}
      {layout === 'stack' && <span className="ml-auto shrink-0">{hint}</span>}
    </div>
    <div className={layout === 'row' ? 'shrink-0' : ''}>{children}</div>
  </div>
);

/** Accessible switch. `role="switch"` + a travelling knob, so the state is
 *  readable from shape and position, not colour alone. */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}> = ({ checked, onChange, label, disabled, id }) => (
  <button
    id={id}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative shrink-0 rounded-full border-2 transition-colors ${
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
    } ${
      checked
        ? 'bg-gradient-to-b from-lime-400 to-green-600 border-white/60'
        : 'bg-black/60 border-white/20'
    }`}
    style={{ width: 44, height: 24 }}
  >
    <span
      aria-hidden="true"
      className={`absolute top-[2px] block rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform duration-150 ${
        checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
      }`}
      style={{ width: 16, height: 16 }}
    />
  </button>
);

/** Range slider with a filled track. `accent` is a literal colour (not a
 *  Tailwind class name) fed to `--range-fill`. */
export const Slider: React.FC<{
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** Rendered next to the label — usually "72%". */
  valueText?: string;
  accent?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueText,
  accent = '#38bdf8',
  disabled,
  icon,
}) => {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <Field
      layout="stack"
      label={label}
      htmlFor={id}
      icon={icon}
      disabled={disabled}
      hint={
        <span className="font-arcade text-[11px] tabular-nums text-white/80">
          {valueText ?? value}
        </span>
      }
    >
      <input
        id={id}
        type="range"
        className="ui-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            '--range-fill': accent,
            '--range-pct': `${pct}%`,
          } as React.CSSProperties
        }
      />
    </Field>
  );
};

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Long-form name for screen readers when the visible label is abbreviated. */
  srLabel?: string;
}

/** Radiogroup styled as a segmented track. Used for quality tiers and any
 *  small mutually-exclusive choice. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  className = '',
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly SegmentOption<T>[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`ui-segment ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.srLabel ?? o.label}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className="ui-segment-item truncate disabled:cursor-not-allowed"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
