"use client";

/**
 * The home screen — profile, play console, room create/join, spectate.
 *
 * This lives in `components/` rather than in a route file because BOTH build
 * targets render it and neither owns it: the web build mounts it at
 * `app/page.web.tsx`, and the static CrazyGames build mounts it at
 * `app/page.cg.tsx` alongside `<LobbyRoom>` in the same document. One
 * implementation, two URL shapes — every navigation out of here goes through
 * `lobbyHref`, which is the only thing that differs between them.
 */

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye as EyeIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useSocket } from "../../hooks/useSocket";
import { usePlatformEntry } from "../../hooks/usePlatformEntry";
import { usePlatformRouter } from "../../hooks/usePlatformRouter";
import { useProfileStore } from "../../store/useProfileStore";
import { CreateProfileModal } from "../profile/CreateProfileModal";
import { ProfileModal } from "../profile/ProfileModal";
import { CreateRoomModal } from "../lobby/CreateRoomModal";
import { SocialLayer } from "../social/SocialLayer";
import { HomeTopRail } from "./HomeTopRail";
import { HomeHero } from "./HomeHero";
import { PlayConsole, type PlayMode } from "./PlayConsole";
import { Button } from "../ui/kit";
import { ArenaSelection } from "../../lib/arenas/types";
import { errorMessage } from "../../utils/errors";
import { subscribeToNothing } from "../../utils/clientSnapshot";
import { BACKEND_URL } from "../../lib/config";
import { lobbyHref } from "../../lib/platform/routes";

const LandingScene = dynamic(
  () =>
    import("../landing/LandingScene").then((mod) => ({
      default: mod.LandingScene,
    })),
  { ssr: false },
);

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

function profileCreds(): { profileId?: string; profileSecret?: string } {
  const { profileId, profileSecret } = useProfileStore.getState();
  return profileId && profileSecret ? { profileId, profileSecret } : {};
}

export default function HomeScreen() {
  const router = usePlatformRouter();

  // Pre-warm the socket connection on landing mount
  useSocket();
  // Platform entry: a CrazyGames invite or Instant Multiplayer request navigates
  // straight into a lobby. Inert on web, and on CrazyGames for players who simply
  // opened the game — the home screen below is unchanged either way.
  usePlatformEntry();
  const requestInProgress = useRef(false);

  // Persistent profile identity. A returning player is loaded from localStorage;
  // a first-time visitor is prompted to create one (once) and never re-prompted.
  const profileHydrated = useProfileStore((s) => s.hydrated);
  const profileId = useProfileStore((s) => s.profileId);
  const profileName = useProfileStore((s) => s.displayName);
  const refreshProfile = useProfileStore((s) => s.refreshProfile);

  // State variables
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Which secondary path the console is showing. Quick Play is the primary CTA
  // and always available; this only chooses between "join a code" and "host".
  const [playMode, setPlayMode] = useState<PlayMode>("join");
  // Landing "Create" opens an arena picker; the actual room POST happens once
  // the host confirms a world (or Random) in the modal.
  const [createOpen, setCreateOpen] = useState(false);

  // Prefill the name field from the persistent profile once it hydrates, so the
  // player never retypes their name. They can still override it per-session.
  // Adjusted during render (not in an effect) so the prefilled name paints on
  // the same commit the profile hydrates on, with no empty-field flash.
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  if (profileName && prefilledFrom !== profileName) {
    setPrefilledFrom(profileName);
    if (!displayName) setDisplayName(profileName);
  }

  // Pull the server's view of this profile once on landing so the top rail can
  // show real wins/streak instead of nothing. Fire-and-forget: the store owns
  // the result and its own error state, and every surface here renders fine
  // without it. The profile modal re-fetches on open regardless.
  useEffect(() => {
    if (profileHydrated && profileId) void refreshProfile();
  }, [profileHydrated, profileId, refreshProfile]);

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

  const backendUrl = BACKEND_URL;

  // Pre-fill the room code when arriving via an invitation link (/?room=CODE),
  // and put the console in "join" mode so the pre-filled code is actually the
  // thing on screen rather than hidden behind the host tab.
  //
  // Read through useSyncExternalStore rather than a lazy initializer: the server
  // has no query string, so `getServerSnapshot` keeps the hydration render
  // matching the prerendered HTML, and the real code lands on the pass right
  // after. The invite is applied once per code, so a player who clears or edits
  // the field is not fought by a re-prefill.
  const search = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.search,
    () => "",
  );
  const invitedCode =
    new URLSearchParams(search).get("room")?.toUpperCase().slice(0, 6) ?? "";
  const [appliedInvite, setAppliedInvite] = useState<string | null>(null);
  if (invitedCode && appliedInvite !== invitedCode) {
    setAppliedInvite(invitedCode);
    setRoomCode(invitedCode);
    setPlayMode("join");
  }

  // Step 1 — the console's "Create Room". Validate the name, then open the
  // arena picker. The room isn't created until the host confirms a world.
  const openCreateModal = () => {
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
      router.push(lobbyHref(code, displayName.trim()));
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, "Something went wrong. Is the server running?"));
      setLoading(false);
      setCreateOpen(false);
    } finally {
      requestInProgress.current = false;
    }
  };

  // Quick Play: ask the server for the best public room (or a fresh one) and
  // jump straight into its lobby — no room code required.
  const handleQuickPlay = async () => {
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

      router.push(lobbyHref(data.code, displayName.trim()));
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, "Something went wrong. Is the server running?"));
      setLoading(false);
    } finally {
      requestInProgress.current = false;
    }
  };

  const handleJoinRoom = async () => {
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
        lobbyHref(roomCode.trim().toUpperCase(), displayName.trim()),
      );
    } catch (err) {
      console.error(err);
      setError(
        errorMessage(err, "Something went wrong. Please check your room code."),
      );
      setLoading(false);
    } finally {
      requestInProgress.current = false;
    }
  };

  return (
    <main className="w-full h-screen-dvh relative bg-[#120c2e] overflow-hidden select-none">
      {/* 3D Background Scene */}
      <div className="absolute inset-0 z-0">
        <LandingScene />
      </div>

      {/* Playful color wash + dots over the 3D scene */}
      <div className="absolute inset-0 z-[1] arcade-bg opacity-50 pointer-events-none mix-blend-screen" />
      <div className="absolute inset-0 z-[1] arcade-dots pointer-events-none" />
      {/* Vignette — pulls the eye to the middle and buys the console its
          contrast wherever the colour washes happen to be brightest. */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 25%, rgba(5, 3, 16, 0.7) 100%)",
        }}
        aria-hidden="true"
      />

      <HomeTopRail />

      {/* Horizontal padding is set through `--safe-pad-x`, NOT `px-*`. `.safe-x`
          is unlayered CSS, so it outranks every utility in `@layer utilities` —
          a `px-4` here would be silently clobbered and the console would sit
          flush against the screen edge. The var is what `.safe-x` max()es the
          notch inset against, so this is the knob that actually works. */}
      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto overscroll-contain px-3.5 py-10 sm:py-8 md:py-6 short:py-3 pointer-events-none safe-x [--safe-pad-x:1rem] short:[--safe-pad-x:0.75rem]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="pointer-events-auto grid w-full max-w-5xl items-center justify-items-center gap-5 sm:gap-6 md:grid-cols-[1.05fr_minmax(0,21rem)] md:gap-8 lg:grid-cols-[1.1fr_minmax(0,24rem)] lg:gap-12 short:grid-cols-[1.05fr_minmax(0,19rem)] short:gap-4"
        >
          <HomeHero className="w-full max-w-md md:max-w-none md:items-start md:text-left" />

          <div className="w-full max-w-sm md:max-w-none short:max-w-none">
            <PlayConsole
              roomCode={roomCode}
              onRoomCodeChange={setRoomCode}
              mode={playMode}
              onModeChange={setPlayMode}
              loading={loading}
              error={error}
              onQuickPlay={handleQuickPlay}
              onJoin={handleJoinRoom}
              onCreate={openCreateModal}
            />
          </div>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute bottom-2.5 left-0 right-0 z-10 hidden justify-center px-4 sm:flex short:hidden">
        <span className="font-rounded text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
          Built for multiplayer fun
        </span>
      </div>

      <AnimatePresence>
        {spectatorPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="ui-scrim fixed inset-0 z-[2100] flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
              role="alertdialog"
              aria-labelledby="spectator-prompt-title"
              aria-describedby="spectator-prompt-desc"
              className="home-card home-card-brand w-full max-w-sm overflow-hidden"
            >
              <div className="arcade-dots pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden="true" />

              <div className="relative flex flex-col items-center gap-3 p-5 text-center short:gap-2 short:p-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-4 border-white bg-gradient-to-b from-violet-400 to-violet-700 text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] short:hidden">
                  <EyeIcon size={22} aria-hidden="true" />
                </span>

                <div>
                  <h2
                    id="spectator-prompt-title"
                    className="font-arcade arcade-stroke-uno-sm text-lg uppercase tracking-wide text-yellow-400"
                  >
                    Table Is Full
                  </h2>
                  <p
                    id="spectator-prompt-desc"
                    className="font-rounded mt-1.5 text-[11px] font-bold leading-relaxed text-white/70"
                  >
                    All {spectatorPrompt.maxPlayers} seats in room{" "}
                    <span className="font-arcade text-white">{spectatorPrompt.code}</span>{" "}
                    are taken. You&apos;ll join as a{" "}
                    <span className="font-bold text-violet-300">spectator</span> — watch,
                    chat and react, but no seat or cards.
                  </p>
                </div>

                {/* The two counts, as data rather than another sentence. */}
                <div className="grid w-full grid-cols-2 gap-1.5">
                  <div className="home-card-flat px-2 py-1.5">
                    <p className="font-arcade text-sm tabular-nums text-white">
                      {spectatorPrompt.playerCount}/{spectatorPrompt.maxPlayers}
                    </p>
                    <p className="font-rounded text-[9px] font-bold uppercase tracking-wider text-white/40">
                      Players
                    </p>
                  </div>
                  <div className="home-card-flat px-2 py-1.5">
                    <p className="font-arcade text-sm tabular-nums text-violet-300">
                      {spectatorPrompt.spectatorCount}/{spectatorPrompt.maxSpectators}
                    </p>
                    <p className="font-rounded text-[9px] font-bold uppercase tracking-wider text-white/40">
                      Spectators
                    </p>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const code = spectatorPrompt.code;
                      setSpectatorPrompt(null);
                      router.push(lobbyHref(code, displayName.trim()));
                    }}
                    className="btn-arcade font-arcade inline-flex w-full cursor-pointer items-center justify-center gap-2 bg-gradient-to-b from-violet-400 to-violet-600 py-3 text-xs uppercase text-white"
                  >
                    <EyeIcon size={15} aria-hidden="true" /> Watch This Table
                  </button>
                  <Button tone="neutral" size="sm" block onClick={() => setSpectatorPrompt(null)}>
                    Cancel
                  </Button>
                </div>
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
