'use client';

import { useEffect, useState } from 'react';

export type ViewportSize = 'mobile' | 'tablet' | 'desktop';

export interface Viewport {
  width: number;
  height: number;
  /** Coarse device bucket derived from the smaller edge + pointer type. */
  size: ViewportSize;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  /** True for touch-primary devices (phones/tablets) — used to size tap targets. */
  isTouch: boolean;
}

// Breakpoints mirror the Tailwind scale used across the HUD (sm=640, md=768,
// lg=1024) so JS-driven layout stays in step with the CSS breakpoints.
const MOBILE_MAX = 640;
const TABLET_MAX = 1024;

function classify(width: number, height: number, isTouch: boolean): ViewportSize {
  // Use the shorter edge so a phone held sideways is still "mobile".
  const shortEdge = Math.min(width, height);
  if (shortEdge <= MOBILE_MAX) return 'mobile';
  if (shortEdge <= TABLET_MAX && isTouch) return 'tablet';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

// SSR-safe default: assume desktop so the server render matches the most common
// first paint; the effect corrects it on mount before anything interactive.
const DEFAULT: Viewport = {
  width: 1280,
  height: 800,
  size: 'desktop',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isPortrait: false,
  isLandscape: true,
  isTouch: false,
};

/**
 * Tracks the visual viewport and derives coarse device buckets. Drives the
 * responsive HUD (card sizing, camera framing, tap-target scaling) so the
 * layout adapts to phones, tablets and desktops alike.
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT);

  useEffect(() => {
    const compute = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouch =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(pointer: coarse)').matches
          : 'ontouchstart' in window;
      const size = classify(width, height, isTouch);
      setViewport({
        width,
        height,
        size,
        isMobile: size === 'mobile',
        isTablet: size === 'tablet',
        isDesktop: size === 'desktop',
        isPortrait: height >= width,
        isLandscape: width > height,
        isTouch,
      });
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    document.addEventListener('fullscreenchange', compute);
    document.addEventListener('webkitfullscreenchange', compute);
    document.addEventListener('mozfullscreenchange', compute);
    document.addEventListener('MSFullscreenChange', compute);

    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
      document.removeEventListener('fullscreenchange', compute);
      document.removeEventListener('webkitfullscreenchange', compute);
      document.removeEventListener('mozfullscreenchange', compute);
      document.removeEventListener('MSFullscreenChange', compute);
    };
  }, []);

  return viewport;
}
