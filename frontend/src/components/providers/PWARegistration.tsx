'use client';

import React, { useEffect } from 'react';

export const PWARegistration: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';
    if (!isLocalhost && !isHttps) return;

    // When an UPDATED service worker takes control (i.e. a new deploy just
    // activated under this open page), reload once so the user immediately gets
    // the fresh UI instead of the stale bundle the old worker served. Guards:
    //  - hadController: skip the very first install (nothing stale to replace)
    //  - refreshed: never loop
    //  - pathname === '/': never yank a player out of a lobby/game mid-session;
    //    they pick the new version up on their next natural navigation.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshed = false;
    const onControllerChange = () => {
      if (!hadController || refreshed) return;
      if (window.location.pathname !== '/') return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = () => {
      navigator.serviceWorker
        // updateViaCache: 'none' — always check the server for a new sw.js
        // instead of trusting the HTTP cache (which can pin an old worker for
        // up to 24h and with it a whole stale deployment).
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('PWA ServiceWorker registered successfully: ', registration.scope);
          // Proactively check for a newer worker on every page load.
          registration.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('PWA ServiceWorker registration failed: ', err);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
};
