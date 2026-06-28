import type { Metadata } from "next";
import { Geist, Geist_Mono, Lilita_One, Fredoka } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Arcade display font (chunky, Smash Karts vibe)
const lilitaOne = Lilita_One({
  variable: "--font-arcade",
  weight: "400",
  subsets: ["latin"],
});

// Rounded UI font for body/buttons
const fredoka = Fredoka({
  variable: "--font-rounded",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UNO Real — Immersive 3D Multiplayer UNO Experience",
  description: "Experience UNO like never before. Sit around a virtual 3D table with friends, cast interactive reactions, and play with custom rules in real-time.",
  keywords: ["UNO", "multiplayer game", "3D card game", "UNO Real", "React Three Fiber", "Socket.io"],
  authors: [{ name: "UNO Real Team" }],
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
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-50 bg-grid-pattern antialiased">
        {children}
      </body>
    </html>
  );
}
