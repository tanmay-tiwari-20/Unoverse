'use client';

import React from 'react';
import {
  Headphones,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  Settings,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useChatEnabled } from '../../hooks/useChatEnabled';
import { useExitTable } from '../../hooks/useExitTable';
import { FriendsButton } from '../social/FriendsButton';

export interface HudControlsProps {
  /**
   * Mic toggle from `useVoiceChat`. The WebRTC mesh must be mounted exactly
   * once and for the whole lifetime of the room, so the hook stays in the route
   * component and only its toggle is handed down here.
   */
  onToggleMic: () => void;
}

/**
 * Top-right HUD cluster: voice (mic + speaker), table chat, settings and exit.
 * Kept together because they are one visual row of arcade chips — splitting
 * them per concern would split a single flex layout across files.
 */
export const HudControls: React.FC<HudControlsProps> = ({ onToggleMic }) => {
  const addToast = useGameStore((s) => s.addToast);
  const isChatOpen = useGameStore((s) => s.isChatOpen);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
  const unreadChatCount = useGameStore((s) => s.unreadChatCount);
  const { isMicEnabled, isSpeakerEnabled, setSpeakerEnabled } = useVoiceStore();
  const { setIsSettingsOpen } = useSettingsStore();
  const chatEnabled = useChatEnabled();
  const exitTable = useExitTable();

  return (
    <div className="flex gap-1.5 sm:gap-3 items-center pointer-events-auto">
      <button
        onClick={() => {
          onToggleMic();
        }}
        className={`chip-arcade w-9 h-9 sm:w-11 sm:h-11 short:w-9 short:h-9 flex items-center justify-center text-white cursor-pointer ${
          isMicEnabled
            ? 'bg-gradient-to-b from-lime-400 to-green-600'
            : 'bg-gradient-to-b from-rose-500 to-red-700'
        }`}
        title={isMicEnabled ? 'Mute Microphone' : 'Enable Microphone'}
        aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={isMicEnabled}
      >
        {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />}
      </button>

      <button
        onClick={() => {
          setSpeakerEnabled(!isSpeakerEnabled);
          addToast(!isSpeakerEnabled ? 'Voice Chat Enabled' : 'Voice Chat Muted', 'info');
        }}
        className={`chip-arcade w-9 h-9 sm:w-11 sm:h-11 short:w-9 short:h-9 flex items-center justify-center text-white cursor-pointer ${
          isSpeakerEnabled
            ? 'bg-gradient-to-b from-blue-400 to-blue-600'
            : 'bg-gradient-to-b from-rose-500 to-red-700'
        }`}
        title={isSpeakerEnabled ? 'Mute Voice Chat' : 'Enable Voice Chat'}
        aria-label={isSpeakerEnabled ? 'Mute voice chat' : 'Enable voice chat'}
        aria-pressed={isSpeakerEnabled}
      >
        <Headphones size={16} />
      </button>

      {/* Chat toggle — hidden entirely when the host disables Table Chat.
          Reactions and voice remain available. */}
      {chatEnabled && (
        <button
          onClick={() => setChatOpen(!isChatOpen)}
          className={`chip-arcade relative w-9 h-9 sm:w-11 sm:h-11 short:w-9 short:h-9 flex items-center justify-center text-white cursor-pointer ${
            isChatOpen
              ? 'bg-gradient-to-b from-blue-400 to-blue-600'
              : 'bg-gradient-to-b from-neutral-700 to-neutral-900'
          }`}
          title="Table Chat"
          aria-label={
            isChatOpen
              ? 'Close table chat'
              : unreadChatCount > 0
                ? `Open table chat, ${unreadChatCount} unread ${unreadChatCount === 1 ? 'message' : 'messages'}`
                : 'Open table chat'
          }
          aria-expanded={isChatOpen}
          aria-controls="table-chat-panel"
        >
          <MessageCircle size={16} />
          {/* Unread indicator — only when the panel is closed */}
          {!isChatOpen && unreadChatCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-b from-rose-500 to-red-600 border-2 border-neutral-900 text-white text-[9px] font-black flex items-center justify-center shadow-md"
              aria-hidden="true"
            >
              {unreadChatCount > 9 ? '9+' : unreadChatCount}
            </span>
          )}
        </button>
      )}

      {/* Friends drawer — sized to match the neighbouring chips so the row
          stays one visual unit. Sits before Settings so the destructive Exit
          chip keeps its position at the end of the row. */}
      <FriendsButton compact className="w-9 h-9 sm:w-11 sm:h-11 short:w-9 short:h-9" />

      <button
        onClick={() => {
          setIsSettingsOpen(true);
        }}
        className="chip-arcade w-9 h-9 sm:w-11 sm:h-11 short:w-9 short:h-9 flex items-center justify-center text-white cursor-pointer bg-gradient-to-b from-neutral-700 to-neutral-900"
        title="Settings"
        aria-label="Open settings"
        aria-haspopup="dialog"
      >
        <Settings size={16} className="text-white" />
      </button>

      <button
        onClick={exitTable}
        className="chip-arcade w-9 h-9 sm:w-11 sm:h-11 short:w-9 short:h-9 flex items-center justify-center text-white cursor-pointer bg-gradient-to-b from-rose-500 to-red-700"
        title="Exit Table"
        aria-label="Exit room"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
};

export default HudControls;
