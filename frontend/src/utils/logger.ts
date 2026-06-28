/**
 * Tiny client-side leveled logger.
 *
 * Keeps verbose per-move diagnostics during local development but stays quiet
 * in production builds (where `process.env.NODE_ENV === 'production'`).
 * Warnings and errors always pass through.
 *
 * Override at runtime in the browser console with:
 *   localStorage.setItem('UNOVERSE_DEBUG', '1')  // force-enable debug logs
 *   localStorage.removeItem('UNOVERSE_DEBUG')     // revert to default
 */

const isProd = process.env.NODE_ENV === 'production';

function debugEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const flag = window.localStorage.getItem('UNOVERSE_DEBUG');
      if (flag === '1') return true;
      if (flag === '0') return false;
    } catch {
      // localStorage may be unavailable (SSR / privacy mode) — fall through.
    }
  }
  return !isProd;
}

export const logger = {
  debug: (...args: unknown[]) => { if (debugEnabled()) console.debug(...args); },
  info: (...args: unknown[]) => { if (debugEnabled()) console.info(...args); },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
