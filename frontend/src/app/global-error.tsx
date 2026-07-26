'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { Lilita_One } from 'next/font/google';

import { ErrorScreen } from '../components/ui/ErrorScreen';
import { logger } from '../utils/logger';
import './globals.css';

// `global-error` REPLACES the root layout when it renders, so nothing that
// layout provides is available here — stylesheet and fonts have to be declared
// again or the recovery screen renders unstyled. Only the display font is
// re-declared; it is the only one `ErrorScreen` depends on.
const lilitaOne = Lilita_One({
  variable: '--font-arcade',
  weight: '400',
  subsets: ['latin'],
});

/**
 * Last-resort error boundary.
 *
 * Catches failures in the root layout itself — the one place `app/error.tsx`
 * cannot reach, because that boundary lives *inside* the layout it would need to
 * replace. In practice this covers provider crashes (`MotionProvider`,
 * `PWARegistration`) and anything thrown before the route boundary is mounted.
 *
 * Because it substitutes for the root layout it must render its own `<html>` and
 * `<body>`. `metadata` exports are not supported in a Client Component, hence
 * the plain `<title>` element.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    logger.error('[GlobalError] Root layout failed:', error, error.digest);
  }, [error]);

  return (
    <html lang="en" className={`${lilitaOne.variable} h-full antialiased dark`} suppressHydrationWarning>
      <body className="min-h-full bg-slate-950 text-slate-50 antialiased" suppressHydrationWarning>
        <title>Unoverse — Something went wrong</title>
        <ErrorScreen
          error={error}
          title="Unoverse couldn't start"
          message="The app failed to load. Reloading usually clears this — your room and seat are held on the server."
          onRetry={() => unstable_retry()}
        />
      </body>
    </html>
  );
}
