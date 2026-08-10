import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Unoverse',
    short_name: 'Unoverse',
    description: 'Immersive 3D Multiplayer Card Game',
    start_url: '/',
    display: 'standalone',
    // The 3D table, seat arc and card fan are all inherently wide, so landscape
    // is the intended way to play. This hint is only honoured by installed PWAs
    // in standalone mode — browser tabs (and all of iOS) ignore it, which is why
    // RotateDevicePrompt still nudges portrait phones at the table.
    orientation: 'landscape',
    background_color: '#030712',
    theme_color: '#030712',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/favicon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
