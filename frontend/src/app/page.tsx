"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Eye as EyeIcon, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useSocket } from "../hooks/useSocket";
import { useProfileStore } from "../store/useProfileStore";
import { CreateProfileModal } from "../components/profile/CreateProfileModal";
import { ProfileModal } from "../components/profile/ProfileModal";
import { PresetAvatar } from "../components/profile/PresetAvatar";
import { CreateRoomModal } from "../components/lobby/CreateRoomModal";
import { FriendsButton } from "../components/social/FriendsButton";
import { SocialLayer } from "../components/social/SocialLayer";
import { ArenaSelection } from "../lib/arenas/types";

const LandingScene = dynamic(
  () =>
    import("../components/landing/LandingScene").then((mod) => ({
      default: mod.LandingScene,
    })),
  { ssr: false },
);

/**
 * Read back the per-session seat secret the gameplay layer stores on first join.
 * Mirrors `loadSecret` in `useSocket.ts` EXACTLY — same key shape, same silent
 * failure on unavailable storage. Duplicated (rather than exported from the hook)
 * so the landing page never pulls in the gameplay hook module; the key format is
 * the contract between them.
 */
function loadSeatSecret(code: string, name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return (
      sessionStorage.getItem(
        `unoverse:secret:${code.toUpperCase()}:${name.trim().toLowerCase()}`,
      ) || undefined
    );
  } catch {
    return undefined;
  }
}

/** The durable profile identity, mirroring `profileCreds` in `useSocket.ts`.
 *  `{}` when no profile exists yet — profile-less play still works. Read via
 *  `getState()` rather than a subscription: the secret is never rendered, so
 *  subscribing to it would only cost re-renders. */
function profileCreds(): { profileId?: string; profileSecret?: string } {
  const { profileId, profileSecret } = useProfileStore.getState();
  return profileId && profileSecret ? { profileId, profileSecret } : {};
}

export default function LandingPage() {
  const router = useRouter();
  
  // Pre-warm the socket connection on landing mount
  useSocket();
  const requestInProgress = useRef(false);

  // Persistent profile identity. A returning player is loaded from localStorage;
  // a first-time visitor is prompted to create one (once) and never re-prompted.
  const profileHydrated = useProfileStore((s) => s.hydrated);
  const profileId = useProfileStore((s) => s.profileId);
  const profileName = useProfileStore((s) => s.displayName);
  const profileAvatar = useProfileStore((s) => s.avatar);
  const setIsProfileOpen = useProfileStore((s) => s.setIsProfileOpen);

  // State variables
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Landing "Create" opens an arena picker; the actual room POST happens once
  // the host confirms a world (or Random) in the modal.
  const [createOpen, setCreateOpen] = useState(false);

  // Prefill the name field from the persistent profile once it hydrates, so the
  // player never retypes their name. They can still override it per-session.
  useEffect(() => {
    if (profileName) setDisplayName((prev) => prev || profileName);
  }, [profileName]);

  // Set when the target room's player slots are all full: the user is informed
  // BEFORE entering that they will join as a spectator, and must confirm. (A room
  // whose spectator slots are ALSO full is rejected outright by the join
  // pre-check with a "completely full" error instead.)
  const [spectatorPrompt, setSpectatorPrompt] = useState<{
    code: string;
    playerCount: number;
    maxPlayers: number;
    spectatorCount: number;
    maxSpectators: number;
  } | null>(null);

  const backendUrl =
    (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

  // Pre-fill the room code when arriving via an invitation link (/?room=CODE)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const invited = params.get("room");
    if (invited) {
      setRoomCode(invited.toUpperCase().slice(0, 6));
    }
  }, []);

  // Step 1 — the landing "Create" button. Validate the name, then open the
  // arena picker. The room isn't created until the host confirms a world.
  const openCreateModal = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Please enter a display name first.");
      return;
    }
    setError(null);
    setCreateOpen(true);
  };

  // Step 2 — confirmed from CreateRoomModal with the chosen arena selection
  // (a concrete id or 'random'). POST it; the server resolves 'random' and
  // echoes the concrete arena back on the room.
  const handleCreateRoom = async (arena: ArenaSelection) => {
    if (requestInProgress.current) return;
    if (!displayName.trim()) {
      setError("Please enter a display name first.");
      setCreateOpen(false);
      return;
    }

    setError(null);
    setLoading(true);
    requestInProgress.current = true;

    try {
      const response = await fetch(`${backendUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ arena }),
      });

      if (!response.ok) {
        throw new Error("Failed to create room server-side.");
      }

      const data = await response.json();
      const code = data.code;

      // Navigate immediately to the lobby page
      router.push(
        `/lobby/${code}?name=${encodeURIComponent(displayName.trim())}`,
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong. Is the server running?");
      setLoading(false);
      setCreateOpen(false);
    } finally {
      requestInProgress.current = false;
    }
  };

  // Quick Play: ask the server for the best public room (or a fresh one) and
  // jump straight into its lobby — no room code required.
  const handleQuickPlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (requestInProgress.current) return;
    if (!displayName.trim()) {
      setError("Please enter a display name first.");
      return;
    }

    setError(null);
    setLoading(true);
    requestInProgress.current = true;

    try {
      const response = await fetch(`${backendUrl}/api/rooms/quickplay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: displayName.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Quick Play failed.");
      }

      router.push(
        `/lobby/${data.code}?name=${encodeURIComponent(displayName.trim())}`,
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong. Is the server running?");
      setLoading(false);
    } finally {
      requestInProgress.current = false;
    }
  };

  const handleJoinRoom = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (requestInProgress.current) return;
    if (!displayName.trim()) {
      setError("Please enter a display name first.");
      return;
    }
    if (!roomCode.trim()) {
      setError("Please enter a 6-digit room code.");
      return;
    }

    setError(null);
    setLoading(true);
    requestInProgress.current = true;

    try {
      const response = await fetch(`${backendUrl}/api/rooms/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: roomCode.trim().toUpperCase(),
          name: displayName.trim(),
          // Identity rides along so the server can predict RECONNECTION rather
          // than a fresh join: the per-seat secret (if this browser ever held a
          // seat in this room) plus the durable profile credentials. The server
          // verifies both and keys everything off the Player ID — the name is
          // never used for matching.
          secret: loadSeatSecret(roomCode.trim(), displayName.trim()),
          ...profileCreds(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to join room.");
      }

      // The playing room is full — tell the user BEFORE they enter that they
      // will join as a spectator, and let them confirm or back out. (The socket
      // join on the lobby page remains the authoritative role decision.)
      if (data.isSpectator) {
        setSpectatorPrompt({
          code: roomCode.trim().toUpperCase(),
          playerCount: data.playerCount ?? data.maxPlayers ?? 0,
          maxPlayers: data.maxPlayers ?? 0,
          spectatorCount: data.spectatorCount ?? 0,
          maxSpectators: data.maxSpectators ?? 0,
        });
        setLoading(false);
        return;
      }

      router.push(
        `/lobby/${roomCode.trim().toUpperCase()}?name=${encodeURIComponent(displayName.trim())}`,
      );
    } catch (err: any) {
      console.error(err);
      setError(
        err.message || "Something went wrong. Please check your room code.",
      );
      setLoading(false);
    } finally {
      requestInProgress.current = false;
    }
  };

  return (
    <main className="w-screen h-screen-dvh relative bg-[#120c2e] overflow-hidden select-none">
      {/* 3D Background Scene */}
      <div className="absolute inset-0 z-0">
        <LandingScene />
      </div>

      {/* Playful color wash + dots over the 3D scene */}
      <div className="absolute inset-0 z-[1] arcade-bg opacity-50 pointer-events-none mix-blend-screen" />
      <div className="absolute inset-0 z-[1] arcade-dots pointer-events-none" />

      {/* Profile chip — opens the persistent player profile. Only shown once a
          profile exists (first-time visitors see the create flow instead). */}
      {profileHydrated && profileId && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: "spring", damping: 20, stiffness: 260 }}
          className="absolute top-4 right-4 z-20 flex items-center gap-2 pointer-events-auto"
        >
          {/* Friends drawer. Sits beside the profile chip because both are
              "you and yours", and both need a profile to mean anything. */}
          <FriendsButton className="h-[52px] px-3" />

          <button
            onClick={() => setIsProfileOpen(true)}
            className="panel-arcade bg-gradient-to-b from-neutral-900/90 to-black/90 backdrop-blur-md pl-2 pr-3.5 py-2 flex items-center gap-2.5 cursor-pointer hover:scale-[1.03] transition-transform"
            aria-label="Open your player profile"
          >
            <PresetAvatar avatarKey={profileAvatar} size={36} />
            <span className="font-arcade text-sm text-white uppercase tracking-wide max-w-[7rem] truncate">
              {profileName ?? "Profile"}
            </span>
          </button>
        </motion.div>
      )}

      {/* Foreground UI. On a landscape phone the vertical stack would overflow a
          ~390px-tall viewport, so `short:` re-flows it into two columns —
          wordmark on the left, controls on the right — using the width the
          orientation actually gives us. */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none short:flex-row short:gap-6 short:px-6">
        {/* Centerpiece Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="flex flex-col items-center gap-6 sm:gap-8 pointer-events-auto w-full max-w-sm px-4 short:flex-row short:items-center short:gap-6 short:max-w-3xl short:px-0"
        >
          {/* Titles */}
          <div className="text-center flex flex-col items-center gap-2 sm:gap-3 arcade-bob short:flex-1 short:shrink-0">
            <h1 className="font-arcade text-6xl sm:text-7xl md:text-8xl leading-none arcade-stroke-uno text-yellow-400 short:text-5xl">
              UNOVERSE!
            </h1>
            <p className="font-arcade text-xs sm:text-sm tracking-wide uppercase text-white arcade-stroke-uno-sm">
              Party Card Battle
            </p>
          </div>

          {/* Controls Panel */}
          <div className="w-full flex flex-col gap-4 short:flex-1 short:gap-2">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
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
            <div className="panel-arcade bg-gradient-to-b from-neutral-900/95 to-black/95 backdrop-blur-md p-4 flex flex-col gap-3 relative overflow-hidden short:gap-2 short:p-3" suppressHydrationWarning>
              <div className="absolute inset-0 arcade-dots pointer-events-none" />

              <form autoComplete="off" data-form-type="other" data-lpignore="true" onSubmit={(e) => e.preventDefault()} className="contents">
                <input
                  type="text"
                  maxLength={12}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  aria-label="Your display name"
                  disabled={loading}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="relative w-full bg-white/10 border-[3px] border-white/70 rounded-2xl px-4 py-3.5 text-white placeholder-white/50 text-center tracking-wide font-rounded font-bold uppercase focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all text-base short:py-2.5 short:text-sm"
                />

                <input
                  type="text"
                  maxLength={6}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  aria-label="Room code to join"
                  disabled={loading}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="relative w-full bg-white/10 border-[3px] border-white/70 rounded-2xl px-4 py-3.5 text-white placeholder-white/50 text-center tracking-[0.3em] font-arcade uppercase text-xl focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all short:py-2.5 short:text-base"
                />

                {/* Quick Play — instant public matchmaking, no code needed */}
                <button
                  type="button"
                  onClick={handleQuickPlay}
                  disabled={loading}
                  className="btn-arcade w-full bg-gradient-to-b from-amber-400 to-orange-600 text-white py-4 text-sm uppercase disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2 short:py-2.5 short:text-xs"
                >
                  <Zap size={16} className="fill-white" /> Quick Play
                </button>

                {/* Actions */}
                <div className="flex gap-3 short:gap-2">
                  <button
                    type="button"
                    onClick={handleJoinRoom}
                    disabled={loading}
                    className="btn-arcade flex-1 bg-gradient-to-b from-blue-400 to-blue-600 text-white py-4 text-sm uppercase disabled:cursor-not-allowed cursor-pointer short:py-2.5 short:text-xs"
                  >
                    Join
                  </button>

                  <button
                    type="button"
                    onClick={openCreateModal}
                    disabled={loading}
                    className="btn-arcade flex-1 bg-gradient-to-b from-lime-400 to-green-600 text-white py-4 text-sm uppercase disabled:cursor-not-allowed cursor-pointer short:py-2.5 short:text-xs"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Minimal Footer. Hidden on landscape phones — the two-column hero needs
          every pixel of a ~390px-tall viewport more than the tagline does. */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10 short:hidden">
        <span className="font-arcade text-xs text-white/70 uppercase tracking-[0.2em] arcade-stroke-sm">
          Built for multiplayer fun
        </span>
      </div>

      {/* =================================================================== */}
      {/* SPECTATOR PROMPT — the playing room is full; confirm before joining   */}
      {/* =================================================================== */}
      <AnimatePresence>
        {spectatorPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.95 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              role="alertdialog"
              aria-labelledby="spectator-prompt-title"
              aria-describedby="spectator-prompt-desc"
              className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-6 flex flex-col items-center gap-4 w-full max-w-sm text-center relative overflow-hidden short:p-4 short:gap-2.5 short:max-h-[92dvh] short:overflow-y-auto"
            >
              <div className="absolute inset-0 arcade-dots pointer-events-none" />

              <div className="relative w-14 h-14 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-700 border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)]">
                <EyeIcon size={26} />
              </div>

              <div className="relative">
                <h2 id="spectator-prompt-title" className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm">
                  Playing Room Is Full
                </h2>
                <p id="spectator-prompt-desc" className="font-rounded font-semibold text-white/85 text-xs mt-2 leading-relaxed">
                  All {spectatorPrompt.maxPlayers} player slots in room{" "}
                  <span className="font-arcade text-white">{spectatorPrompt.code}</span>{" "}
                  are filled ({spectatorPrompt.playerCount}/{spectatorPrompt.maxPlayers} players,
                  spectators {spectatorPrompt.spectatorCount}/{spectatorPrompt.maxSpectators}).
                  <br />
                  You will join as a <span className="text-cyan-300 font-bold">spectator</span> —
                  you can watch the game, chat and react, but you won't get a seat or cards.
                </p>
              </div>

              <div className="relative w-full flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    const code = spectatorPrompt.code;
                    setSpectatorPrompt(null);
                    router.push(
                      `/lobby/${code}?name=${encodeURIComponent(displayName.trim())}`,
                    );
                  }}
                  className="btn-arcade w-full bg-gradient-to-b from-cyan-400 to-cyan-600 text-white py-3.5 text-sm uppercase inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <EyeIcon size={16} /> Join as Spectator
                </button>
                <button
                  onClick={() => setSpectatorPrompt(null)}
                  className="btn-arcade w-full bg-gradient-to-b from-neutral-600 to-neutral-800 text-white py-3 text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-visit identity: prompt to create a profile once localStorage has
          been read and no profile exists. Prefills whatever name was typed. */}
      <CreateProfileModal
        isOpen={profileHydrated && !profileId}
        initialName={displayName}
        onCreated={(name) => setDisplayName(name)}
      />

      {/* Persistent player profile viewer/editor (opened from the profile chip). */}
      <ProfileModal />

      {/* Arena picker shown when creating a room — the room is POSTed with the
          chosen world once the host confirms. */}
      <CreateRoomModal
        isOpen={createOpen}
        loading={loading}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreateRoom}
      />

      {/* Friends & Social System. One mount point for the drawer, the player
          profile viewer, invitations and social notifications. Purely additive —
          it renders nothing until the player opens it or a friend does something. */}
      <SocialLayer />
    </main>
  );
}
