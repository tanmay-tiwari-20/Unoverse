'use client';

import React from 'react';

/**
 * Buttons. One geometry, a fixed set of tones — so "primary" means the same
 * thing on the results screen as it does in the friends list.
 *
 * Tones are literal class strings (never interpolated) because Tailwind only
 * generates classes it can see in source.
 */

export type ButtonTone =
  | 'primary' // the main action on the surface — yellow, one per view
  | 'success' // join / accept
  | 'danger' // leave / remove / decline
  | 'neutral' // secondary / dismiss
  | 'info'; // invite / view

export type ButtonSize = 'sm' | 'md' | 'lg';

const TONE: Record<ButtonTone, string> = {
  primary: 'bg-gradient-to-b from-yellow-400 to-amber-600 text-[#1a1033]',
  success: 'bg-gradient-to-b from-lime-400 to-green-600 text-white',
  danger: 'bg-gradient-to-b from-rose-500 to-red-700 text-white',
  neutral: 'bg-gradient-to-b from-neutral-700 to-neutral-900 text-white',
  info: 'bg-gradient-to-b from-sky-400 to-blue-600 text-white',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-[10px] px-2.5 gap-1',
  md: 'text-[11px] sm:text-xs px-3.5 gap-1.5',
  lg: 'text-sm sm:text-base px-5 gap-2',
};

// Heights come from the tap token so every button clears the same minimum on
// touch devices and shrinks together on landscape phones.
const HEIGHT: Record<ButtonSize, string> = {
  sm: 'calc(var(--ui-tap) - 8px)',
  md: 'var(--ui-tap)',
  lg: 'calc(var(--ui-tap) + 6px)',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: React.ReactNode;
  /** Stretch to the container width (footer actions). */
  block?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  tone = 'neutral',
  size = 'md',
  icon,
  block,
  children,
  className = '',
  style,
  ...rest
}) => (
  <button
    {...rest}
    className={`btn-arcade inline-flex items-center justify-center whitespace-nowrap font-bold uppercase tracking-wide disabled:cursor-not-allowed ${
      TONE[tone]
    } ${SIZE[size]} ${block ? 'w-full' : ''} ${rest.disabled ? '' : 'cursor-pointer'} ${className}`}
    style={{ minHeight: HEIGHT[size], ...style }}
  >
    {icon}
    {children}
  </button>
);

/**
 * Square icon-only button for row actions. Quieter than a full arcade button so
 * a friend row with three of them doesn't turn into a wall of plastic, but still
 * a real tap target.
 */
export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    tone?: ButtonTone | 'ghost';
    children: React.ReactNode;
  }
> = ({ label, tone = 'ghost', children, className = '', style, ...rest }) => {
  const look =
    tone === 'ghost'
      ? 'border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white'
      : tone === 'danger'
        ? 'border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
        : tone === 'success'
          ? 'border-lime-400/40 bg-lime-500/15 text-lime-300 hover:bg-lime-500/25'
          : tone === 'info'
            ? 'border-sky-400/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
            : tone === 'primary'
              ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-300 hover:bg-yellow-500/25'
              : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10';

  return (
    <button
      {...rest}
      aria-label={label}
      title={rest.title ?? label}
      className={`grid shrink-0 place-items-center rounded-xl border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${look} ${
        rest.disabled ? '' : 'cursor-pointer'
      } ${className}`}
      style={{ width: 'var(--ui-tap)', height: 'var(--ui-tap)', ...style }}
    >
      {children}
    </button>
  );
};

export default Button;
