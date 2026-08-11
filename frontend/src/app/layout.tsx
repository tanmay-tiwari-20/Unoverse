import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lilita_One, Fredoka } from "next/font/google";
import { MotionProvider } from "../components/providers/MotionProvider";
import { PlatformProvider } from "../components/providers/PlatformProvider";
import { PWARegistration } from "../components/providers/PWARegistration";
import { CAPABILITIES } from "../lib/platform/capabilities";
import { PlatformHead } from "@platform-head";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lilitaOne = Lilita_One({
  variable: "--font-arcade",
  weight: "400",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-rounded",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unoverse — 3D Multiplayer Card Game",
  description:
    "Experience card game like never before. Sit around a virtual 3D table with friends, cast interactive reactions, and play with custom rules in real-time.",
  keywords: [
    "3D Arcade",
    "multiplayer game",
    "3D card game",
    "Unoverse",
    "React Three Fiber",
    "Socket.io",
  ],
  authors: [{ name: "Unoverse Team" }],
  metadataBase: new URL("https://unoverse-ivory.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Unoverse — 3D Multiplayer Card Game",
    description:
      "Experience card game like never before. Sit around a virtual 3D table with friends, cast interactive reactions, and play with custom rules in real-time.",
    url: "https://unoverse-ivory.vercel.app",
    siteName: "Unoverse",
    images: [
      {
        url: "/web-app-manifest-512x512.png",
        width: 512,
        height: 512,
        alt: "Unoverse 3D Multiplayer UNO",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unoverse — 3D Multiplayer Card Game",
    description:
      "Experience card game like never before. Sit around a virtual 3D table with friends, cast interactive reactions, and play with custom rules in real-time.",
    images: ["/web-app-manifest-512x512.png"],
  },
  // Install-to-homescreen metadata belongs to the self-hosted site. Inside a
  // portal iframe there is nothing to install, so the CrazyGames build omits it
  // rather than advertising a capability it does not have.
  ...(CAPABILITIES.pwa
    ? {
        appleWebApp: {
          capable: true,
          title: "Unoverse",
          statusBarStyle: "black-translucent" as const,
        },
      }
    : {}),
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

// Critical for mobile: without this, phones render at ~980px desktop width and
// scale the whole HUD/3D scene down. `device-width` + `viewportFit: cover` lets
// the layout fill the real screen and reach behind notches/rounded corners; the
// `dvh`-based sizing in globals.css then accounts for mobile browser chrome.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#030712",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lilitaOne.variable} ${fredoka.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-slate-950 text-slate-50 bg-grid-pattern antialiased"
        suppressHydrationWarning
      >
        {/* Both gated by capability, not by platform name. On web these are
            `true` at build time, so the rendered tree is unchanged; on
            CrazyGames the service worker is never registered — a stale
            `unoverse-cache-v2` inside the portal iframe would serve an old
            build and be miserable to diagnose through an embed. */}
        {CAPABILITIES.analytics && <Analytics />}
        {CAPABILITIES.pwa && <PWARegistration />}
        <PlatformProvider />
        <MotionProvider>{children}</MotionProvider>
        {/* Document-level platform tags, chosen by build target at module
            resolution time. Renders nothing at all on web — the component the
            web build resolves is an empty one, so no platform script and no
            platform URL exists in the self-hosted document. On CrazyGames this
            is the portal's SDK, injected into the prerendered HTML and fetched
            before any Next.js module. */}
        <PlatformHead />
      </body>
    </html>
  );
}
