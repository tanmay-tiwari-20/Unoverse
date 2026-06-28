'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '../../../hooks/useSocket';
import { useGameStore } from '../../../store/useGameStore';
import { ReactionsHandler } from '../../../components/social/ReactionsHandler';
import { getSeatCoords } from '../../../utils/seating';
import { TurnGlowIndicator } from '../../../components/table/TurnGlowIndicator';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  LogOut,
  ShieldAlert,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Pause,
  X,
  Trophy,
  Star,
  Siren,
  PartyPopper,
  Medal,
  Award,
  RefreshCw,
  Hourglass,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play
} from 'lucide-react';
import { getCardColorHex, getCardValueLabel, isValidMove } from '../../../lib/cards/cardEngine';
import { PlayerNameplates } from '../../../components/table/PlayerNameplates';
import { TurnTimer } from '../../../components/table/TurnTimer';
import { SettingsModal } from '../../../components/ui/SettingsModal';
import { HelpModals } from '../../../components/ui/HelpModals';
import { FPSCounter } from '../../../components/ui/FPSCounter';
import { useVoiceChat } from '../../../hooks/useVoiceChat';
import { useVoiceStore } from '../../../store/useVoiceStore';
import { useSettingsStore } from '../../../store/useSettingsStore';

// Mini UNO cards used in the loader's shuffle animation
const SHUFFLE_CARDS = [
  { color: '#ef4444', label: '7' },   // red
  { color: '#eab308', label: '+2' },  // yellow
  { color: '#22c55e', label: 'W' },   // green
  { color: '#3b82f6', label: '4' },   // blue
  { color: '#ef4444', label: '+4' },   // red
];

// A single mini UNO card face
const MiniUnoCard: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div
    className="w-full h-full rounded-xl border-[3px] border-white shadow-[0_8px_16px_rgba(0,0,0,0.45)] flex items-center justify-center p-1"
    style={{ background: color }}
  >
    <div className="w-full h-full rounded-lg border border-black/10 flex items-center justify-center overflow-hidden">
      {/* White oval badge with the value, classic UNO style */}
      <div className="w-[78%] h-[58%] bg-white rounded-[999px] flex items-center justify-center -rotate-12 shadow-inner">
        <span className="font-arcade text-lg leading-none" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  </div>
);

// Gamified loader: a deck of UNO cards riffle-shuffling in a loop
const PremiumLoader: React.FC<{ message: string; submessage?: string }> = ({ message, submessage }) => {
  const cycle = 2.6; // seconds for one full shuffle loop
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center arcade-bg arcade-dots text-slate-100 gap-8 z-[999] overflow-hidden select-none">
      {/* Rotating festive glow rings behind the deck */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
        className="absolute w-[420px] h-[420px] rounded-full blur-[70px] pointer-events-none opacity-50"
        style={{
          background:
            'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #3b82f6, #ef4444)',
        }}
      />

      {/* Shuffling Deck */}
      <div className="relative w-44 h-40 flex items-center justify-center">
        {SHUFFLE_CARDS.map((card, i) => {
          const baseX = (i - (SHUFFLE_CARDS.length - 1) / 2) * 6;
          const baseRot = (i - (SHUFFLE_CARDS.length - 1) / 2) * 5;
          const delay = (i * cycle) / SHUFFLE_CARDS.length;
          return (
            <motion.div
              key={i}
              className="absolute w-[4.5rem] h-[6.5rem]"
              style={{ transformOrigin: 'bottom center' }}
              animate={{
                x: [baseX, baseX + 96, baseX - 96, baseX],
                y: [0, -56, -20, 0],
                rotate: [baseRot, 22, -16, baseRot],
                scale: [1, 1.12, 1.06, 1],
                zIndex: [i, 60, 30, i],
              }}
              transition={{
                duration: cycle,
                times: [0, 0.4, 0.7, 1],
                repeat: Infinity,
                ease: 'easeInOut',
                delay,
              }}
            >
              <MiniUnoCard color={card.color} label={card.label} />
            </motion.div>
          );
        })}
      </div>

      {/* Message and Submessage */}
      <div className="text-center space-y-2.5 relative z-10 px-6">
        <h2 className="font-arcade text-2xl text-yellow-400 uppercase tracking-wide arcade-stroke-uno-sm flex items-center justify-center gap-1">
          <span>{message}</span>
          {/* Bouncing dots */}
          <span className="inline-flex gap-1 ml-0.5">
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-yellow-300 inline-block"
                animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut', delay: d * 0.15 }}
              />
            ))}
          </span>
        </h2>
        {submessage && (
          <p className="font-rounded text-cyan-200 text-xs font-bold uppercase tracking-wider">
            {submessage}
          </p>
        )}
      </div>

      {/* Chunky arcade progress bar */}
      <div className="w-56 h-3 bg-black/50 rounded-full overflow-hidden relative border-[3px] border-white/70 shadow-[0_4px_0_0_rgba(0,0,0,0.35)]">
        <motion.div
          animate={{ x: ['-100%', '320%'] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          className="absolute inset-y-0 w-1/3 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, #ef4444, #eab308, #22c55e, #3b82f6, transparent)',
          }}
        />
      </div>
    </div>
  );
};

// Dynamically import full-screen 2.5D Table Scene with SSR disabled
const TableScene = dynamic(
  () => import('../../../components/table/TableScene').then((mod) => mod.TableScene),
  { 
    ssr: false,
    loading: () => <PremiumLoader message="Drawing Card Table..." submessage="Aligning table felt & wood grain..." />
  }
);

// High-performance canvas confetti particle effect
const ConfettiCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (canvas) {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    const colors = ['#ef4444', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#ff7849'];
    const particles = Array.from({ length: 140 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height - height,
      r: Math.random() * 6 + 4,
      d: Math.random() * height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p, idx) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(p.tiltAngle);
        p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();

        if (p.y > height) {
          particles[idx] = {
            ...p,
            x: Math.random() * width,
            y: -20,
            tilt: Math.random() * 10 - 5,
          };
        }
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />;
};

export default function LobbyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const roomId = params?.roomId as string;
  const name = searchParams?.get('name');

  const { 
    socket, 
    joinRoom, 
    leaveRoom, 
    startGame, 
    playCard, 
    chooseColor, 
    callUno,
    drawCard
  } = useSocket();

  const { 
    room, 
    player, 
    error,
    setError,
    connectionStatus,
    playerCards,
    discardPile,
    currentPlayerId,
    currentPlayerSeat,
    direction,
    wildColor,
    gameStatus,
    colorChooserId,
    winnerId,
    winnerName,
    unoCalled,
    clearAllCards,
    isProcessing,
    setIsProcessing,
    isSpectator,
    toasts,
    addToast,
    removeToast,
    tableTheme,
    setTableTheme,
    isMuted,
    toggleMute,
    gameStoppedNotice,
    setGameStoppedNotice
  } = useGameStore();

  const { toggleMic } = useVoiceChat();
  const { isMicEnabled, isSpeakerEnabled, setSpeakerEnabled } = useVoiceStore();
  const { setIsSettingsOpen } = useSettingsStore();
  
  const [copied, setCopied] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Redirect back if name query parameter is missing
  useEffect(() => {
    if (!name) {
      router.replace('/');
    }
  }, [name, router]);

  // Auto-redirect if room no longer exists
  useEffect(() => {
    if (error === 'Room not found' || error === 'This room no longer exists') {
      const timer = setTimeout(() => {
        setError(null);
        router.push('/');
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
  }, [roomId, name, socket]);

  // Keydown listener to toggle socket debug panel (Ctrl + Shift + D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDebugMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Copy room code to clipboard
  const handleCopyCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId.toUpperCase());
    setCopied(true);
    addToast('Lobby code copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const isHost = player?.isHost || false;
  const totalPlayers = room?.players.length || 0;
  const canStart = totalPlayers >= 2;
  
  const localSeatNumber = player?.seatNumber || 1;
  const myHand = playerCards[localSeatNumber] || [];

  const isMyTurn = currentPlayerId === player?.id && gameStatus === 'playing';

  // Find winner coordinates for localized spotlight render
  const getWinnerCoords = () => {
    const winnerPlayer = room?.players.find(p => p.id === winnerId);
    if (!winnerPlayer || !room) return { left: '50%', top: '50%' };
    const playerIndex = room.players.findIndex(p => p.id === winnerId);
    if (playerIndex !== -1) {
      const localIndex = room.players.findIndex(p => p.id === player?.id);
      const visualSlotIndex = (playerIndex - (localIndex !== -1 ? localIndex : 0) + room.players.length) % room.players.length;
      return getSeatCoords(visualSlotIndex, 0, room.players.length);
    }
    return getSeatCoords(winnerPlayer.seatNumber, localSeatNumber, 6);
  };
  const winnerCoords = getWinnerCoords();
  const winnerPlayerObj = room?.players.find(p => p.id === winnerId);

  // Calculate final leaderboard standings at ended status
  const getStandings = () => {
    if (!room) return [];
    return [...room.players]
      .map((p) => {
        const count = playerCards[p.seatNumber]?.length || 0;
        return { name: p.name, id: p.id, cardCount: count };
      })
      .sort((a, b) => a.cardCount - b.cardCount);
  };
  const standings = getStandings();

  // Render connection/error loading states
  if (!room || (!player && !isSpectator)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-screen arcade-bg arcade-dots">
        <div className="text-center max-w-sm flex flex-col items-center gap-4">
          {error ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="panel-arcade bg-gradient-to-b from-rose-600 to-red-800 p-6 flex flex-col items-center gap-4"
            >
              <ShieldAlert className="text-yellow-300 animate-bounce" size={48} />
              <h2 className="font-arcade text-2xl uppercase tracking-wide text-white arcade-stroke-sm">Join Failed</h2>
              <p className="font-rounded text-white/90 text-sm leading-relaxed font-semibold">
                {error === 'Room not found' ? 'This room no longer exists' : error}
              </p>
              {(error === 'Room not found' || error === 'This room no longer exists') && (
                <p className="font-rounded text-[11px] text-yellow-200 font-bold uppercase tracking-wider animate-pulse">
                  Redirecting to home page shortly...
                </p>
              )}
              <button
                onClick={() => {
                  setError(null);
                  router.push('/');
                }}
                className="btn-arcade w-full bg-gradient-to-b from-blue-400 to-blue-600 text-white py-3 px-4 text-sm uppercase"
              >
                Return Home
              </button>
            </motion.div>
          ) : (
            <PremiumLoader 
              message="Connecting to Lobby..." 
              submessage={`Status: ${connectionStatus.toUpperCase()} • Syncing seating slots...`} 
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden relative">
      
      {/* Reactions Layer Overlay */}
      <ReactionsHandler />

      {/* Voice Chat Player Nameplates */}
      <PlayerNameplates />

      {/* Premium Settings Modal */}
      <SettingsModal />

      {/* Help & Utility Modals */}
      <HelpModals />
      <FPSCounter />



      {/* Toast Notifications Container */}
      <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl shadow-[0_5px_0_0_rgba(0,0,0,0.3)] border-[3px] ${
                toast.type === 'error'
                  ? 'bg-gradient-to-b from-rose-500 to-red-700 border-white text-white'
                  : toast.type === 'success'
                    ? 'bg-gradient-to-b from-lime-400 to-green-600 border-white text-white'
                    : 'bg-gradient-to-b from-blue-500 to-blue-700 border-white text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 leading-none select-none">
                  {toast.type === 'error'
                    ? <AlertTriangle size={15} />
                    : toast.type === 'success'
                      ? <CheckCircle2 size={15} />
                      : <Info size={15} />}
                </span>
                <span className="font-rounded text-[11px] font-bold tracking-wide leading-tight">
                  {toast.message}
                </span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-white/70 hover:text-white transition-colors ml-4"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* =================================================================== */}
      {/* FULL SCREEN - Virtual Card Table Viewport                           */}
      {/* =================================================================== */}
      <div className="w-full h-full relative">
        
        {/* Full-screen Table Scene */}
        <div className="w-full h-full absolute inset-0 z-0">
          <TableScene />
        </div>

        {/* Winner Highlight Spotlight Overlay */}
        {gameStatus === 'ended' && winnerPlayerObj && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: `radial-gradient(circle 200px at ${winnerCoords.left} ${winnerCoords.top}, transparent 10%, rgba(3, 7, 18, 0.88) 100%)`
            }}
          />
        )}

        {/* HUD: Overlay Top Header Panel */}
        <header className="absolute top-0 left-0 right-0 p-5 flex justify-between items-start z-20 pointer-events-none">
          {/* Top Left: Compact Lobby Panel */}
          {room && (
            <div className="pointer-events-auto">
              <button
                onClick={handleCopyCode}
                className="group chip-arcade flex items-center gap-2.5 bg-gradient-to-b from-neutral-800 to-black px-4 py-2"
                title="Copy Room Code"
              >
                <span className="font-arcade text-xs text-yellow-300 uppercase tracking-widest">
                  Lobby
                </span>
                <span className="font-arcade text-base text-white tracking-wider">
                  {room.code}
                </span>
                <div className="text-white/80 group-hover:text-white transition-colors ml-1">
                  {copied ? <Check size={14} className="text-lime-300" /> : <Copy size={14} />}
                </div>
              </button>
            </div>
          )}

          {/* Top Right: Essential Actions */}
          <div className="flex gap-3 items-center pointer-events-auto">
            <button
              onClick={() => {
                toggleMic();
              }}
              className={`chip-arcade w-11 h-11 flex items-center justify-center text-white ${
                isMicEnabled
                  ? 'bg-gradient-to-b from-lime-400 to-green-600'
                  : 'bg-gradient-to-b from-rose-500 to-red-700'
              }`}
              title={isMicEnabled ? 'Mute Microphone' : 'Enable Microphone'}
            >
              {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            </button>

            <button
              onClick={() => {
                setSpeakerEnabled(!isSpeakerEnabled);
                addToast(!isSpeakerEnabled ? 'Voice Chat Enabled' : 'Voice Chat Muted', 'info');
              }}
              className={`chip-arcade w-11 h-11 flex items-center justify-center text-white ${
                isSpeakerEnabled
                  ? 'bg-gradient-to-b from-blue-400 to-blue-600'
                  : 'bg-gradient-to-b from-rose-500 to-red-700'
              }`}
              title={isSpeakerEnabled ? 'Mute Voice Chat' : 'Enable Voice Chat'}
            >
              <Headphones size={16} />
            </button>

            <button
              onClick={() => {
                setIsSettingsOpen(true);
              }}
              className="chip-arcade w-11 h-11 flex items-center justify-center text-white bg-gradient-to-b from-neutral-700 to-neutral-900"
              title="Settings"
            >
              <Settings size={16} className="text-white" />
            </button>

            <button
              onClick={() => {
                leaveRoom();
                router.push('/');
              }}
              className="chip-arcade w-11 h-11 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700"
              title="Exit Table"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* HUD: Bottom Table Actions */}
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center z-20 pointer-events-none">
          <div className="pointer-events-auto">
            {/* Display state alert banners */}
            <div className="flex flex-col items-center gap-1.5">
              {gameStatus === 'lobby' ? (
                isHost ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      disabled={!canStart || isProcessing || isSpectator}
                      onClick={() => {
                        setIsProcessing(true);
                        startGame();
                      }}
                      className="btn-arcade bg-gradient-to-b from-lime-400 to-green-600 text-white py-2.5 px-7 text-sm uppercase disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      <Play size={15} className="fill-white" /> Start Game
                    </button>
                    {!canStart && (
                      <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-yellow-300 px-3 py-1 rounded-full shadow-md">
                        Waiting for players to sit ({totalPlayers}/2 minimum)
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-yellow-300 px-3 py-1 rounded-full shadow-md">
                    Waiting for host...
                  </span>
                )
              ) : gameStatus === 'playing' ? (
                isMyTurn ? (
                  <span className="font-arcade text-xs bg-gradient-to-b from-lime-400 to-green-600 border-[3px] border-white text-white px-4 py-1.5 rounded-full shadow-[0_4px_0_0_rgba(0,0,0,0.3)] uppercase tracking-wide animate-pulse inline-flex items-center gap-1.5">
                    <Star size={14} className="fill-white" /> Your Turn!
                    <TurnTimer className="ml-1 text-[11px] no-underline normal-case not-italic" />
                  </span>
                ) : (
                  <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-blue-300 px-3 py-1 rounded-full shadow-md inline-flex items-center gap-1.5">
                    Waiting for {room?.players.find(p => p.id === currentPlayerId)?.name || `Seat ${currentPlayerSeat}`}...
                    <TurnTimer className="text-[10px]" />
                  </span>
                )
              ) : gameStatus === 'awaiting_color_selection' ? (
                <span className="font-rounded font-bold text-[10px] bg-black/85 border-2 border-white/30 text-yellow-300 px-3.5 py-1.5 rounded-full shadow-md inline-flex items-center gap-1.5">
                  Waiting for color selection...
                  <TurnTimer className="text-[10px]" />
                </span>
              ) : null}

              {/* Declare UNO Button — shown while holding exactly 2 cards. Declaring
                  now exempts you from the automatic +4 penalty that hits when a
                  play would otherwise drop you to a single undeclared card. */}
              {myHand.length === 2 && gameStatus === 'playing' && !isSpectator && !(player && unoCalled[player.id]) && (
                <motion.button
                  disabled={isProcessing}
                  whileTap={{ scale: 0.92, y: 4 }}
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }}
                  onClick={() => {
                    setIsProcessing(true);
                    callUno();
                  }}
                  className="btn-arcade mt-2 text-white uppercase inline-flex items-center gap-1.5 px-7 py-3 text-lg bg-gradient-to-b from-red-500 to-orange-600"
                >
                  <Siren size={18} /> CALL UNO!
                </motion.button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* =================================================================== */}
      {/* OVERLAYS: Game Stopped — Not Enough Players Banner                  */}
      {/* =================================================================== */}
      <AnimatePresence>
        {gameStatus === 'lobby' && gameStoppedNotice && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-[90%] max-w-md"
          >
            <div className="panel-arcade bg-gradient-to-b from-neutral-900 to-black px-6 py-5 flex flex-col items-center gap-3 text-center relative">
              <button
                onClick={() => setGameStoppedNotice(false)}
                className="absolute top-2.5 right-2.5 chip-arcade w-7 h-7 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700"
                title="Dismiss"
              >
                <X size={13} />
              </button>
              <div className="w-14 h-14 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] animate-bounce">
                <Pause size={26} className="fill-white" />
              </div>
              <h3 className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm">
                Game Stopped
              </h3>
              <p className="font-rounded font-semibold text-white/85 text-sm leading-snug">
                Not enough players to keep playing. The table has been reset.
              </p>
              <p className="font-rounded font-bold text-[11px] uppercase tracking-wider text-cyan-200 animate-pulse">
                {isHost
                  ? canStart
                    ? 'Press Start Game to play a fresh round!'
                    : 'Waiting for another player to join…'
                  : 'Waiting for the host to start a new game…'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* OVERLAYS: Color Selection Wheel Dialog                              */}
      {/* =================================================================== */}
      {gameStatus === 'awaiting_color_selection' && player && colorChooserId === player.id && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-6 flex flex-col items-center gap-6 max-w-sm text-center pointer-events-auto">
            <div>
              <h3 className="font-arcade text-2xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm">Choose Color</h3>
              <p className="font-rounded font-semibold text-white/80 text-xs mt-1">Pick the active color for the Wild card</p>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                disabled={isProcessing}
                onClick={() => {
                  setIsProcessing(true);
                  chooseColor('red');
                }}
                className="btn-arcade bg-gradient-to-b from-red-400 to-red-600 text-white py-5 text-base uppercase disabled:cursor-not-allowed"
              >
                Red
              </button>
              <button
                disabled={isProcessing}
                onClick={() => {
                  setIsProcessing(true);
                  chooseColor('blue');
                }}
                className="btn-arcade bg-gradient-to-b from-blue-400 to-blue-600 text-white py-5 text-base uppercase disabled:cursor-not-allowed"
              >
                Blue
              </button>
              <button
                disabled={isProcessing}
                onClick={() => {
                  setIsProcessing(true);
                  chooseColor('green');
                }}
                className="btn-arcade bg-gradient-to-b from-lime-400 to-green-600 text-white py-5 text-base uppercase disabled:cursor-not-allowed"
              >
                Green
              </button>
              <button
                disabled={isProcessing}
                onClick={() => {
                  setIsProcessing(true);
                  chooseColor('yellow');
                }}
                className="btn-arcade bg-gradient-to-b from-yellow-300 to-amber-500 text-neutral-900 py-5 text-base uppercase disabled:cursor-not-allowed"
              >
                Yellow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* OVERLAYS: Confetti Canvas Game Over Standings & Play Again          */}
      {/* =================================================================== */}
      {gameStatus === 'ended' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 pointer-events-auto overflow-hidden">
          {/* Confetti canvas animation */}
          <ConfettiCanvas />

          <div className="panel-arcade bg-gradient-to-b from-neutral-900 to-black p-7 flex flex-col items-center gap-5 max-w-sm w-full text-center z-20 relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 border-4 border-white flex items-center justify-center text-white shadow-[0_4px_0_0_rgba(0,0,0,0.3)] animate-bounce">
              <Trophy size={30} className="fill-white/30" />
            </div>
            <div>
              <h2 className="font-arcade text-3xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm animate-pulse">Victory!</h2>
              <p className="font-rounded font-bold text-white text-md mt-1 inline-flex items-center gap-1.5">
                <PartyPopper size={16} className="text-yellow-300" />
                {player && winnerName === player.name ? 'YOU WON THE GAME!' : `${winnerName} won the game!`}
              </p>
            </div>

            {/* Standings Leaderboard List */}
            <div className="w-full border-t-2 border-b-2 border-white/20 py-3 my-0.5 space-y-2 max-h-48 overflow-y-auto">
              <span className="font-arcade text-[10px] uppercase tracking-widest text-yellow-200 block text-left mb-1">Final Standings</span>
              {standings.map((entry, idx) => {
                const rank = idx + 1;
                const isWinner = rank === 1;
                const RankIcon = rank === 1 ? Trophy : rank === 2 ? Medal : Award;
                const rankIconColor = rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-slate-300' : 'text-orange-400';
                return (
                  <div
                    key={entry.id}
                    className={`flex justify-between items-center px-3 py-1.5 rounded-xl border-2 ${
                      isWinner
                        ? 'bg-amber-400/20 border-yellow-300/60 text-yellow-100'
                        : entry.id === player?.id
                          ? 'bg-blue-500/20 border-blue-400/50 text-blue-100'
                          : 'bg-white/5 border-white/15 text-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11px] font-rounded font-bold">
                      <span className="inline-flex items-center gap-1">
                        <RankIcon size={14} className={rankIconColor} /> #{rank}
                      </span>
                      <span className="font-arcade truncate max-w-[100px]">{entry.name}</span>
                    </div>
                    <span className="text-[10px] font-rounded font-semibold text-white/60">
                      {entry.cardCount === 0 ? 'Won' : `${entry.cardCount} cards left`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Play Again Loop Buttons */}
            <div className="w-full space-y-2">
              {isHost ? (
                <button
                  disabled={isProcessing}
                  onClick={() => {
                    setIsProcessing(true);
                    startGame();
                  }}
                  className="btn-arcade w-full bg-gradient-to-b from-lime-400 to-green-600 text-white py-3 px-6 text-sm uppercase disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} /> Play Again
                </button>
              ) : (
                <div className="w-full py-2.5 px-4 rounded-full bg-white/5 border-2 border-white/15 text-center animate-pulse font-rounded font-bold text-[10px] uppercase tracking-widest text-yellow-200 inline-flex items-center justify-center gap-1.5">
                  <Hourglass size={12} /> Waiting for host to restart...
                </div>
              )}

              <button
                onClick={() => {
                  leaveRoom();
                  router.push('/');
                }}
                className="btn-arcade w-full bg-gradient-to-b from-rose-500 to-red-700 text-white py-3 px-4 text-xs uppercase"
              >
                Exit to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME EFFECTS LAYER */}
      <TurnGlowIndicator />

    </div>
  );
}
