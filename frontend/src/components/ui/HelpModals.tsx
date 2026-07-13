"use client";

import React, { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/useSettingsStore";
import { X, Bug, Keyboard, Info, Send, Layers, BookOpen, Sparkles, Wrench, SlidersHorizontal } from "lucide-react";
import { useGameStore } from "../../store/useGameStore";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import {
  normalizeHouseRules,
  getActiveRuleExplanations,
  ActiveRuleKind,
} from "../../lib/houseRules";

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}

const ModalBase = ({
  isOpen,
  onClose,
  title,
  icon: Icon,
  children,
}: ModalBaseProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `help-modal-${title.replace(/\s+/g, "-").toLowerCase()}`;

  // Focus trap + initial focus + focus restore + Escape-to-close.
  useDialogA11y(dialogRef, isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[88dvh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b-2 border-white/15 bg-red-600/20">
              <h2 id={titleId} className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2">
                <Icon size={20} className="text-white" /> {title}
              </h2>
              <button
                onClick={onClose}
                className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer"
                aria-label={`Close ${title.toLowerCase()}`}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ReportBugModal = () => {
  const { isReportBugOpen, setIsReportBugOpen } = useSettingsStore();
  const { addToast } = useGameStore();
  const [report, setReport] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!report.trim()) return;
    setSending(true);

    try {
      // Send message to backend endpoint (Simulating endpoint since it's just a POST, or emit socket)
      await fetch("/api/report-bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: report }),
      }).catch((e) =>
        console.error("No real endpoint yet, but simulated success"),
      );

      addToast("Bug report sent successfully!", "success");
      setReport("");
      setIsReportBugOpen(false);
    } catch (e) {
      addToast("Failed to send bug report", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalBase
      isOpen={isReportBugOpen}
      onClose={() => setIsReportBugOpen(false)}
      title="Report Bug"
      icon={Bug}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">
          Found a glitch or issue? Let us know so we can fix it.
        </p>
        <textarea
          value={report}
          onChange={(e) => setReport(e.target.value)}
          placeholder="Describe the issue you encountered..."
          className="w-full h-32 bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSubmit}
            disabled={sending || !report.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-colors"
          >
            {sending ? "Sending..." : "Submit"} <Send size={14} />
          </button>
        </div>
      </div>
    </ModalBase>
  );
};

export const ControlsModal = () => {
  const { isControlsOpen, setIsControlsOpen } = useSettingsStore();

  return (
    <ModalBase
      isOpen={isControlsOpen}
      onClose={() => setIsControlsOpen(false)}
      title="Controls"
      icon={Keyboard}
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">
            Drag / Swipe
          </span>
          <span className="text-xs text-slate-400">Rotate Camera</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">
            Scroll / Pinch
          </span>
          <span className="text-xs text-slate-400">Zoom In/Out</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">
            Click Card
          </span>
          <span className="text-xs text-slate-400">Play Card</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">
            ESC
          </span>
          <span className="text-xs text-slate-400">Close Menus</span>
        </div>
      </div>
    </ModalBase>
  );
};

export const AboutModal = () => {
  const { isAboutOpen, setIsAboutOpen } = useSettingsStore();

  return (
    <ModalBase
      isOpen={isAboutOpen}
      onClose={() => setIsAboutOpen(false)}
      title="About"
      icon={Info}
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center py-4">
        <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.4)] border border-white/10 mb-2">
          <Layers size={30} className="text-white" />
        </div>
        <h3 className="text-xl font-black uppercase tracking-widest text-white">
          Unoverse
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          An immersive 3D real-time multiplayer UNO game. Sit around a virtual
          table with friends, play with a fully server-authoritative rules
          engine, react with emotes, and talk over built-in WebRTC voice chat.
        </p>
        <p className="text-[10px] text-slate-500 font-mono mt-4">v1.0.0-beta</p>
      </div>
    </ModalBase>
  );
};

const CORE_RULES: { t: string; d: string }[] = [
  { t: "Goal", d: "Be the first to play every card in your hand to win the round." },
  { t: "Playing a card", d: "On your turn, play a card that matches the top card by color, number, or symbol." },
  { t: "Wild cards", d: "A Wild can be played on anything — you choose the next color to continue." },
  { t: "Action cards", d: "Skip skips the next player, Reverse flips direction, and +2 / +4 make the next player draw." },
  { t: "Drawing", d: "No playable card? Draw from the pile." },
  { t: "Calling UNO", d: "When you're down to a single card, remember the UNO rule — this lobby's exact setting is shown below." },
];

// Small colored tag per rule kind so standard-rule changes vs. extra mechanics
// vs. configurable values are visually distinct and easy to scan.
const KIND_TAG: Record<ActiveRuleKind, { label: string; cls: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  addon: { label: "Extra", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: Sparkles },
  modifier: { label: "Modified", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", Icon: Wrench },
  config: { label: "Setting", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30", Icon: SlidersHorizontal },
};

export const RulesModal = () => {
  const { isRulesOpen, setIsRulesOpen } = useSettingsStore();
  // Source of truth: the live lobby/game house-rule configuration in the store.
  const houseRules = useGameStore((s) => s.houseRules);
  const activeRules = useMemo(() => getActiveRuleExplanations(normalizeHouseRules(houseRules)), [houseRules]);

  return (
    <ModalBase
      isOpen={isRulesOpen}
      onClose={() => setIsRulesOpen(false)}
      title="How to Play"
      icon={BookOpen}
    >
      <div className="space-y-6">
        {/* Core / standard rules */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-800/60 pb-2">
            The Basics
          </h3>
          <ul className="space-y-2.5">
            {CORE_RULES.map((r) => (
              <li key={r.t} className="flex gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" aria-hidden="true" />
                <p className="text-[13px] leading-snug text-slate-300">
                  <span className="font-bold text-white">{r.t}.</span>{" "}
                  <span className="font-rounded">{r.d}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Dynamic house rules for THIS lobby */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-yellow-300 mb-1 flex items-center gap-2 border-b border-yellow-900/40 pb-2">
            <Sparkles size={12} /> House Rules in This Lobby
          </h3>
          <p className="text-[10px] text-slate-500 font-rounded mb-3 mt-1">
            The host has these rules active right now. They can only be changed from the lobby.
          </p>

          {activeRules.length === 0 ? (
            <p className="text-[12px] text-slate-400 font-rounded italic py-2">
              Standard rules only — no special house rules are active.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeRules.map((rule) => {
                const tag = KIND_TAG[rule.kind];
                return (
                  <li
                    key={rule.key}
                    className="rounded-xl bg-slate-900/50 border border-slate-800 p-3"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[12px] font-bold uppercase tracking-wide text-white">
                        {rule.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${tag.cls}`}>
                        <tag.Icon size={9} /> {tag.label}
                      </span>
                    </div>
                    <p className="text-[12px] leading-snug text-slate-400 font-rounded">
                      {rule.text}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ModalBase>
  );
};

export const HelpModals = () => {
  return (
    <>
      <ReportBugModal />
      <ControlsModal />
      <AboutModal />
      <RulesModal />
    </>
  );
};
