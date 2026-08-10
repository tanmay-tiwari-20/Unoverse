'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useGameStore } from '../store/useGameStore';
import { subscribeToNothing } from '../utils/clientSnapshot';

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

/** Vendor-prefixed Fullscreen API members that are missing from the DOM lib types. */
type VendorFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type VendorFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

const FULLSCREEN_EVENTS = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
] as const;

const FULLSCREEN_ERROR_EVENTS = [
  'fullscreenerror',
  'webkitfullscreenerror',
  'mozfullscreenerror',
  'MSFullscreenError',
] as const;

/**
 * Returns true if there is an active fullscreen element across browser implementations.
 */
function checkIsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as VendorFullscreenDocument;
  return !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

/**
 * Returns true if the Fullscreen API is available in the current browser/iframe context.
 */
function checkIsSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as VendorFullscreenDocument;
  const root = doc.documentElement as VendorFullscreenElement | null;
  return !!(
    doc.fullscreenEnabled ||
    doc.webkitFullscreenEnabled ||
    doc.mozFullScreenEnabled ||
    doc.msFullscreenEnabled ||
    // Fallback check for requestFullscreen on root element
    (root &&
      (root.requestFullscreen ||
        root.webkitRequestFullscreen ||
        root.mozRequestFullScreen ||
        root.msRequestFullscreen))
  );
}

/** Subscribes to every vendor variant of the fullscreenchange event. */
function subscribeToFullscreenChange(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  FULLSCREEN_EVENTS.forEach((evt) => document.addEventListener(evt, onChange));
  return () => {
    FULLSCREEN_EVENTS.forEach((evt) => document.removeEventListener(evt, onChange));
  };
}

/** Resolves a fullscreen request/exit method that may or may not return a promise. */
async function awaitFullscreenResult(result: Promise<void> | void): Promise<void> {
  if (result && typeof (result as Promise<void>).then === 'function') {
    await result;
  }
}
/**
 * Hook to manage Fullscreen API state across Desktop, Tablet, Mobile, and embedded iframe (CrazyGames).
 * Automatically keeps UI state synchronized with native browser events (Escape key, system gestures).
 */
export function useFullscreen(): UseFullscreenResult {
  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreenChange,
    checkIsFullscreen,
    () => false,
  );
  const isSupported = useSyncExternalStore(subscribeToNothing, checkIsSupported, () => false);

  useEffect(() => {
    const handleFullscreenError = () => {
      // Gracefully handle fullscreen rejection (e.g. restricted iframe or user denied)
      const addToast = useGameStore.getState().addToast;
      if (addToast) {
        addToast('Fullscreen mode is restricted or unavailable', 'info');
      }
    };

    FULLSCREEN_ERROR_EVENTS.forEach((evt) =>
      document.addEventListener(evt, handleFullscreenError),
    );

    return () => {
      FULLSCREEN_ERROR_EVENTS.forEach((evt) =>
        document.removeEventListener(evt, handleFullscreenError),
      );
    };
  }, []);

  const reqFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const elem = document.documentElement as VendorFullscreenElement | null;
    if (!elem) return false;

    const requestMethod =
      elem.requestFullscreen ||
      elem.webkitRequestFullscreen ||
      elem.mozRequestFullScreen ||
      elem.msRequestFullscreen;

    if (!requestMethod) {
      const addToast = useGameStore.getState().addToast;
      if (addToast) {
        addToast('Fullscreen is not supported on this browser or device', 'info');
      }
      return false;
    }

    try {
      await awaitFullscreenResult(requestMethod.call(elem));
      return true;
    } catch {
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

    const doc = document as VendorFullscreenDocument;
    const exitMethod =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;

    if (!exitMethod) return false;

    try {
      await awaitFullscreenResult(exitMethod.call(doc));
      return true;
    } catch {
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
