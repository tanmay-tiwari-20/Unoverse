'use client';

import React, { useEffect } from 'react';

export const PWARegistration: React.FC = () => {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isHttps = window.location.protocol === 'https:';

      if (isLocalhost || isHttps) {
        window.addEventListener('load', () => {
          navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
              console.log('PWA ServiceWorker registered successfully: ', registration.scope);
            })
            .catch((err) => {
              console.warn('PWA ServiceWorker registration failed: ', err);
            });
        });
      }
    }
  }, []);

  return null;
};
