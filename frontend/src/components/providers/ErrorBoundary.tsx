'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../../utils/logger';

interface ErrorBoundaryProps {
  /**
   * Human-readable name of the region being guarded ("3D Table", "Chat"). Used
   * in logs and in the default fallback so a report says *what* broke.
   */
  section: string;
  children: ReactNode;
  /**
   * What to render instead of `children` after a crash. A function receives the
   * error and a `retry` callback that clears the boundary and re-mounts the
   * subtree, so a fallback can offer recovery in place.
   *
   * Omitted entirely (`undefined`) renders the compact default notice; passing
   * `null` renders nothing at all, which is right for purely decorative regions
   * whose absence is better than any message.
   */
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  /** Extra reporting hook (analytics, Sentry) on top of the built-in logging. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * When any value in this list changes, a crashed boundary resets itself. Use
   * it to tie recovery to navigation or to the identity of the data being
   * rendered, so moving to a different room doesn't inherit the old crash.
   */
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Section-level React Error Boundary.
 *
 * Next.js's `error.tsx` catches errors at *route* granularity: anything thrown
 * below it replaces the entire page. That is the right net for an unexpected
 * failure, but far too blunt for a game screen where one optional widget — a
 * chat panel, a voice indicator, a decorative 3D effect — must not be able to
 * take the table down with it.
 *
 * Wrapping each independent region in one of these makes failures local: the
 * broken region is replaced by its fallback and everything around it keeps
 * running, including the live socket connection and the authoritative game
 * state. Anything the boundary cannot handle still bubbles to `error.tsx`.
 *
 * Must be a class component — `getDerivedStateFromError`/`componentDidCatch`
 * have no hook equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always logged, in every environment: `logger.error` is never silenced, so
    // a production crash still leaves a breadcrumb in the user's console for a
    // bug report even though the UI only shows a friendly message.
    logger.error(
      `[ErrorBoundary] "${this.props.section}" crashed:`,
      error,
      errorInfo.componentStack
    );
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.error || !this.props.resetKeys) return;
    const prevKeys = prevProps.resetKeys ?? [];
    const nextKeys = this.props.resetKeys;
    const changed =
      prevKeys.length !== nextKeys.length ||
      nextKeys.some((key, i) => !Object.is(key, prevKeys[i]));
    if (changed) this.reset();
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback, section } = this.props;
    if (fallback === null) return null;
    if (typeof fallback === 'function') return fallback(error, this.reset);
    if (fallback !== undefined) return fallback;

    // Default: a small, self-contained notice that doesn't assume any layout.
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm font-semibold text-slate-200">
          {section} couldn&apos;t be displayed.
        </p>
        <p className="text-xs text-slate-400">
          The rest of the game is unaffected.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-1 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-100 transition hover:bg-white/20"
        >
          Try again
        </button>
      </div>
    );
  }
}
