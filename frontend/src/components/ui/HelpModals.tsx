"use client";

import React, { useMemo, useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import {
  Bug,
  Keyboard,
  Info,
  Send,
  Layers,
  BookOpen,
  Sparkles,
  Wrench,
  SlidersHorizontal,
  MousePointerClick,
  ListChecks,
} from "lucide-react";
import { useGameStore } from "../../store/useGameStore";
import {
  Badge,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Notice,
  SectionLabel,
  type BadgeTone,
  type ModalSize,
} from "./kit";
import {
  normalizeHouseRules,
  getActiveRuleExplanations,
  ActiveRuleKind,
} from "../../lib/houseRules";

/**
 * The four reference/utility dialogs — bug report, controls, about, and the
 * how-to-play sheet. They all sit in the shared kit `Modal`, so the scrim,
 * viewport-safe sizing, focus trap, Escape handling and open/close motion are
 * identical to Settings, Friends, the arena picker and the roster. `ModalBase`
 * is now just the small amount of shape they have in common.
 */
interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  size?: ModalSize;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const ModalBase = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = "md",
  footer,
  children,
}: ModalBaseProps) => {
  const titleId = `help-modal-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Modal open={isOpen} onClose={onClose} size={size} labelledBy={titleId}>
      <ModalHeader
        id={titleId}
        title={title}
        subtitle={subtitle}
        icon={<Icon size={18} />}
        onClose={onClose}
        closeLabel={`Close ${title.toLowerCase()}`}
      />
      <ModalBody>{children}</ModalBody>
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </Modal>
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
      }).catch(() => console.error("No real endpoint yet, but simulated success"));

      addToast("Bug report sent successfully!", "success");
      setReport("");
      setIsReportBugOpen(false);
    } catch {
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
      subtitle="Found a glitch? Tell us what happened"
      icon={Bug}
      footer={
        <>
          <span className="flex-1" />
          <Button
            tone="primary"
            onClick={handleSubmit}
            disabled={sending || !report.trim()}
            icon={<Send size={14} aria-hidden="true" />}
          >
            {sending ? "Sending…" : "Submit"}
          </Button>
        </>
      }
    >
      <label
        htmlFor="bug-report-text"
        className="font-rounded text-[11px] font-bold leading-snug text-white/60"
      >
        What went wrong? The more specific the better — what you did, what you expected, and what
        happened instead.
      </label>
      <textarea
        id="bug-report-text"
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="Describe the issue you encountered..."
        className="ui-input h-32 resize-none p-3 text-[12px] leading-snug"
      />
    </ModalBase>
  );
};

const CONTROLS: { keys: string; action: string }[] = [
  { keys: "Drag / Swipe", action: "Rotate the camera" },
  { keys: "Scroll / Pinch", action: "Zoom in and out" },
  { keys: "Click card", action: "Play that card" },
  { keys: "Esc", action: "Close menus" },
];

export const ControlsModal = () => {
  const { isControlsOpen, setIsControlsOpen } = useSettingsStore();

  return (
    <ModalBase
      isOpen={isControlsOpen}
      onClose={() => setIsControlsOpen(false)}
      title="Controls"
      subtitle="Same on mouse and touch"
      icon={Keyboard}
      size="sm"
    >
      <SectionLabel icon={<MousePointerClick size={11} aria-hidden="true" />}>
        At the table
      </SectionLabel>
      <ul className="ui-card overflow-hidden">
        {CONTROLS.map((c, i) => (
          <li
            key={c.keys}
            className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
              i === 0 ? "" : "border-t border-white/[0.07]"
            }`}
          >
            <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-wide text-white/90">
              {c.keys}
            </span>
            <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/60">
              {c.action}
            </span>
          </li>
        ))}
      </ul>
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
      size="sm"
    >
      <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
        <div className="mb-1 grid h-16 w-16 place-items-center rounded-2xl border-2 border-white/15 bg-gradient-to-br from-red-500 to-red-700 shadow-[0_0_30px_rgba(220,38,38,0.4)]">
          <Layers size={30} className="text-white" aria-hidden="true" />
        </div>
        <h3 className="font-arcade arcade-stroke-sm text-lg uppercase tracking-widest text-white">
          Unoverse
        </h3>
        <p className="font-rounded max-w-[38ch] text-[12px] font-bold leading-relaxed text-white/55">
          An immersive 3D real-time multiplayer UNO game. Sit around a virtual table with friends,
          play with a fully server-authoritative rules engine, react with emotes, and talk over
          built-in WebRTC voice chat.
        </p>
        <p className="font-arcade mt-2 text-[10px] tracking-widest text-white/30">v1.0.0-beta</p>
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
// vs. configurable values are visually distinct and easy to scan. Each carries a
// glyph and a word, so the distinction never rests on colour alone.
const KIND_TAG: Record<
  ActiveRuleKind,
  { label: string; tone: BadgeTone; Icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  addon: { label: "Extra", tone: "good", Icon: Sparkles },
  modifier: { label: "Modified", tone: "gold", Icon: Wrench },
  config: { label: "Setting", tone: "info", Icon: SlidersHorizontal },
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
      subtitle={
        activeRules.length === 0
          ? "Standard rules at this table"
          : `${activeRules.length} house rule${activeRules.length === 1 ? "" : "s"} active at this table`
      }
      icon={BookOpen}
    >
      {/* Core / standard rules. One card, divider-separated rows — the old
          version was a loose bullet list, which read as prose rather than as
          six things you can look up. */}
      <section className="flex flex-col gap-1.5">
        <SectionLabel icon={<ListChecks size={11} aria-hidden="true" />}>The basics</SectionLabel>
        <ul className="ui-card overflow-hidden">
          {CORE_RULES.map((r, i) => (
            <li
              key={r.t}
              className={`px-3 py-2 ${i === 0 ? "" : "border-t border-white/[0.07]"}`}
            >
              <p className="font-rounded text-[12px] leading-snug text-white/60">
                <span className="font-bold text-white">{r.t}.</span> {r.d}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Dynamic house rules for THIS lobby */}
      <section className="flex flex-col gap-1.5">
        <SectionLabel
          icon={<Sparkles size={11} aria-hidden="true" />}
          trailing={
            activeRules.length > 0 ? (
              <span className="font-arcade text-[11px] tabular-nums text-yellow-300">
                {activeRules.length}
              </span>
            ) : undefined
          }
        >
          House rules here
        </SectionLabel>

        {activeRules.length === 0 ? (
          <Notice tone="info" icon={<Info size={13} aria-hidden="true" />}>
            Standard rules only — no special house rules are active in this lobby.
          </Notice>
        ) : (
          <>
            <p className="font-rounded px-0.5 text-[10px] font-bold leading-snug text-white/40">
              The host has these active right now. They can only be changed from the lobby.
            </p>
            <ul className="flex flex-col" style={{ gap: "var(--ui-gap-tight)" }}>
              {activeRules.map((rule) => {
                const tag = KIND_TAG[rule.kind];
                return (
                  <li key={rule.key} className="ui-card px-3 py-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-rounded text-[12px] font-bold uppercase tracking-wide text-white">
                        {rule.label}
                      </span>
                      <Badge tone={tag.tone} icon={<tag.Icon size={9} aria-hidden="true" />}>
                        {tag.label}
                      </Badge>
                    </div>
                    <p className="font-rounded text-[12px] leading-snug text-white/55">{rule.text}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
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
