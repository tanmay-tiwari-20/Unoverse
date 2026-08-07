"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSocket } from "../../../hooks/useSocket";
import { useVoiceChat } from "../../../hooks/useVoiceChat";
import { useChatEnabled } from "../../../hooks/useChatEnabled";
import { useGameStore } from "../../../store/useGameStore";
import { ErrorBoundary } from "../../../components/providers/ErrorBoundary";
import { ReactionsHandler } from "../../../components/social/ReactionsHandler";
import { ChatPanel } from "../../../components/social/ChatPanel";
import { SocialLayer } from "../../../components/social/SocialLayer";
import { TurnGlowIndicator } from "../../../components/table/TurnGlowIndicator";
import { SettingsModal } from "../../../components/ui/SettingsModal";
import { HouseRulesModal } from "../../../components/ui/HouseRulesModal";
import { HelpModals } from "../../../components/ui/HelpModals";
import { FPSCounter } from "../../../components/ui/FPSCounter";
import { RotateDevicePrompt } from "../../../components/ui/RotateDevicePrompt";
import { PremiumLoader } from "../../../components/lobby/PremiumLoader";
import { JoinStatusScreen } from "../../../components/lobby/JoinStatusScreen";
import { ConnectionOverlay } from "../../../components/lobby/ConnectionOverlay";
import { ToastStack } from "../../../components/lobby/ToastStack";
import { LobbyHeader } from "../../../components/lobby/LobbyHeader";
import { GameHUD } from "../../../components/lobby/GameHUD";
import { GameStoppedNotice } from "../../../components/lobby/GameStoppedNotice";
import { WinnerOverlay } from "../../../components/lobby/WinnerOverlay";
import { ColorPickerDialog } from "../../../components/lobby/ColorPickerDialog";
import { SwapTargetDialog } from "../../../components/lobby/SwapTargetDialog";
import { EndOfRound } from "../../../components/lobby/EndOfRound";
import { InviteModal } from "../../../components/lobby/InviteModal";

// Dynamically import full-screen 2.5D Table Scene with SSR disabled
const TableScene = dynamic(
  () =>
    import("../../../components/table/TableScene").then(
      (mod) => mod.TableScene,
    ),
  {
    ssr: false,
    loading: () => (
      <PremiumLoader
        message="Drawing Card Table..."
        submessage="Aligning table felt & wood grain..."
      />
    ),
  },
);

/**
 * Room route.
 *
 * This component owns only what is genuinely route-scoped: the room/name from
 * the URL, joining and leaving, the single mount points for the socket and the
 * WebRTC voice mesh, and the layer order of the screen. Every panel, banner and
 * dialog below reads what it needs straight from the authoritative game store,
 * so nothing here has to thread game state through props.
 *
 * Each independent region sits behind its own ErrorBoundary: a crash in chat,
 * reactions or a dialog is contained to that region and leaves the socket,
 * the table and the rest of the HUD running.
 */
export default function LobbyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = params?.roomId as string;
  const name = searchParams?.get("name");

  const { socket, joinRoom } = useSocket();
  // The voice mesh must be mounted exactly once, for the whole life of the
  // route — it is signalled over the game socket and rebuilds every peer
  // connection when it remounts. Hence: here, not inside the HUD button.
  const { toggleMic } = useVoiceChat();

  const room = useGameStore((state) => state.room);
  const player = useGameStore((state) => state.player);
  const error = useGameStore((state) => state.error);
  const setError = useGameStore((state) => state.setError);
  const clearAllCards = useGameStore((state) => state.clearAllCards);
  const isSpectator = useGameStore((state) => state.isSpectator);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const isChatOpen = useGameStore((state) => state.isChatOpen);
  const setChatOpen = useGameStore((state) => state.setChatOpen);

  const chatEnabled = useChatEnabled();

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Redirect back if name query parameter is missing
  useEffect(() => {
    if (!name) {
      router.replace("/");
    }
  }, [name, router]);

  // If the host disables Table Chat while the panel is open, close it so the UI
  // can't linger over a now-disabled feature.
  useEffect(() => {
    if (!chatEnabled && isChatOpen) setChatOpen(false);
  }, [chatEnabled, isChatOpen, setChatOpen]);

  // Auto-redirect if room no longer exists
  useEffect(() => {
    if (error === "Room not found" || error === "This room no longer exists") {
      const timer = setTimeout(() => {
        setError(null);
        router.push("/");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, router, setError]);

  // Connect socket and join room seating list
  useEffect(() => {
    if (!roomId || !name || !socket) return;

    joinRoom(roomId, name);

    return () => {
      clearAllCards();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name, socket]);

  // Warm the selected arena as soon as the room tells us which one it is —
  // before <TableScene>'s Canvas mounts. Two independent best-effort warm-ups:
  // the arena's lazy code chunk (so Suspense never has to show a stand-in world)
  // and its optional hero .glb assets. The helpers themselves are reached via
  // dynamic import so none of the 3D code lands in this route's initial bundle;
  // they resolve the same module promises the render path later awaits, so this
  // only ever moves work earlier. Purely a loading optimization — no game state
  // is read or written here.
  useEffect(() => {
    const arena = room?.arena;
    if (!arena) return;

    void import("../../../components/table/arenas/ArenaEnvironment")
      .then((mod) => mod.preloadArena(arena))
      .catch(() => {});
    void import("../../../components/table/arenas/shared/gltf")
      .then((mod) => mod.preloadArenaModels(arena))
      .catch(() => {});
  }, [room?.arena]);

  // Render connection/error loading states
  if (!room || (!player && !isSpectator)) {
    return <JoinStatusScreen />;
  }

  return (
    <div className="w-screen h-screen-dvh flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden relative">
      {/* Reactions Layer Overlay */}
      <ErrorBoundary section="Reactions" fallback={null}>
        <ReactionsHandler />
      </ErrorBoundary>

      {/* Connection Status Banner/Overlay */}
      <ConnectionOverlay />

      {/* Opponent name + voice status now live on the world-anchored SeatBadge
          inside WebGLCards, so the separate 2D nameplate overlay is retired. */}

      {/* Premium Settings + House Rules Configuration modals. Grouped: both are
          optional menus, and neither is on the path to playing a card. */}
      <ErrorBoundary section="Menus" fallback={null}>
        <SettingsModal />
        <HouseRulesModal />
      </ErrorBoundary>

      {/* Real-time Table Chat (desktop side panel / mobile bottom sheet).
          Not mounted when the host has disabled Table Chat. */}
      {chatEnabled && (
        <ErrorBoundary section="Table Chat" fallback={null}>
          <ChatPanel />
        </ErrorBoundary>
      )}

      {/* Help & Utility Modals */}
      <ErrorBoundary section="Help" fallback={null}>
        <HelpModals />
      </ErrorBoundary>
      <FPSCounter />

      {/* Landscape nudge for portrait phones. The table is designed wide, so
          this guides players to rotate — with a persistent opt-out, never a
          gate. Fenced off so a fault here can't take the table down. */}
      <ErrorBoundary section="Orientation" fallback={null}>
        <RotateDevicePrompt />
      </ErrorBoundary>

      {/* Toast Notifications Container */}
      <ToastStack />

      {/* =================================================================== */}
      {/* FULL SCREEN - Virtual Card Table Viewport                           */}
      {/* =================================================================== */}
      <div className="w-full h-full relative">
        {/* Full-screen Table Scene */}
        <div className="w-full h-full absolute inset-0 z-0">
          <TableScene />
        </div>

        {/* Winner Highlight Spotlight Overlay */}
        <WinnerOverlay />

        {/* HUD: Overlay Top Header Panel */}
        <ErrorBoundary section="Table Header">
          <LobbyHeader
            onOpenInvite={() => setIsInviteModalOpen(true)}
            onToggleMic={toggleMic}
          />
        </ErrorBoundary>

        {/* HUD: Bottom Table Actions */}
        <GameHUD />
      </div>

      {/* =================================================================== */}
      {/* OVERLAYS: Game Stopped — Not Enough Players Banner                  */}
      {/* =================================================================== */}
      <GameStoppedNotice />

      {/* =================================================================== */}
      {/* OVERLAYS: forced-choice dialogs and the end-of-round summary.       */}
      {/* Reset on any phase change so a crashed dialog can't outlive it.     */}
      {/* =================================================================== */}
      <ErrorBoundary section="Game Dialogs" resetKeys={[gameStatus]}>
        <ColorPickerDialog />
        <SwapTargetDialog />
        <EndOfRound />
      </ErrorBoundary>

      {/* =================================================================== */}
      {/* OVERLAYS: Invite Friends Modal                                      */}
      {/* =================================================================== */}
      <InviteModal
        open={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        roomId={roomId}
      />

      {/* GAME EFFECTS LAYER */}
      <ErrorBoundary section="Turn Glow" fallback={null}>
        <TurnGlowIndicator />
      </ErrorBoundary>

      {/* =================================================================== */}
      {/* FRIENDS & SOCIAL: drawer, player profiles, invitations, notices.     */}
      {/* Fenced off with `fallback={null}` like every other overlay here, so a */}
      {/* fault in the social layer can never take the table down with it.     */}
      {/* =================================================================== */}
      <ErrorBoundary section="Friends" fallback={null}>
        <SocialLayer />
      </ErrorBoundary>
    </div>
  );
}
