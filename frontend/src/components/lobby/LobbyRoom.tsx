"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSocket } from "../../hooks/useSocket";
import { useVoiceChat } from "../../hooks/useVoiceChat";
import { useChatEnabled } from "../../hooks/useChatEnabled";
import {
  usePlatformGameplayLifecycle,
  usePlatformLoadingSpan,
} from "../../hooks/usePlatformLifecycle";
import { usePlatformRoomPublisher } from "../../hooks/usePlatformRoomPublisher";
import { usePlatformMatchEnd } from "../../hooks/usePlatformMatchEnd";
import { usePlatformRouter } from "../../hooks/usePlatformRouter";
import { useGameStore } from "../../store/useGameStore";
import { HOME_HREF } from "../../lib/platform/routes";
import { ErrorBoundary } from "../providers/ErrorBoundary";
import { ReactionsHandler } from "../social/ReactionsHandler";
import { ChatPanel } from "../social/ChatPanel";
import { SocialLayer } from "../social/SocialLayer";
import { TurnGlowIndicator } from "../table/TurnGlowIndicator";
import { SettingsModal } from "../ui/SettingsModal";
import { HouseRulesModal } from "../ui/HouseRulesModal";
import { HelpModals } from "../ui/HelpModals";
import { FPSCounter } from "../ui/FPSCounter";
import { RotateDevicePrompt } from "../ui/RotateDevicePrompt";
import { PremiumLoader } from "./PremiumLoader";
import { JoinStatusScreen } from "./JoinStatusScreen";
import { ConnectionOverlay } from "./ConnectionOverlay";
import { ToastStack } from "./ToastStack";
import { LobbyHeader } from "./LobbyHeader";
import { GameHUD } from "./GameHUD";
import { GameStoppedNotice } from "./GameStoppedNotice";
import { WinnerOverlay } from "./WinnerOverlay";
import { ColorPickerDialog } from "./ColorPickerDialog";
import { SwapTargetDialog } from "./SwapTargetDialog";
import { EndOfRound } from "./EndOfRound";
import { InviteModal } from "./InviteModal";

// Dynamically import full-screen 2.5D Table Scene with SSR disabled
const TableScene = dynamic(
  () => import("../table/TableScene").then((mod) => mod.TableScene),
  {
    ssr: false,
    loading: () => (
      <PremiumLoader
        message="ENTERING ARENA..."
        submessage="Preparing 3D Card Table & World..."
      />
    ),
  },
);

export interface LobbyRoomProps {
  /** Room code to seat the player in. */
  roomId: string;
  /** Seat name, or null/absent — which bounces back to the home screen. */
  name: string | null;
}

/**
 * The table.
 *
 * This component owns only what is genuinely room-scoped: joining and leaving,
 * the single mount points for the socket and the WebRTC voice mesh, and the layer
 * order of the screen. Every panel, banner and dialog below reads what it needs
 * straight from the authoritative game store, so nothing here has to thread game
 * state through props.
 *
 * Each independent region sits behind its own ErrorBoundary: a crash in chat,
 * reactions or a dialog is contained to that region and leaves the socket,
 * the table and the rest of the HUD running.
 *
 * WHERE `roomId`/`name` COME FROM IS THE ROUTE'S BUSINESS, NOT THIS COMPONENT'S.
 * The web build reads them from `/lobby/[roomId]?name=`; the static CrazyGames
 * build reads them from the root document's query string. Both hand the same two
 * strings to the same implementation — there is no second lobby, and no platform
 * branch anywhere below this line.
 */
export default function LobbyRoom({ roomId, name }: LobbyRoomProps) {
  const router = usePlatformRouter();

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
      router.replace(HOME_HREF);
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
        router.push(HOME_HREF);
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
  //
  // These same two promises are what the platform's loading span waits on: the
  // table is "loaded" when the arena chunk and its models have settled, which is
  // a later and more honest moment than first paint.
  const arena = room?.arena;
  usePlatformLoadingSpan(arena, () =>
    arena
      ? [
          import("../table/arenas/ArenaEnvironment").then((mod) =>
            mod.preloadArena(arena),
          ),
          import("../table/arenas/shared/gltf").then((mod) =>
            mod.preloadArenaModels(arena),
          ),
        ]
      : [],
  );

  // Report active gameplay to the platform. No-op on web.
  usePlatformGameplayLifecycle();

  // Celebrate a match win and show the between-matches ad. Declared AFTER the
  // lifecycle hook deliberately: effects in one component run in declaration
  // order, so gameplay is already reported as stopped before an ad is requested.
  // No-op on web.
  usePlatformMatchEnd();

  // Mirror this room to the platform so it can advertise it and route invites
  // into it. Derived from the room snapshot, so it cannot disagree with the
  // server about whether someone can actually sit down. No-op on web.
  usePlatformRoomPublisher();

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
