'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Glasses, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { getSeatCoords } from '../../utils/seating';
import { useSocket } from '../../hooks/useSocket';

interface EmojiConfig {
  emoji: string;
  label: string;
  color: string;
  glow: string;
}

const EMOJI_METADATA: EmojiConfig[] = [
  { emoji: '😂', label: 'LOL', color: 'text-yellow-400', glow: 'rgba(250, 204, 21, 0.6)' },
  { emoji: '😭', label: 'CRY', color: 'text-blue-400', glow: 'rgba(96, 165, 250, 0.6)' },
  { emoji: '🔥', label: 'FIRE', color: 'text-orange-500', glow: 'rgba(249, 115, 22, 0.7)' },
  { emoji: '😡', label: 'MAD', color: 'text-red-500', glow: 'rgba(239, 68, 68, 0.7)' },
  { emoji: '😱', label: 'SHOCK', color: 'text-purple-400', glow: 'rgba(192, 132, 252, 0.6)' },
  { emoji: '👏', label: 'CLAP', color: 'text-emerald-400', glow: 'rgba(52, 211, 153, 0.6)' },
  { emoji: '💀', label: 'DEAD', color: 'text-slate-400', glow: 'rgba(148, 163, 184, 0.6)' },
];

const getEmojiCoords = (index: number, radius: number) => {
  const startAngle = 135; // degrees
  const step = 22.5; // degrees
  const angleDeg = startAngle + index * step;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: radius * Math.cos(angleRad),
    y: radius * Math.sin(angleRad)
  };
};

const itemVariants = {
  hidden: { scale: 0, x: 0, y: 0, opacity: 0 },
  visible: (custom: { coords: { x: number; y: number }; isActive: boolean; idx: number }) => ({
    scale: custom.isActive ? 1.25 : 1,
    x: custom.coords.x,
    y: custom.coords.y,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 350,
      damping: 22,
      delay: custom.idx * 0.015
    }
  })
};

export const ReactionsHandler: React.FC = () => {
  const { 
    room, 
    player, 
    reactions, 
    removeReaction 
  } = useGameStore();

  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'none' | 'click' | 'drag'>('none');
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const [radius, setRadius] = useState(85);

  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Set responsive radius
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setRadius(72);
      } else {
        setRadius(88);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Click outside to close picker (only active when in persistent click mode)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setInteractionMode('none');
        setActiveDragIndex(null);
      }
    };
    if (isOpen && interactionMode === 'click') {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, interactionMode]);

  const localSeatNumber = player?.seatNumber || 1;
  const playersList = room?.players || [];
  const numPlayers = playersList.length || 2;
  const localIndex = room ? playersList.findIndex(p => p.id === player?.id) : -1;

  // Emit reaction socket event
  const sendEmoji = (emoji: string) => {
    if (socket) {
      socket.emit('send-reaction', { emoji });
      setIsOpen(false);
      setInteractionMode('none');
      setActiveDragIndex(null);
    }
  };

  const getButtonCenter = () => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    const center = getButtonCenter();
    if (!center) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }

    setIsOpen(true);
    setInteractionMode('drag');
    setActiveDragIndex(null);

    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = Date.now();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - center.x;
      const dy = moveEvent.clientY - center.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d > 10) {
        let phi = Math.atan2(dy, dx);
        if (phi < 0) phi += 2 * Math.PI;

        const phiDeg = (phi * 180) / Math.PI;

        // Valid selection arc: 112.5° to 292.5°
        if (d >= 30 && phiDeg >= 112.5 && phiDeg <= 292.5) {
          const relativeAngle = phiDeg - 135;
          const idx = Math.round(relativeAngle / 22.5);
          const clampedIdx = Math.max(0, Math.min(6, idx));
          setActiveDragIndex(clampedIdx);
        } else {
          setActiveDragIndex(null);
        }
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      try {
        e.currentTarget.releasePointerCapture(upEvent.pointerId);
      } catch (err) {
        // ignore
      }

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      const dx = upEvent.clientX - startX;
      const dy = upEvent.clientY - startY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const duration = Date.now() - startTime;

      if (d < 10 && duration < 250) {
        // Simple click toggle!
        if (interactionMode === 'click') {
          setIsOpen(false);
          setInteractionMode('none');
          setActiveDragIndex(null);
        } else {
          setIsOpen(true);
          setInteractionMode('click');
          setActiveDragIndex(null);
        }
      } else {
        // Drag gesture completion
        let finalIndex: number | null = null;
        const releaseDx = upEvent.clientX - center.x;
        const releaseDy = upEvent.clientY - center.y;
        const releaseD = Math.sqrt(releaseDx * releaseDx + releaseDy * releaseDy);

        if (releaseD >= 30) {
          let phi = Math.atan2(releaseDy, releaseDx);
          if (phi < 0) phi += 2 * Math.PI;
          const phiDeg = (phi * 180) / Math.PI;

          if (phiDeg >= 112.5 && phiDeg <= 292.5) {
            const relativeAngle = phiDeg - 135;
            const idx = Math.round(relativeAngle / 22.5);
            finalIndex = Math.max(0, Math.min(6, idx));
          }
        }

        if (finalIndex !== null) {
          sendEmoji(EMOJI_METADATA[finalIndex].emoji);
        } else {
          setIsOpen(false);
          setInteractionMode('none');
          setActiveDragIndex(null);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <>
      {/* Floating Reactions Render Layer */}
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
        <AnimatePresence>
          {reactions.map((reaction) => {
            return (
              <ReactionBubble
                key={reaction.id}
                reaction={reaction}
                localSeatNumber={localSeatNumber}
                numPlayers={numPlayers}
                localIndex={localIndex}
                playersList={playersList}
                roomStatus={room?.status || 'lobby'}
                onComplete={() => removeReaction(reaction.id)}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Toggle Button + Reactions Picker Popup */}
      <div className="fixed bottom-[38%] sm:bottom-24 right-2 sm:right-4 z-30 select-none touch-none" ref={pickerRef}>
        <div className="relative flex items-center justify-center">
          
          {/* Radial Picker Menu */}
          <AnimatePresence>
            {isOpen && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-45 w-0 h-0">
                {/* SVG Guideline */}
                <svg className="absolute overflow-visible pointer-events-none" style={{ width: 0, height: 0 }}>
                  <path
                    d={`M ${getEmojiCoords(0, radius).x} ${getEmojiCoords(0, radius).y} A ${radius} ${radius} 0 0 1 ${getEmojiCoords(6, radius).x} ${getEmojiCoords(6, radius).y}`}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.12)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    className="opacity-70"
                  />
                </svg>

                {/* Glowing pointer line to active emoji */}
                {activeDragIndex !== null && (
                  <svg className="absolute overflow-visible pointer-events-none" style={{ width: 0, height: 0 }}>
                    <motion.line
                      x1={0}
                      y1={0}
                      initial={{ x2: 0, y2: 0 }}
                      animate={{
                        x2: getEmojiCoords(activeDragIndex, radius).x,
                        y2: getEmojiCoords(activeDragIndex, radius).y
                      }}
                      stroke={EMOJI_METADATA[activeDragIndex].glow}
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="opacity-80"
                    />
                  </svg>
                )}

                {/* Emoji Slots */}
                {EMOJI_METADATA.map((item, idx) => {
                  const coords = getEmojiCoords(idx, radius);
                  const isActive = activeDragIndex === idx;
                  
                  return (
                    <motion.button
                      key={item.emoji}
                      custom={{ coords, isActive, idx }}
                      variants={itemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full backdrop-blur-md flex items-center justify-center border transition-all pointer-events-auto shadow-lg select-none cursor-pointer ${
                        isActive
                          ? `bg-slate-900/95 border-white scale-125 z-40`
                          : `bg-slate-950/80 border-slate-800 hover:border-slate-600 hover:scale-110 z-20`
                      }`}
                      style={{
                        borderColor: isActive ? item.glow : undefined,
                        boxShadow: isActive ? `0 0 20px ${item.glow}` : undefined,
                      }}
                      onPointerEnter={() => {
                        if (interactionMode === 'click') {
                          setActiveDragIndex(idx);
                        }
                      }}
                      onPointerLeave={() => {
                        if (interactionMode === 'click' && activeDragIndex === idx) {
                          setActiveDragIndex(null);
                        }
                      }}
                      onClick={() => {
                        sendEmoji(item.emoji);
                      }}
                      aria-label={`React with ${item.label}`}
                    >
                      <span className="text-xl sm:text-2xl leading-none" aria-hidden="true">{item.emoji}</span>
                    </motion.button>
                  );
                })}

                {/* Center Status Hub */}
                <motion.button
                  type="button"
                  aria-label="Close reactions menu"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full backdrop-blur-lg border flex flex-col items-center justify-center z-50 pointer-events-auto transition-all duration-200 cursor-pointer"
                  style={{
                    left: 0,
                    top: 0,
                    backgroundColor: activeDragIndex !== null ? 'rgba(15, 23, 42, 0.95)' : 'rgba(3, 7, 18, 0.85)',
                    borderColor: activeDragIndex !== null ? EMOJI_METADATA[activeDragIndex].glow : 'rgba(51, 65, 85, 0.5)',
                    boxShadow: activeDragIndex !== null ? `0 0 20px ${EMOJI_METADATA[activeDragIndex].glow}` : 'none'
                  }}
                  onClick={() => {
                    if (interactionMode === 'click') {
                      setIsOpen(false);
                      setInteractionMode('none');
                      setActiveDragIndex(null);
                    }
                  }}
                >
                  {activeDragIndex !== null ? (
                    <>
                      <span className="text-lg leading-none select-none animate-bounce">
                        {EMOJI_METADATA[activeDragIndex].emoji}
                      </span>
                      <span className={`text-[7px] font-black tracking-wider uppercase mt-0.5 ${EMOJI_METADATA[activeDragIndex].color}`}>
                        {EMOJI_METADATA[activeDragIndex].label}
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      <X size={14} className="text-slate-400" />
                      <span className="text-[6px] font-black uppercase tracking-wider text-slate-500 mt-0.5 select-none">
                        Cancel
                      </span>
                    </div>
                  )}
                </motion.button>

              </div>
            )}
          </AnimatePresence>

          {/* Trigger Button */}
          <motion.button
            ref={buttonRef}
            onPointerDown={handlePointerDown}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Open reactions menu"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            className={`pointer-events-auto glass-panel bg-slate-950/85 hover:bg-slate-900 border border-slate-800 rounded-full px-4 py-2.5 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-[10px] font-extrabold text-slate-300 hover:text-white transition-all shadow-lg flex items-center gap-1.5 touch-none select-none ${
              isOpen ? 'opacity-0 pointer-events-none scale-75' : ''
            }`}
            style={{
              transition: 'opacity 0.2s, transform 0.2s'
            }}
          >
            <Smile size={16} className="sm:size-3.5" aria-hidden="true" />
            <span className="uppercase tracking-wider">React</span>
          </motion.button>

        </div>
      </div>
    </>
  );
};

// Helper component to handle auto-destroy timer and coordinates
interface ReactionBubbleProps {
  reaction: {
    id: string;
    name: string;
    seatNumber: number | null;
    emoji: string;
    isSpectator: boolean;
  };
  localSeatNumber: number;
  numPlayers: number;
  localIndex: number;
  playersList: any[];
  roomStatus: string;
  onComplete: () => void;
}

const ReactionBubble: React.FC<ReactionBubbleProps> = ({
  reaction,
  localSeatNumber,
  numPlayers,
  localIndex,
  playersList,
  roomStatus,
  onComplete,
}) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  // If spectator reaction, render as a floating toast from bottom center
  if (reaction.isSpectator || reaction.seatNumber === null) {
    return (
      <motion.div
        initial={{ y: 50, x: '-50%', opacity: 0, scale: 0.8 }}
        animate={{ y: -160, x: '-50%', opacity: 1, scale: 1 }}
        exit={{ opacity: 0, y: -220 }}
        transition={{ duration: 2.2, ease: 'easeOut' }}
        className="absolute left-1/2 bottom-12 px-3.5 py-1.5 bg-slate-900/90 border border-slate-800 rounded-full shadow-2xl flex items-center gap-2"
      >
        <span className="text-[9px] font-bold text-slate-400 inline-flex items-center gap-1">
          <Glasses size={11} /> Spectator {reaction.name}:
        </span>
        <span className="text-base leading-none select-none">{reaction.emoji}</span>
      </motion.div>
    );
  }

  // Get coords of player seat
  let coords = { left: '50%', top: '88%', rotation: 0 };
  if (roomStatus === 'playing') {
    const playerIndex = playersList.findIndex(p => p.seatNumber === reaction.seatNumber);
    if (playerIndex !== -1 && localIndex !== -1) {
      const visualSlotIndex = (playerIndex - localIndex + numPlayers) % numPlayers;
      coords = getSeatCoords(visualSlotIndex, 0, numPlayers);
    }
  } else {
    coords = getSeatCoords(reaction.seatNumber, localSeatNumber, 6);
  }

  return (
    <motion.div
      initial={{ scale: 0.3, y: 10, opacity: 0 }}
      animate={{ scale: [1, 1.3, 1], y: -55, opacity: 1 }}
      exit={{ opacity: 0, y: -85, scale: 0.8 }}
      transition={{ duration: 2.0, ease: 'easeOut' }}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none"
      style={{
        left: coords.left,
        top: coords.top,
      }}
    >
      {/* Floating Emoji bubble */}
      <div className="bg-slate-900/90 border border-slate-800 shadow-2xl p-2 rounded-full flex items-center justify-center scale-110">
        <span className="text-xl leading-none">{reaction.emoji}</span>
      </div>
      {/* Mini name pointer */}
      <div className="mt-1 bg-slate-950/80 border border-slate-900 px-1.5 py-0.5 rounded-md">
        <span className="text-[7px] font-black text-slate-400 uppercase tracking-wider">
          {reaction.name}
        </span>
      </div>
    </motion.div>
  );
};
export default ReactionsHandler;
