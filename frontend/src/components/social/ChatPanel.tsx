"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, ArrowDown, Glasses } from "lucide-react";
import { useGameStore, ChatMessage } from "../../store/useGameStore";
import { useSocket } from "../../hooks/useSocket";
import { useViewport } from "../../hooks/useViewport";
import { Avatar } from "../table/Avatar";

export const ChatPanel: React.FC = () => {
  const chatMessages = useGameStore((state) => state.chatMessages);
  const isChatOpen = useGameStore((state) => state.isChatOpen);
  const setChatOpen = useGameStore((state) => state.setChatOpen);
  const player = useGameStore((state) => state.player);
  const room = useGameStore((state) => state.room);
  const isSpectator = useGameStore((state) => state.isSpectator);
  const { sendChat } = useSocket();
  const { isMobile, isTablet, isLandscape } = useViewport();
  const isCompact = isMobile || isTablet;

  const [draft, setDraft] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Whether the user is pinned near the bottom (so we should auto-follow new msgs).
  const nearBottomRef = useRef(true);

  // --- Auto-scroll: follow new messages only when already near the bottom -------
  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    const threshold = 90; // px slack so "close enough" still counts as at-bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const atBottom = isNearBottom();
    nearBottomRef.current = atBottom;
    setShowJumpToLatest(!atBottom);
  };

  // When new messages arrive: follow if the reader was at the bottom; otherwise
  // leave their scroll position alone and surface a "jump to latest" affordance.
  useLayoutEffect(() => {
    if (!isChatOpen) return;
    if (nearBottomRef.current) {
      scrollToBottom("auto");
    } else {
      setShowJumpToLatest(true);
    }
  }, [chatMessages.length, isChatOpen]);

  // Latest `isCompact`, readable without making it a dependency below. The
  // open-effect must fire on open and *only* on open — listing `isCompact` there
  // would re-run the whole reset (including a scroll-to-bottom) when a resize
  // crosses the mobile/tablet breakpoint, yanking the scroll position of someone
  // reading back through history.
  const isCompactRef = useRef(isCompact);
  useEffect(() => {
    isCompactRef.current = isCompact;
  }, [isCompact]);

  useEffect(() => {
    if (!isChatOpen) return;
    nearBottomRef.current = true;
    const raf = requestAnimationFrame(() => {
      setShowJumpToLatest(false);
      scrollToBottom("auto");
      if (!isCompactRef.current) inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isChatOpen]);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!isCompact || !isChatOpen || !vv) {
      // Reset asynchronously so we don't setState directly in the effect body.
      const id = requestAnimationFrame(() => setKeyboardOffset(0));
      return () => cancelAnimationFrame(id);
    }
    const onResize = () => {
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      setKeyboardOffset(overlap);
      if (nearBottomRef.current)
        requestAnimationFrame(() => scrollToBottom("auto"));
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [isCompact, isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isChatOpen, setChatOpen]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft("");
    nearBottomRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom("smooth");
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isCompact) {
      e.preventDefault();
      submit();
    }
  };

  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
  }, [draft]);

  if (!room || (!player && !isSpectator)) return null;

  return (
    <AnimatePresence>
      {isChatOpen && (
        <>
          {isCompact && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)}
              className="fixed inset-0 z-[1190] bg-black/50 backdrop-blur-[2px]"
            />
          )}

          <motion.aside
            key="chat-panel"
            id="table-chat-panel"
            role={isCompact ? "dialog" : "complementary"}
            aria-modal={isCompact ? true : undefined}
            aria-label="Table chat"
            initial={isCompact ? { y: "100%" } : { x: "105%", opacity: 0.6 }}
            animate={isCompact ? { y: 0 } : { x: 0, opacity: 1 }}
            exit={isCompact ? { y: "100%" } : { x: "105%", opacity: 0.6 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={
              isCompact
                ? "fixed inset-x-0 bottom-0 z-[1200] flex flex-col bg-gradient-to-b from-neutral-900/98 to-black/98 backdrop-blur-xl rounded-t-3xl border-t-2 border-white/15 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]"
                : "fixed top-0 right-0 z-[1200] h-full w-[340px] flex flex-col bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl border-l-2 border-white/10 shadow-[-8px_0_40px_rgba(0,0,0,0.5)]"
            }
            style={
              isCompact
                ? {
                    height: isMobile && isLandscape ? "60dvh" : "75dvh",
                    maxHeight: isMobile && isLandscape ? "60dvh" : "75dvh",
                    marginBottom: keyboardOffset,
                  }
                : undefined
            }
          >
            <ChatHeader
              onClose={() => setChatOpen(false)}
              isCompact={isCompact}
            />

            {/* Message list — a polite log so new messages are announced */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              role="log"
              aria-label="Chat messages"
              aria-live="polite"
              aria-atomic="false"
              className="relative flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 py-3 space-y-0.5 overscroll-contain"
            >
              {chatMessages.length === 0 ? (
                <EmptyChat />
              ) : (
                <MessageList
                  messages={chatMessages}
                  localPlayerId={player?.id ?? null}
                />
              )}
            </div>

            {/* Jump-to-latest pill (only when scrolled up) */}
            <AnimatePresence>
              {showJumpToLatest && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  onClick={() => {
                    nearBottomRef.current = true;
                    setShowJumpToLatest(false);
                    scrollToBottom("smooth");
                  }}
                  className="absolute left-1/2 -translate-x-1/2 bottom-[76px] z-10 chip-arcade px-3 py-1.5 flex items-center gap-1.5 text-white bg-gradient-to-b from-blue-500 to-blue-700 text-[10px] font-bold uppercase tracking-wider"
                >
                  <ArrowDown size={12} /> Latest
                </motion.button>
              )}
            </AnimatePresence>

            {/* Composer */}
            <ChatComposer
              draft={draft}
              setDraft={setDraft}
              onSubmit={submit}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              isCompact={isCompact}
              isSpectator={isSpectator}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

const ChatHeader: React.FC<{ onClose: () => void; isCompact: boolean }> = ({
  onClose,
  isCompact,
}) => (
  <div
    className="shrink-0 flex items-center justify-between px-5 pb-3 border-b-2 border-white/10 bg-blue-600/15 safe-top"
    style={{ "--safe-pad-top": "8px" } as React.CSSProperties}
  >
    {/* Mobile grab handle */}
    {isCompact && (
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/25" />
    )}
    <h2 className="font-arcade text-base uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2">
      <MessageCircle size={18} className="text-white" /> Table Chat
    </h2>
    <button
      onClick={onClose}
      className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer"
      aria-label="Close chat"
    >
      <X size={16} />
    </button>
  </div>
);

// ---------------------------------------------------------------------------
const EmptyChat: React.FC = () => (
  <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-3 px-6 select-none">
    <div className="w-14 h-14 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center">
      <MessageCircle size={24} className="text-slate-500" />
    </div>
    <p className="font-arcade text-sm uppercase tracking-wide text-slate-300">
      No messages yet
    </p>
    <p className="font-rounded text-[11px] text-slate-500 leading-relaxed max-w-[220px]">
      Say hello to the table! Messages are shared with everyone in the room in
      real time.
    </p>
  </div>
);

const MessageList: React.FC<{
  messages: ChatMessage[];
  localPlayerId: string | null;
}> = ({ messages, localPlayerId }) => {
  const rows = useMemo(() => {
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const grouped =
        !!prev &&
        prev.senderId === m.senderId &&
        m.timestamp - prev.timestamp < 60_000;
      return { message: m, grouped };
    });
  }, [messages]);

  return (
    <>
      {rows.map(({ message, grouped }) => (
        <MessageRow
          key={message.id}
          message={message}
          grouped={grouped}
          isOwn={message.senderId === localPlayerId}
        />
      ))}
    </>
  );
};

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const MessageRow: React.FC<{
  message: ChatMessage;
  grouped: boolean;
  isOwn: boolean;
}> = ({ message, grouped, isOwn }) => {
  if (isOwn) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex justify-end ${grouped ? "mt-0.5" : "mt-2.5"}`}
      >
        <div className="max-w-[78%] min-w-0">
          <div className="rounded-2xl rounded-tr-sm bg-gradient-to-b from-blue-500 to-blue-700 px-3 py-1.5 shadow-md">
            <p className="font-rounded text-[13px] leading-snug text-white break-words whitespace-pre-wrap">
              {message.text}
            </p>
          </div>
          <div className="text-[9px] text-slate-500 text-right mt-0.5 mr-1">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-end gap-2 ${grouped ? "mt-0.5" : "mt-2.5"}`}
    >
      <div className="w-7 shrink-0 flex justify-center">
        {!grouped && (
          <Avatar name={message.name} size="sm" isHost={message.isHost} />
        )}
      </div>

      <div className="max-w-[78%] min-w-0">
        {!grouped && (
          <div className="flex items-center gap-1.5 mb-0.5 ml-1">
            <span className="font-rounded text-[11px] font-bold text-slate-200 truncate max-w-[130px]">
              {message.name}
            </span>
            {message.isSpectator && (
              <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                <Glasses size={9} /> Spec
              </span>
            )}
            <span className="text-[9px] text-slate-600">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
        <div className="rounded-2xl rounded-tl-sm bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 shadow-sm">
          <p className="font-rounded text-[13px] leading-snug text-slate-100 break-words whitespace-pre-wrap">
            {message.text}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

const ChatComposer: React.FC<{
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isCompact: boolean;
  isSpectator: boolean;
}> = ({
  draft,
  setDraft,
  onSubmit,
  onKeyDown,
  inputRef,
  isCompact,
  isSpectator,
}) => {
  const MAX = 500;
  const remaining = MAX - draft.length;
  return (
    <div
      className="shrink-0 border-t-2 border-white/10 bg-black/40 px-4 pt-2.5 safe-bottom"
      style={{ "--safe-pad-bottom": "16px" } as React.CSSProperties}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0 rounded-2xl bg-slate-900/80 border border-slate-700 focus-within:border-blue-500/70 transition-colors px-3 py-1.5">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            onKeyDown={onKeyDown}
            rows={1}
            enterKeyHint={isCompact ? "enter" : "send"}
            placeholder={isSpectator ? "Chat as spectator…" : "Type a message…"}
            aria-label="Chat message"
            aria-keyshortcuts={isCompact ? undefined : "Enter"}
            className="w-full resize-none bg-transparent outline-none font-rounded text-[13px] text-slate-100 placeholder:text-slate-500 leading-snug max-h-24"
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={!draft.trim()}
          className="chip-arcade w-11 h-11 shrink-0 flex items-center justify-center text-white bg-gradient-to-b from-lime-400 to-green-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </div>
      {remaining <= 80 && (
        <div
          className={`text-right text-[9px] mt-1 pr-1 ${remaining <= 0 ? "text-rose-400" : "text-slate-500"}`}
        >
          {remaining} left
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
