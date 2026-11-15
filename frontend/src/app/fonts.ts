import localFont from 'next/font/local';

// Checked-in font files keep production and portal builds independent of
// Google's font servers. Both are variable fonts covering weights 100–900.
export const geistSans = localFont({
  src: './fonts/geist-latin.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});

export const geistMono = localFont({
  src: './fonts/geist-mono-latin.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});
