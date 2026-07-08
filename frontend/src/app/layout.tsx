import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lilita_One, Fredoka } from "next/font/google";
import { MotionProvider } from "../components/providers/MotionProvider";
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
  title: "Unoverse — Immersive 3D Multiplayer UNO Experience",
  description: "Experience UNO like never before. Sit around a virtual 3D table with friends, cast interactive reactions, and play with custom rules in real-time.",
  keywords: ["UNO", "multiplayer game", "3D card game", "Unoverse", "React Three Fiber", "Socket.io"],
  authors: [{ name: "Unoverse Team" }],
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
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
