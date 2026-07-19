'use client';

import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useVoiceStore, localMuteKey } from '../../store/useVoiceStore';

/**
 * Personal (local-only) mute toggle for ONE remote participant in the voice/chat
 * participant list. Muting here silences that peer's incoming audio on THIS
 * client only — nothing is sent to the server, other players keep hearing them,
 * and the underlying WebRTC connection stays untouched (the voice hook simply
 * mutes the peer's audio element).
 *
 * Mutes are keyed by the participant's stable name, so they persist across the
 * peer's reconnects for as long as this user stays in the room. Never rendered
 * for the local user — you cannot personally mute yourself.
 */
export const PeerMuteButton: React.FC<{
  name: string;
  isLocal: boolean;
  className?: string;
}> = ({ name, isLocal, className = '' }) => {
  const key = localMuteKey(name);
  const isMutedByMe = useVoiceStore((s) => !!s.locallyMutedPeers[key]);
  const setPeerLocalMute = useVoiceStore((s) => s.setPeerLocalMute);

  if (isLocal) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setPeerLocalMute(key, !isMutedByMe);
      }}
      title={isMutedByMe ? `Unmute ${name} (only for you)` : `Mute ${name} (only for you)`}
      aria-label={isMutedByMe ? `Unmute ${name} for yourself` : `Mute ${name} for yourself`}
      aria-pressed={isMutedByMe}
      className={`shrink-0 w-6 h-6 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
        isMutedByMe
          ? 'bg-rose-500/25 border-rose-400/60 text-rose-300 hover:bg-rose-500/35'
          : 'bg-white/5 border-white/15 text-slate-300 hover:text-white hover:bg-white/10'
      } ${className}`}
    >
      {isMutedByMe ? <VolumeX size={12} /> : <Volume2 size={12} />}
    </button>
  );
};

export default PeerMuteButton;
