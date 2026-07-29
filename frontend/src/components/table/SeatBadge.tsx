'use client';

import React from 'react';
import { Bot, Mic, VolumeX } from 'lucide-react';
import { useVoiceStore, localMuteKey } from '../../store/useVoiceStore';

/**
 * The single, world-anchored badge that represents one opponent seat.
 *
 * It replaces the two overlapping systems that used to render opponent info
 * (the name/"N CARDS" HTML badge in WebGLCards AND the separate 2D
 * PlayerNameplates overlay) with one compact frosted-glass pill:
 *
 *   [ count ]  Name  (indicator)
 *
 * Everything here is presentation only — it reads the authoritative card count,
 * turn and UNO state as plain props from WebGLCards, and subscribes to the voice
 * store per-occupant so voice churn only re-renders this one badge's DOM (it is
 * portaled via drei <Html>, so it never touches the 3D card meshes).
 *
 * Context-aware by design: inactive seats stay quiet and dim; the active player
 * lights up; low-card / UNO states surface only when they actually matter.
 */
export interface SeatBadgeProps {
  /** Socket/bot id — keys the per-peer voice status subscription. */
  playerId: string;
  name: string;
  cardCount: number;
  isActiveTurn: boolean;
  isBot?: boolean;
  /** Whether this player has declared UNO (authoritative `unoCalled[id]`). */
  hasCalledUno?: boolean;
  /** Coarse device bucket — shrinks type + spacing on phones. */
  compact?: boolean;
}

const SeatBadgeInner: React.FC<SeatBadgeProps> = ({
  playerId,
  name,
  cardCount,
  isActiveTurn,
  isBot = false,
  hasCalledUno = false,
  compact = false,
}) => {
  // Narrow, per-occupant voice subscriptions. Because `updatePeerStatus` writes a
  // fresh object only for the peer that changed, another peer speaking does not
  // change this selector's result → no re-render here.
  const voiceStatus = useVoiceStore((s) => s.peerStatuses[playerId]);
  const isMutedByMe = useVoiceStore((s) => !!s.locallyMutedPeers[localMuteKey(name)]);
  const isSpeaking = (voiceStatus?.isSpeaking ?? false) && !isMutedByMe;

  // A player is in an "UNO situation" when they hold a single card, or the server
  // recorded their declaration. Shown only then — never as permanent chrome.
  const showUno = (hasCalledUno || cardCount === 1) && cardCount > 0;
  // Low-card emphasis (2 or fewer): draws the eye to a near-winning opponent.
  const lowCards = cardCount > 0 && cardCount <= 2;

  // Voice icon appears ONLY when it carries live meaning (speaking / you muted
  // them / it's a bot). An idle, un-muted peer shows nothing — the roster panel
  // owns the full per-player voice controls.
  const voiceIcon = isBot ? (
    <Bot size={compact ? 11 : 12} className="text-cyan-300 shrink-0" aria-hidden="true" />
  ) : isMutedByMe ? (
    <VolumeX size={compact ? 11 : 12} className="text-rose-400 shrink-0" aria-hidden="true" />
  ) : isSpeaking ? (
    <Mic size={compact ? 11 : 12} className="text-emerald-300 shrink-0 animate-pulse" aria-hidden="true" />
  ) : null;

  // Accessible one-line summary (colour is never the only signal).
  const ariaLabel = `${name}, ${cardCount} card${cardCount === 1 ? '' : 's'}` +
    `${isActiveTurn ? ', current turn' : ''}${showUno ? ', called UNO' : ''}`;

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`hud-pop-in flex flex-col items-center gap-1 pointer-events-none select-none whitespace-nowrap transition-[opacity,transform] duration-300 ${
        isActiveTurn ? 'opacity-100' : 'opacity-80'
      }`}
      style={{ transform: isActiveTurn ? 'scale(1.06)' : 'scale(1)' }}
    >
      {/* UNO tag — surfaces only during an UNO situation */}
      {showUno && (
        <span
          className="px-2 py-[1px] rounded-full bg-gradient-to-b from-red-500 to-orange-600 text-white font-arcade text-[9px] tracking-[0.15em] uppercase shadow-[0_0_10px_rgba(239,68,68,0.6)] border border-white/40 animate-pulse"
          aria-hidden="true"
        >
          Uno
        </span>
      )}

      {/* Main glass pill */}
      <div
        className={`flex items-center gap-1.5 rounded-full backdrop-blur-md border shadow-lg transition-colors duration-300 ${
          compact ? 'px-1.5 py-0.5' : 'px-2 py-1'
        } ${
          isActiveTurn
            ? 'bg-emerald-950/60 border-emerald-400/70 shadow-[0_0_16px_rgba(16,185,129,0.4)] ring-1 ring-emerald-400/50'
            : isSpeaking
              ? 'bg-emerald-950/50 border-emerald-500/50'
              : 'bg-slate-950/55 border-white/10'
        }`}
      >
        {/* Card-count chip — number only. Low counts flip to a solid amber fill
            (a contrast/fill cue, not just hue) and pulse at exactly one card.
            Keyed on the value so a change replays the one-shot bump. */}
        <span
          key={cardCount}
          className={`hud-count-bump inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none ${
            compact ? 'min-w-[16px] h-4 text-[10px] px-1' : 'min-w-[20px] h-5 text-[11px] px-1'
          } ${
            lowCards
              ? `bg-amber-400 text-slate-900 ring-1 ring-amber-200/80 shadow-[0_0_8px_rgba(251,191,36,0.5)] ${cardCount === 1 ? 'animate-pulse' : ''}`
              : 'bg-white/15 text-white'
          }`}
          aria-hidden="true"
        >
          {cardCount}
        </span>

        {/* Name — small, readable, gracefully truncated */}
        <span
          className={`font-semibold tracking-tight truncate ${
            compact ? 'text-[10px] max-w-[20vw]' : 'text-[11px] sm:text-xs max-w-[22vw] sm:max-w-[140px]'
          } ${isActiveTurn ? 'text-white' : 'text-white/85'}`}
        >
          {name}
        </span>

        {voiceIcon}
      </div>
    </div>
  );
};

/**
 * Memoised: primitive props mean this only re-renders when THIS seat's count,
 * turn, UNO or bot flag change (plus its own voice subscription), so the badge
 * layer stays cheap even at a full 10-seat table.
 */
export const SeatBadge = React.memo(SeatBadgeInner);

export default SeatBadge;
