"use client";
import React, { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, KeyRound, Pencil, Plus, Zap } from "lucide-react";

export type PlayMode = "join" | "create";

export interface PlayConsoleProps {
  displayName: string;
  onNameChange: (next: string) => void;
  roomCode: string;
  onRoomCodeChange: (next: string) => void;
  mode: PlayMode;
  onModeChange: (next: PlayMode) => void;
  loading: boolean;
  error: string | null;
  onQuickPlay: () => void;
  onJoin: () => void;
  onCreate: () => void;
  /** True once the profile store has read localStorage and found a profile. */
  hasProfile: boolean;
}

/** The server caps display names at 12 characters. */
const MAX_NAME = 12;
const CODE_LENGTH = 6;

export const PlayConsole: React.FC<PlayConsoleProps> = ({
  displayName,
  onNameChange,
  roomCode,
  onRoomCodeChange,
  mode,
  onModeChange,
  loading,
  error,
  onQuickPlay,
  onJoin,
  onCreate,
  hasProfile,
}) => {
  const nameId = useId();
  const codeId = useId();

  // Enter anywhere in the console runs whatever the current mode's action is —
  // the same key does the obvious thing whether you are joining or hosting.
  const submitCurrentMode = () => {
    if (loading) return;
    if (mode === "join") onJoin();
    else onCreate();
  };

  return (
    <div className="home-card w-full ">
      <div
        className="arcade-dots pointer-events-none absolute inset-0 rounded-[inherit]"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-3 p-4 short:gap-2 short:p-3 sm:p-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={nameId}
            className="font-rounded flex items-center gap-1.5 px-0.5 text-[10px] font-bold tracking-[0.14em] text-white/45"
          >
            {hasProfile ? <Pencil size={10} aria-hidden="true" /> : null}
            {hasProfile ? "Playing as" : "Your name"}
          </label>
          <input
            id={nameId}
            type="text"
            maxLength={MAX_NAME}
            value={displayName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCurrentMode()}
            placeholder="Your Name"
            aria-label="Your display name"
            disabled={loading}
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
            className="ui-input px-3 py-2.5 text-center text-[15px] tracking-wide short:py-2 short:text-[13px]"
          />
        </div>

        {/* ── The one loud action ───────────────────────────────────────── */}
        <button
          type="button"
          onClick={onQuickPlay}
          disabled={loading}
          className="btn-arcade cta-hero font-arcade inline-flex w-full cursor-pointer items-center justify-center gap-2.5 bg-gradient-to-b from-yellow-400 to-amber-600 py-4 text-lg tracking-wide text-[#1a1033] disabled:cursor-not-allowed short:py-2.5 short:text-sm sm:text-xl"
        >
          <Zap
            size={20}
            className="shrink-0 fill-[#1a1033]"
            aria-hidden="true"
          />
          {loading ? "Finding table…" : "Play Now"}
        </button>
        <p className="font-rounded -mt-1.5 text-center text-[10px] font-bold text-white/40 short:hidden">
          Drops you straight into the best open table
        </p>

        <span className="ui-divider" aria-hidden="true" />

        {/* ── Secondary: join a code, or host your own ──────────────────── */}
        <div role="radiogroup" aria-label="How to play" className="ui-segment">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "join"}
            onClick={() => onModeChange("join")}
            className="ui-segment-item inline-flex items-center justify-center gap-1.5"
            style={{ minHeight: "calc(var(--ui-tap) - 8px)" }}
          >
            <KeyRound size={12} aria-hidden="true" /> Join Room
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "create"}
            onClick={() => onModeChange("create")}
            className="ui-segment-item inline-flex items-center justify-center gap-1.5"
            style={{ minHeight: "calc(var(--ui-tap) - 8px)" }}
          >
            <Plus size={12} aria-hidden="true" /> Host Room
          </button>
        </div>

        {/* Only the selected mode's controls are mounted, so the console never
            shows a field that does nothing. Height is animated rather than the
            whole block so the CTA above it never jumps. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="flex flex-col gap-2"
          >
            {mode === "join" ? (
              <>
                <label htmlFor={codeId} className="sr-only">
                  Room code
                </label>
                <input
                  id={codeId}
                  type="text"
                  inputMode="text"
                  maxLength={CODE_LENGTH}
                  value={roomCode}
                  onChange={(e) =>
                    onRoomCodeChange(e.target.value.toUpperCase())
                  }
                  onKeyDown={(e) => e.key === "Enter" && submitCurrentMode()}
                  placeholder="ROOM CODE"
                  aria-label="Room code to join"
                  disabled={loading}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  className="ui-code font-arcade w-full px-3 py-2.5 text-center text-lg uppercase tracking-[0.32em] text-white placeholder:tracking-[0.2em] placeholder:text-white/30 focus:outline-none short:py-2 short:text-base"
                />
                <button
                  type="button"
                  onClick={onJoin}
                  disabled={loading}
                  className="btn-arcade font-arcade w-full cursor-pointer bg-gradient-to-b from-sky-400 to-blue-600 py-2.5 text-xs uppercase text-white disabled:cursor-not-allowed short:py-2"
                >
                  Join Room
                </button>
              </>
            ) : (
              <>
                <p className="font-rounded px-1 text-center text-[10px] font-bold leading-snug text-white/40 short:hidden">
                  Pick a world, get a code, and invite whoever you want.
                </p>
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={loading}
                  className="btn-arcade font-arcade w-full cursor-pointer bg-gradient-to-b from-lime-400 to-green-600 py-2.5 text-xs uppercase text-white disabled:cursor-not-allowed short:py-2"
                >
                  Create Room
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Errors sit at the bottom, next to the buttons that cause them. */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              role="alert"
            >
              <div className="font-rounded flex items-center gap-2 rounded-xl border-2 border-rose-400/50 bg-rose-500/20 px-2.5 py-2 text-[11px] font-bold text-rose-100">
                <AlertCircle
                  size={14}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0">{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PlayConsole;
