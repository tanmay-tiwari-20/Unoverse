'use client';

import { useEffect, useState } from 'react';

/**
 * Matches a media query with an SSR-safe `false` first paint.
 *
 * Shared by every surface that needs a genuinely different LAYOUT rather than a
 * scaled-down one — the modal shell (drawer vs. bottom sheet) and the roster
 * (anchored popover vs. centred dialog). CSS handles everything that is only a
 * size change; this hook is for the cases where the markup itself differs.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
