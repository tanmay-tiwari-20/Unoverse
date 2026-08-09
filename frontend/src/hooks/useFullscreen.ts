'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';

export interface UseFullscreenResult {
  /** Whether the document is currently in fullscreen mode. */
  isFullscreen: boolean;
  /** Whether the browser / iframe environment supports the Fullscreen API. */
  isSupported: boolean;
  /** Toggle fullscreen mode on/off. */
  toggleFullscreen: () => Promise<boolean>;
  /** Request entering fullscreen mode. */
  requestFullscreen: () => Promise<boolean>;
  /** Request exiting fullscreen mode. */
  exitFullscreen: () => Promise<boolean>;
}

/**
 * Returns true if there is an active fullscreen element across browser implementations.
 */
function checkIsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

/**
 * Returns true if the Fullscreen API is available in the current browser/iframe context.
 */
function checkIsSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenEnabled ||
    (document as any).webkitFullscreenEnabled ||
    (document as any).mozFullScreenEnabled ||
    (document as any).msFullscreenEnabled ||
    // Fallback check for requestFullscreen on root element
    (document.documentElement &&
      (document.documentElement.requestFullscreen ||
        (document.documentElement as any).webkitRequestFullscreen ||
        (document.documentElement as any).mozRequestFullScreen ||
        (document.documentElement as any).msRequestFullscreen))
  );
}

/**
 * Hook to manage Fullscreen API state across Desktop, Tablet, Mobile, and embedded iframe (CrazyGames).
 * Automatically keeps UI state synchronized with native browser events (Escape key, system gestures).
 */
export function useFullscreen(): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(false);

  useEffect(() => {
    setIsFullscreen(checkIsFullscreen());
    setIsSupported(checkIsSupported());

    const handleFullscreenChange = () => {
      setIsFullscreen(checkIsFullscreen());
    };

    const handleFullscreenError = () => {
      // Gracefully handle fullscreen rejection (e.g. restricted iframe or user denied)
      setIsFullscreen(checkIsFullscreen());
      const addToast = useGameStore.getState().addToast;
      if (addToast) {
        addToast('Fullscreen mode is restricted or unavailable', 'info');
      }
    };

    const events = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'MSFullscreenChange',
    ];

    const errorEvents = [
      'fullscreenerror',
      'webkitfullscreenerror',
      'mozfullscreenerror',
      'MSFullscreenError',
    ];

    events.forEach((evt) => document.addEventListener(evt, handleFullscreenChange));
    errorEvents.forEach((evt) => document.addEventListener(evt, handleFullscreenError));

    return () => {
      events.forEach((evt) => document.removeEventListener(evt, handleFullscreenChange));
      errorEvents.forEach((evt) => document.removeEventListener(evt, handleFullscreenError));
    };
  }, []);

  const reqFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const elem = document.documentElement;
    if (!elem) return false;

    const requestMethod =
      elem.requestFullscreen ||
      (elem as any).webkitRequestFullscreen ||
      (elem as any).mozRequestFullScreen ||
      (elem as any).msRequestFullscreen;

    if (!requestMethod) {
      const addToast = useGameStore.getState().addToast;
      if (addToast) {
        addToast('Fullscreen is not supported on this browser or device', 'info');
      }
      return false;
    }

    try {
      const result = requestMethod.call(elem);
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    } catch (err) {
      // Silent or gentle notification fallback, no console spam or crashing
      const addToast = useGameStore.getState().addToast;
      if (addToast) {
        addToast('Unable to enter fullscreen mode', 'info');
      }
      return false;
    }
  }, []);

  const exitFs = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    if (!checkIsFullscreen()) return true;

    const exitMethod =
      document.exitFullscreen ||
      (document as any).webkitExitFullscreen ||
      (document as any).mozCancelFullScreen ||
      (document as any).msExitFullscreen;

    if (!exitMethod) return false;

    try {
      const result = exitMethod.call(document);
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    } catch (err) {
      return false;
    }
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    if (checkIsFullscreen()) {
      return await exitFs();
    } else {
      return await reqFullscreen();
    }
  }, [exitFs, reqFullscreen]);

  return {
    isFullscreen,
    isSupported,
    toggleFullscreen,
    requestFullscreen: reqFullscreen,
    exitFullscreen: exitFs,
  };
}

export default useFullscreen;
