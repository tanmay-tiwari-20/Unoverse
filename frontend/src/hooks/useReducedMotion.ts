'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true if the user's OS has `prefers-reduced-motion: reduce` enabled.
 * SSR-safe: defaults to false during SSR, then hydrates from the media query.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mql.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

/**
 * Non-hook helper: returns the current OS reduced-motion preference.
 * Safe to call outside of React components (e.g. in store initializers).
 */
export function getReducedMotionPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
