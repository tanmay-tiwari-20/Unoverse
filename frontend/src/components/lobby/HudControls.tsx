'use client';

import React from 'react';
import {
  Headphones,
  HeadphoneOff,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  Settings,
  Users,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useVoiceStore } from '../../store/useVoiceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSocialStore } from '../../store/useSocialStore';
import { useChatEnabled } from '../../hooks/useChatEnabled';
import { useExitTable } from '../../hooks/useExitTable';

/**
 * ============================================================================
 *  HudControls — voice, chat, friends, settings and exit, as ONE tray.
 * ============================================================================
 *
 * These used to be six independent `chip-arcade` buttons, each with its own
 * white 3px border, drop shadow and saturated gradient. Six of those in a
 * corner is six competing objects on top of the live table — the "collection of
 * floating panels" problem, at its worst on a 390px-wide phone where they ate
 * most of the top edge.
 *
 * Now they share one piece of chrome: a single glass tray (`.ui-hud-tray`) with
 * flat icon buttons inside it. What changed is ONLY the presentation — every
 * button, handler, store subscription and aria contract is the same, and the
 * order is unchanged so muscle memory survives.
 *
 * Two rules the tray keeps:
 *   • State is never colour alone. Mic muted swaps to `MicOff`, speaker muted to
 *     `HeadphoneOff`, and the tint is reinforcement on top of the glyph.
 *   • Exit sits behind a hairline separator. It is the one destructive control
 *     here and it should not look like the toggle next to it.
 *
 * The friends button is inlined rather than reusing `<FriendsButton>`: that
 * component brings its own `chip-arcade` shell, which is exactly what the tray
 * replaces. It still drives the same `useSocialStore` panel state and the same
 * attention count, so the two entry points (home page, in-game) stay in sync.
 */

export interface HudControlsProps {
  /**
   * Mic toggle from `useVoiceChat`. The WebRTC mesh must be mounted exactly
   * once and for the whole lifetime of the room, so the hook stays in the route
   * component and only its toggle is handed down here.
   */
  onToggleMic: () => void;
}

/** Small count badge shared by the chat and friends buttons. */
const HudBadge: React.FC<{ count: number; tone: 'rose' | 'amber' }> = ({ count, tone }) => (
  <span
    className={`font-arcade absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full border border-black/60 px-1 text-[8px] leading-none text-white ${
      tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500'
    }`}
    aria-hidden="true"
  >
    {count > 9 ? '9+' : count}
  </span>
);

export const HudControls: React.FC<HudControlsProps> = ({ onToggleMic }) => {
  const addToast = useGameStore((s) => s.addToast);
  const isChatOpen = useGameStore((s) => s.isChatOpen);
  const setChatOpen = useGameStore((s) => s.setChatOpen);
  const unreadChatCount = useGameStore((s) => s.unreadChatCount);
  const { isMicEnabled, isSpeakerEnabled, setSpeakerEnabled } = useVoiceStore();
  const { setIsSettingsOpen } = useSettingsStore();
  const panelOpen = useSocialStore((s) => s.panelOpen);
  const setPanelOpen = useSocialStore((s) => s.setPanelOpen);
  // Derived in the selector so a friend's presence tick never re-renders the HUD.
  const attention = useSocialStore((s) => s.incoming.length + s.invites.length);
  const chatEnabled = useChatEnabled();
  const exitTable = useExitTable();

  return (
    <div className="ui-hud-glass ui-hud-tray pointer-events-auto">
      <button
        onClick={onToggleMic}
        className={`ui-hud-btn ${isMicEnabled ? 'ui-hud-btn-live' : 'ui-hud-btn-off'}`}
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
        className={`ui-hud-btn ${isSpeakerEnabled ? 'ui-hud-btn-on' : 'ui-hud-btn-off'}`}
        title={isSpeakerEnabled ? 'Mute Voice Chat' : 'Enable Voice Chat'}
        aria-label={isSpeakerEnabled ? 'Mute voice chat' : 'Enable voice chat'}
        aria-pressed={isSpeakerEnabled}
      >
        {isSpeakerEnabled ? <Headphones size={16} /> : <HeadphoneOff size={16} />}
      </button>

      {/* Chat toggle — hidden entirely when the host disables Table Chat.
          Reactions and voice remain available. */}
      {chatEnabled && (
        <button
          onClick={() => setChatOpen(!isChatOpen)}
          className={`ui-hud-btn ${isChatOpen ? 'ui-hud-btn-on' : ''}`}
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
          {!isChatOpen && unreadChatCount > 0 && <HudBadge count={unreadChatCount} tone="amber" />}
        </button>
      )}

      {/* Friends drawer. Sits before Settings so the destructive Exit control
          keeps its position at the end of the tray. */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className={`ui-hud-btn ${panelOpen ? 'ui-hud-btn-on' : ''}`}
        title="Friends"
        aria-label={
          attention > 0
            ? `Friends — ${attention} need${attention === 1 ? 's' : ''} your attention`
            : 'Friends'
        }
        aria-expanded={panelOpen}
      >
        <Users size={16} />
        {attention > 0 && <HudBadge count={attention} tone="rose" />}
      </button>

      <button
        onClick={() => setIsSettingsOpen(true)}
        className="ui-hud-btn"
        title="Settings"
        aria-label="Open settings"
        aria-haspopup="dialog"
      >
        <Settings size={16} />
      </button>

      <span className="ui-hud-sep" aria-hidden="true" />

      <button
        onClick={exitTable}
        className="ui-hud-btn ui-hud-btn-danger"
        title="Exit Table"
        aria-label="Exit room"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
};

export default HudControls;
