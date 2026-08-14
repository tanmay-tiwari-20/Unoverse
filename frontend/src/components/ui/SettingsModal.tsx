"use client";

import React, { useState } from "react";
import {
  Accessibility,
  BookOpen,
  Bug,
  Eye,
  Gamepad2,
  Gauge,
  Headphones,
  Info,
  Keyboard,
  Layers,
  LogOut,
  Mic,
  Monitor,
  MousePointer2,
  Music,
  Settings,
  Sparkles,
  Tag,
  Video,
  Volume2,
  Wand2,
  Zap,
  ChevronRight,
  Smartphone,
} from "lucide-react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useGameStore } from "../../store/useGameStore";
import { useSocket } from "../../hooks/useSocket";
import { useEffectiveQuality } from "../../hooks/useEffectiveQuality";
import { useFullscreen } from "../../hooks/useFullscreen";
import { usePlatformRouter } from "../../hooks/usePlatformRouter";
import { CAPABILITIES } from "../../lib/platform/capabilities";
import { HOME_HREF } from "../../lib/platform/routes";
import {
  Badge,
  Button,
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SectionLabel,
  SegmentedControl,
  Slider,
  Toggle,
} from "./kit";

type SectionId =
  | "audio"
  | "graphics"
  | "performance"
  | "gameplay"
  | "controls"
  | "accessibility"
  | "more";

interface SectionDef {
  id: SectionId;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  /** One line under the section title, so a category explains itself. */
  blurb: string;
}

// Declared at module scope: this list never changes, and rebuilding it per render
// would defeat the memoisation of everything below it.
const SECTIONS: readonly SectionDef[] = [
  {
    id: "audio",
    label: "Audio",
    Icon: Volume2,
    blurb: "Volume levels for the game, music and voice chat.",
  },
  {
    id: "graphics",
    label: "Graphics",
    Icon: Sparkles,
    blurb: "How the table and effects are rendered.",
  },
  {
    id: "performance",
    label: "Performance",
    Icon: Zap,
    blurb: "Trade visual detail for a steadier framerate.",
  },
  {
    id: "gameplay",
    label: "Gameplay",
    Icon: Gamepad2,
    blurb: "Table feedback and on-screen play cues.",
  },
  {
    id: "controls",
    label: "Controls",
    Icon: MousePointer2,
    blurb: "Mouse, keyboard and camera controls.",
  },
  {
    id: "accessibility",
    label: "Access",
    Icon: Accessibility,
    blurb: "Motion, orientation and comfort options.",
  },
  {
    id: "more",
    label: "More",
    Icon: Info,
    blurb: "Rules, controls reference, feedback and about.",
  },
] as const;

const QUALITY_OPTIONS = [
  { value: "low" as const, label: "Low" },
  { value: "medium" as const, label: "Med", srLabel: "Medium" },
  { value: "high" as const, label: "High" },
];

/** A row in the "More" page — a link out of settings, not a setting. */
const LinkRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}> = ({ icon, label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="ui-card ui-card-hover flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left"
  >
    <span className="shrink-0">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="font-rounded block text-[12px] font-bold text-white">
        {label}
      </span>
      <span className="font-rounded block text-[10px] font-bold leading-snug text-white/40">
        {hint}
      </span>
    </span>
    <ChevronRight
      size={15}
      className="shrink-0 text-white/30"
      aria-hidden="true"
    />
  </button>
);

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    setIsReportBugOpen,
    setIsControlsOpen,
    setIsAboutOpen,
    setIsRulesOpen,
    showLastPlayedBy,
    setShowLastPlayedBy,
    masterVolume,
    setMasterVolume,
    gameVolume,
    setGameVolume,
    ambientVolume,
    setAmbientVolume,
    micVolume,
    setMicVolume,
    voiceVolume,
    setVoiceVolume,
    showFPS,
    setShowFPS,
    shadowQuality,
    setShadowQuality,
    vfxQuality,
    setVfxQuality,
    postProcessing,
    setPostProcessing,
    performanceMode,
    setPerformanceMode,
    adaptiveQuality,
    setAdaptiveQuality,
    cardAnimations,
    setCardAnimations,
    cameraMotion,
    setCameraMotion,
    cameraSensitivity,
    setCameraSensitivity,
    reducedMotion,
    setReducedMotion,
    allowPortrait,
    setAllowPortrait,
  } = useSettingsStore();

  // Reported back to the user so "Auto Graphics" isn't a black box.
  const { tier, isAutoDowngraded } = useEffectiveQuality();
  const { isFullscreen, toggleFullscreen, isSupported } = useFullscreen();

  const { leaveRoom } = useSocket();
  const router = usePlatformRouter();
  const inRoom = useGameStore((s) => Boolean(s.room));

  const [section, setSection] = useState<SectionId>("audio");
  const close = () => setIsSettingsOpen(false);

  const handleLeaveLobby = () => {
    close();
    leaveRoom();
    router.push(HOME_HREF);
  };

  const go = (open: (v: boolean) => void) => {
    open(true);
    close();
  };

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <Modal
      open={isSettingsOpen}
      onClose={close}
      size="lg"
      labelledBy="settings-title"
      zIndex={1000}
    >
      <ModalHeader
        id="settings-title"
        title="Settings"
        subtitle={active.blurb}
        icon={<Settings size={16} aria-hidden="true" />}
        onClose={close}
        closeLabel="Close settings"
      />

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav
          aria-label="Settings categories"
          className="custom-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b-2 border-white/10 px-2 py-2 sm:w-[8.5rem] sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-b-0 sm:border-r-2 short:py-1.5"
        >
          {SECTIONS.map(({ id, label, Icon }) => {
            const selected = id === section;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={selected ? "page" : undefined}
                className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border-2 px-2.5 py-1.5 transition-colors sm:w-full ${
                  selected
                    ? "border-yellow-300/60 bg-gradient-to-b from-yellow-400/25 to-amber-600/20 text-yellow-200"
                    : "border-transparent text-white/50 hover:bg-white/5 hover:text-white/85"
                }`}
                style={{ minHeight: "calc(var(--ui-tap) - 6px)" }}
              >
                <Icon size={14} className="shrink-0" aria-hidden="true" />
                <span className="font-rounded whitespace-nowrap text-[11px] font-bold uppercase tracking-wide">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Only the chosen section is mounted: the modal stays short on a phone,
            and none of the other sliders exist to be re-rendered. Keyed so the
            short fade replays on every switch. */}
        <ModalBody key={section} className="ui-body-tight ui-tab-in">
          {section === "audio" && (
            <>
              <SectionLabel icon={<Volume2 size={11} />}>Levels</SectionLabel>
              <Slider
                label="Master Volume"
                icon={<Volume2 size={12} />}
                value={masterVolume}
                onChange={setMasterVolume}
                valueText={`${masterVolume}%`}
                accent="#38bdf8"
              />
              <Slider
                label="Game Sounds"
                icon={<Gamepad2 size={12} />}
                value={gameVolume}
                onChange={setGameVolume}
                valueText={`${gameVolume}%`}
                accent="#a3e635"
              />
              <Slider
                label="Ambience & Music"
                icon={<Music size={12} />}
                value={ambientVolume}
                onChange={setAmbientVolume}
                valueText={`${ambientVolume}%`}
                accent="#34d399"
              />

              <SectionLabel icon={<Headphones size={11} />}>
                Voice chat
              </SectionLabel>
              <Slider
                label="Microphone Level"
                icon={<Mic size={12} />}
                value={micVolume}
                onChange={setMicVolume}
                valueText={`${micVolume}%`}
                accent="#fb7185"
              />
              <Slider
                label="Incoming Voice"
                icon={<Headphones size={12} />}
                value={voiceVolume}
                onChange={setVoiceVolume}
                valueText={`${voiceVolume}%`}
                accent="#34d399"
              />
            </>
          )}

          {section === "graphics" && (
            <>
              <SectionLabel icon={<Sparkles size={11} />}>Detail</SectionLabel>
              <Field
                layout="stack"
                label="Shadow Quality"
                icon={<Eye size={12} />}
                hint={<Badge tone="neutral">{shadowQuality}</Badge>}
              >
                <SegmentedControl
                  label="Shadow quality"
                  value={shadowQuality}
                  onChange={setShadowQuality}
                  options={QUALITY_OPTIONS}
                />
              </Field>
              <Field
                layout="stack"
                label="Visual Effects"
                icon={<Wand2 size={12} />}
                hint={<Badge tone="neutral">{vfxQuality}</Badge>}
              >
                <SegmentedControl
                  label="Visual effects quality"
                  value={vfxQuality}
                  onChange={setVfxQuality}
                  options={QUALITY_OPTIONS}
                />
              </Field>
              <Field
                label="Post Processing"
                icon={<Sparkles size={12} />}
                hint="Bloom and colour grading over the finished frame."
              >
                <Toggle
                  label="Post processing"
                  checked={postProcessing}
                  onChange={setPostProcessing}
                />
              </Field>
              {/* Hidden where the host platform owns fullscreen (see the HUD
                  button for the same gate). Nothing is removed — `useFullscreen`
                  is untouched and still works on web. */}
              {CAPABILITIES.customFullscreen && (
                <Field
                  label="Fullscreen Mode"
                  icon={<Monitor size={12} />}
                  hint={
                    !isSupported
                      ? "Not supported on this browser or iframe environment."
                      : isFullscreen
                        ? "Currently active."
                        : "Expand to fill the entire screen."
                  }
                >
                  <Toggle
                    label="Fullscreen mode"
                    checked={isFullscreen}
                    onChange={toggleFullscreen}
                    disabled={!isSupported}
                  />
                </Field>
              )}

              {isAutoDowngraded && (
                <p
                  className="font-rounded rounded-xl border-2 border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-[10px] font-bold leading-snug text-amber-200"
                  role="status"
                >
                  Auto Graphics is currently holding quality at{" "}
                  <span className="uppercase">{tier}</span> to keep the game
                  smooth on this device. Turn it off under Performance to use
                  these settings exactly.
                </p>
              )}
            </>
          )}

          {section === "performance" && (
            <>
              <SectionLabel icon={<Gauge size={11} />}>Automatic</SectionLabel>
              <Field
                label="Auto Graphics"
                icon={<Gauge size={12} />}
                hint="Lowers quality by itself when the framerate drops, and restores it when it recovers."
              >
                <Toggle
                  label="Auto graphics"
                  checked={adaptiveQuality}
                  onChange={setAdaptiveQuality}
                />
              </Field>
              {isAutoDowngraded && (
                <p
                  className="font-rounded -mt-1 px-1 text-[10px] font-bold leading-snug text-white/45"
                  role="status"
                >
                  Currently running at{" "}
                  <span className="text-amber-300 uppercase">{tier}</span>.
                </p>
              )}

              <SectionLabel icon={<Zap size={11} />}>Manual</SectionLabel>
              <Field
                label="Performance Mode"
                icon={<Zap size={12} />}
                hint="Drops the most expensive effects for the highest framerate."
              >
                <Toggle
                  label="Performance mode"
                  checked={performanceMode}
                  onChange={setPerformanceMode}
                />
              </Field>
              <Field
                label="Show FPS Counter"
                icon={<Monitor size={12} />}
                hint="A small live framerate readout on the table."
              >
                <Toggle
                  label="Show FPS counter"
                  checked={showFPS}
                  onChange={setShowFPS}
                />
              </Field>
            </>
          )}

          {section === "gameplay" && (
            <>
              <SectionLabel icon={<Gamepad2 size={11} />}>
                Table feedback
              </SectionLabel>
              <Field
                label="Card Animations"
                icon={<Layers size={12} />}
                hint="Cards fly between hands and the pile instead of snapping."
              >
                <Toggle
                  label="Card animations"
                  checked={cardAnimations}
                  onChange={setCardAnimations}
                />
              </Field>
              <Field
                label="Camera Motion"
                icon={<Video size={12} />}
                hint="The camera drifts and reacts to big plays."
              >
                <Toggle
                  label="Camera motion"
                  checked={cameraMotion}
                  onChange={setCameraMotion}
                />
              </Field>
              <Field
                label="Show Last Played By"
                icon={<Tag size={12} />}
                hint="Names whoever played the card on top of the pile."
              >
                <Toggle
                  label="Show last played by"
                  checked={showLastPlayedBy}
                  onChange={setShowLastPlayedBy}
                />
              </Field>
            </>
          )}

          {section === "controls" && (
            <>
              <SectionLabel icon={<MousePointer2 size={11} />}>
                Mouse
              </SectionLabel>
              <div className="ui-card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-wide text-white/90">
                    Click Card
                  </span>
                  <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/65">
                    Select or play card
                  </span>
                </div>
              </div>

              <SectionLabel icon={<Keyboard size={11} />}>
                Keyboard
              </SectionLabel>
              <div className="ui-card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/[0.07]">
                  <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/90">
                    1 – 7
                  </span>
                  <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/65">
                    Select cards
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/[0.07]">
                  <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/90">
                    ← / →
                  </span>
                  <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/65">
                    Navigate cards
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/[0.07]">
                  <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/90">
                    Space
                  </span>
                  <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/65">
                    Play selected card
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/[0.07]">
                  <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/90">
                    Enter
                  </span>
                  <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/65">
                    Play / confirm card
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="font-arcade shrink-0 rounded-lg border-2 border-white/15 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/90">
                    Esc
                  </span>
                  <span className="font-rounded min-w-0 text-right text-[11px] font-bold text-white/65">
                    Close / cancel
                  </span>
                </div>
              </div>

              <SectionLabel icon={<MousePointer2 size={11} />}>
                Camera
              </SectionLabel>
              <Slider
                label="Camera Sensitivity"
                icon={<MousePointer2 size={12} />}
                value={cameraSensitivity}
                onChange={setCameraSensitivity}
                valueText={`${cameraSensitivity}%`}
                accent="#fbbf24"
              />
              <p className="font-rounded px-1 text-[10px] font-bold leading-snug text-white/40">
                How far the view turns for a given drag. Lower is steadier on a
                touchscreen.
              </p>
            </>
          )}

          {section === "accessibility" && (
            <>
              <SectionLabel icon={<Accessibility size={11} />}>
                Comfort
              </SectionLabel>
              <Field
                label="Reduce Motion"
                icon={<Accessibility size={12} />}
                hint="Stops non-essential animation across the whole interface."
              >
                <Toggle
                  label="Reduce motion"
                  checked={reducedMotion}
                  onChange={setReducedMotion}
                />
              </Field>
              <Field
                label="Allow Portrait Play"
                icon={<Smartphone size={12} />}
                hint="Skips the rotate-your-device prompt and plays upright."
              >
                <Toggle
                  label="Allow portrait play"
                  checked={allowPortrait}
                  onChange={setAllowPortrait}
                />
              </Field>
              <p className="font-rounded px-1 text-[10px] font-bold leading-snug text-white/40">
                Your device&apos;s own &quot;reduce motion&quot; setting is
                respected automatically — this switch is for turning it on just
                for Unoverse.
              </p>
            </>
          )}

          {section === "more" && (
            <>
              <SectionLabel icon={<Info size={11} />}>Help</SectionLabel>
              <LinkRow
                icon={<BookOpen size={16} className="text-yellow-300" />}
                label="Rules & How to Play"
                hint="Card effects, penalties and house rules."
                onClick={() => go(setIsRulesOpen)}
              />
              <LinkRow
                icon={<Keyboard size={16} className="text-sky-300" />}
                label="Controls"
                hint="Keys, clicks and touch gestures."
                onClick={() => go(setIsControlsOpen)}
              />

              <SectionLabel icon={<Info size={11} />}>About</SectionLabel>
              <LinkRow
                icon={<Bug size={16} className="text-rose-300" />}
                label="Report a Bug"
                hint="Tell us what went wrong."
                onClick={() => go(setIsReportBugOpen)}
              />
              <LinkRow
                icon={<Info size={16} className="text-emerald-300" />}
                label="About Unoverse"
                hint="Version and credits."
                onClick={() => go(setIsAboutOpen)}
              />
            </>
          )}
        </ModalBody>
      </div>

      <ModalFooter>
        {/* Leaving is destructive and lives apart from every other control, so
            it can't be hit while reaching for Done. */}
        {inRoom && (
          <Button
            tone="danger"
            size="sm"
            onClick={handleLeaveLobby}
            icon={<LogOut size={13} />}
          >
            Leave Room
          </Button>
        )}
        <Button tone="primary" size="sm" onClick={close} className="ml-auto">
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default SettingsModal;
