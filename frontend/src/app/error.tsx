'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

import { ErrorScreen } from '../components/ui/ErrorScreen';
import { usePlatformRouter } from '../hooks/usePlatformRouter';
import { HOME_HREF } from '../lib/platform/routes';
import { logger } from '../utils/logger';

/**
 * Route-level error boundary for every page under `app/`.
 *
 * Next.js wraps each route segment's `page`, `loading`, `not-found` and nested
 * layouts in this boundary automatically. Anything that throws while rendering
 * on the client — a WebGL initialisation failure on a low-end device, a bad
 * payload reaching a component, an exception in an effect — lands here instead
 * of unmounting the React tree and leaving a white screen, which is exactly what
 * happened before this file existed.
 *
 * It does NOT cover the root layout above it; that is `global-error.tsx`.
 */
export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16.2+ replaced `reset()` with `unstable_retry()`, which re-fetches as
  // well as re-renders. `reset()` still exists but only clears the error state,
  // so a failure caused by bad data would immediately reproduce.
  unstable_retry: () => void;
}) {
  const router = usePlatformRouter();

  useEffect(() => {
    logger.error('[RouteError] Unhandled error rendering route:', error, error.digest);
  }, [error]);

  return (
    <ErrorScreen
      error={error}
      // Retry first: it re-renders in place, so an active socket connection and
      // the server-authoritative round both survive. Reload is the fallback.
      onRetry={() => unstable_retry()}
      onGoHome={() => router.push(HOME_HREF)}
    />
  );
}
