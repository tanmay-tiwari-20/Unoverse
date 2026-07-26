'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorScreenProps {
  title?: string;
  message?: string;
  /**
   * The underlying error. Only its `digest` is ever shown — production error
   * messages from Server Components are deliberately generic, and client
   * messages can contain internals a player has no use for. The digest is the
   * one piece that lets a report be matched to a server log.
   */
  error?: Error & { digest?: string };
  /**
   * Recovery without a reload — re-renders the failed subtree. Rendered as the
   * primary action when available, because it keeps the socket connection and
   * any in-progress round alive.
   */
  onRetry?: () => void;
  retryLabel?: string;
  /** Full page reload. Always offered as the guaranteed way out. */
  onReload?: () => void;
  /** Optional escape hatch back to the landing page. */
  onGoHome?: () => void;
}

/**
 * The single full-screen "something broke" surface.
 *
 * Shared by `app/error.tsx`, `app/global-error.tsx` and the top-level in-game
 * boundary so a crash looks the same wherever it happens, and so the recovery
 * affordances can't drift apart between them. Styled with plain utility classes
 * and no store/provider access on purpose: it has to be able to render when the
 * app around it is in an unknown state, including inside `global-error.tsx`
 * where the root layout itself has been replaced.
 */
export const ErrorScreen: React.FC<ErrorScreenProps> = ({
  title = 'Something went wrong',
  message = 'The game hit an unexpected problem. Your seat is still reserved — reloading will put you straight back at the table.',
  error,
  onRetry,
  retryLabel = 'Try again',
  onReload,
  onGoHome,
}) => {
  const reload = onReload ?? (() => {
    if (typeof window !== 'undefined') window.location.reload();
  });

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-6 overflow-hidden bg-slate-950 px-6 text-center text-slate-100">
      {/* Soft warning glow, purely decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full opacity-20 blur-[90px]"
        style={{ background: 'radial-gradient(circle, #f59e0b, transparent 70%)' }}
      />

      <div className="relative flex flex-col items-center gap-5 max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-arcade text-2xl tracking-wide text-slate-50">{title}</h1>
          <p className="text-sm leading-relaxed text-slate-400">{message}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition hover:bg-amber-400 active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              {retryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={reload}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black uppercase tracking-wider transition active:scale-95 ${
              onRetry
                ? 'border border-white/15 bg-white/10 text-slate-100 hover:bg-white/20'
                : 'bg-amber-500 text-slate-950 shadow-lg hover:bg-amber-400'
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Reload Game
          </button>
          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-slate-300 transition hover:bg-white/10 active:scale-95"
            >
              <Home className="h-4 w-4" />
              Home
            </button>
          )}
        </div>

        {error?.digest && (
          <p className="font-mono text-[11px] text-slate-600">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
};
