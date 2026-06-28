'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

const LandingScene = dynamic(
  () => import('../components/landing/LandingScene').then((mod) => ({ default: mod.LandingScene })),
  { ssr: false }
);

export default function LandingPage() {
  const router = useRouter();
  
  // State variables
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

  const handleCreateRoom = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name first.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create room server-side.');
      }

      const data = await response.json();
      const code = data.code;
      
      router.push(`/lobby/${code}?name=${encodeURIComponent(displayName.trim())}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong. Is the server running?');
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name first.');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a 6-digit room code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/rooms/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: roomCode.trim().toUpperCase(),
          name: displayName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join room.');
      }

      router.push(`/lobby/${roomCode.trim().toUpperCase()}?name=${encodeURIComponent(displayName.trim())}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong. Please check your room code.');
      setLoading(false);
    }
  };

  return (
    <main className="w-screen h-screen relative bg-[#120c2e] overflow-hidden select-none">
      {/* 3D Background Scene */}
      <div className="absolute inset-0 z-0">
        <LandingScene />
      </div>

      {/* Playful color wash + dots over the 3D scene */}
      <div className="absolute inset-0 z-[1] arcade-bg opacity-50 pointer-events-none mix-blend-screen" />
      <div className="absolute inset-0 z-[1] arcade-dots pointer-events-none" />

      {/* Foreground UI */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">

        {/* Centerpiece Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="flex flex-col items-center gap-8 pointer-events-auto w-full max-w-sm px-4"
        >
          {/* Titles */}
          <div className="text-center flex flex-col items-center gap-3 arcade-bob">
            <h1 className="font-arcade text-8xl leading-none arcade-stroke-uno text-yellow-400">
              UNOVERSE!
            </h1>
            <p className="font-arcade text-sm tracking-wide uppercase text-white arcade-stroke-uno-sm">
              Party Card Battle
            </p>
          </div>

          {/* Controls Panel */}
          <div className="w-full flex flex-col gap-4">

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-red-500/90 border-4 border-white rounded-2xl p-3 flex gap-2.5 items-center text-sm text-white font-rounded font-bold shadow-[0_6px_0_0_rgba(0,0,0,0.3)]">
                    <AlertCircle size={18} className="text-white shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inputs Container */}
            <div className="panel-arcade bg-gradient-to-b from-neutral-900/95 to-black/95 backdrop-blur-md p-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute inset-0 arcade-dots pointer-events-none" />

              <input
                type="text"
                maxLength={12}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your Name"
                disabled={loading}
                className="relative w-full bg-white/10 border-[3px] border-white/70 rounded-2xl px-4 py-3.5 text-white placeholder-white/50 text-center tracking-wide font-rounded font-bold uppercase focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all text-base"
              />

              <input
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                disabled={loading}
                className="relative w-full bg-white/10 border-[3px] border-white/70 rounded-2xl px-4 py-3.5 text-white placeholder-white/50 text-center tracking-[0.3em] font-arcade uppercase text-xl focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleJoinRoom}
                disabled={loading}
                className="btn-arcade flex-1 bg-gradient-to-b from-blue-400 to-blue-600 text-white py-4 text-sm uppercase disabled:cursor-not-allowed"
              >
                Join
              </button>

              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="btn-arcade flex-1 bg-gradient-to-b from-lime-400 to-green-600 text-white py-4 text-sm uppercase disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>

          </div>
        </motion.div>
      </div>

      {/* Minimal Footer */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10">
        <span className="font-arcade text-xs text-white/70 uppercase tracking-[0.2em] arcade-stroke-sm">
          Built for multiplayer fun
        </span>
      </div>

    </main>
  );
}
