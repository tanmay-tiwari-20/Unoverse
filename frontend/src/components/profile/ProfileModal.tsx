"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowLeft, CalendarDays, Clock, Flame, Hand, History, Layers,
  Pencil, RotateCcw, Save, ShieldCheck, ShieldX, Shirt, Smile, Swords,
  TriangleAlert, Trophy, User, Users, Zap,
} from "lucide-react";
import { useProfileStore } from "../../store/useProfileStore";
import { useGameStore } from "../../store/useGameStore";
import { useNow } from "../../hooks/useNow";
import { PresetAvatar } from "./PresetAvatar";
import { AvatarPicker } from "./AvatarPicker";
import { OutfitPicker } from "./OutfitPicker";
import { PlayerIdTag } from "../social/PlayerIdTag";
import { PresenceDot, presenceLabel, presenceTextClass } from "../social/PresenceDot";
import { DEFAULT_OUTFIT_KEY, getOutfit } from "../../lib/cosmetics/outfits";
import {
  Badge, Button, EmptyState, Modal, ModalBody, ModalFooter, ModalHeader,
  SectionLabel, StatTile, TabBar,
} from "../ui/kit";
import type { ProfileStats } from "../../types/profile";
import {
  formatWinRate, formatPlayTime, formatDuration, formatDate,
  formatRelative, formatPlacement, formatAvgPlacement,
} from "../../lib/profile/format";

/**
 * The 3D stage, loaded on demand and never server-rendered (it mounts a WebGL
 * canvas). The placeholder fills the wrapper's height, so the panel does not
 * reflow when the three.js chunk lands.
 */
const PreviewStage = dynamic(() => import("../home/PreviewStage"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-rounded text-[10px] font-bold uppercase tracking-wide text-white/35">
        Loading outfit…
      </span>
    </div>
  ),
});

type Tab = "overview" | "cards" | "history";

/** Module scope: rebuilding this per render would defeat TabBar's memo-ability. */
const TABS = [
  { value: "overview" as const, label: "Overview", icon: <Trophy size={12} aria-hidden="true" /> },
  { value: "cards" as const, label: "Cards", icon: <Hand size={12} aria-hidden="true" /> },
  { value: "history" as const, label: "History", icon: <History size={12} aria-hidden="true" /> },
];

/** The server caps display names at 12 characters. */
const MAX_NAME = 12;

export function ProfileModal() {
  const isOpen = useProfileStore((s) => s.isProfileOpen);
  const setIsProfileOpen = useProfileStore((s) => s.setIsProfileOpen);
  const profileId = useProfileStore((s) => s.profileId);
  const cached = useProfileStore((s) => s.cachedProfile);
  const cachedName = useProfileStore((s) => s.displayName);
  const cachedAvatar = useProfileStore((s) => s.avatar);
  const cachedOutfit = useProfileStore((s) => s.outfit);
  const loading = useProfileStore((s) => s.loading);
  const storeError = useProfileStore((s) => s.error);
  const refreshProfile = useProfileStore((s) => s.refreshProfile);
  const renameProfile = useProfileStore((s) => s.renameProfile);
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const setOutfit = useProfileStore((s) => s.setOutfit);
  const resetProfile = useProfileStore((s) => s.resetProfile);
  const clearError = useProfileStore((s) => s.clearError);

  // The one honest "am I online" signal the client actually holds: whether our
  // own socket is connected. Anything richer (in a lobby, playing) is the
  // server's to report about OTHER players, and it is not claimed here.
  const connected = useGameStore((s) => s.connectionStatus === "connected");

  const close = () => setIsProfileOpen(false);

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmReset, setConfirmReset] = useState(false);

  // Edit-mode draft state.
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [draftOutfit, setDraftOutfit] = useState("");

  // Re-fetch fresh stats whenever the modal opens (never trust local totals).
  // Talking to the store is external-system work, which is what an effect is for.
  useEffect(() => {
    if (!isOpen || !profileId) return;
    refreshProfile();
    clearError();
  }, [isOpen, profileId, refreshProfile, clearError]);

  // Resetting the transient view when the modal opens is NOT external work — it
  // is state derived from `isOpen`. React's "adjust state when a prop changes"
  // pattern re-renders before paint, where the old effect-based version
  // committed once with stale state and then cascaded a second render.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setMode("view");
      setTab("overview");
      setConfirmReset(false);
    }
  }

  // Minute-grained clock for "last played" / match ages. Only ticks while open.
  const now = useNow(60_000, isOpen);

  // Prefer the server view; fall back to cached identity for first paint.
  const displayName = cached?.displayName ?? cachedName ?? "Player";
  const avatarKey = cached?.avatarUrl ?? cachedAvatar ?? null;
  const outfitKey = cached?.outfit ?? cachedOutfit ?? DEFAULT_OUTFIT_KEY;
  const stats: ProfileStats | null = cached?.stats ?? null;

  // Entering edit mode seeds the draft from the freshest known values. Doing it
  // in the handler rather than an effect watching `mode` means the drafts are
  // already correct on the first edit-mode render — no flash of empty input.
  const enterEdit = () => {
    setDraftName(cached?.displayName ?? cachedName ?? "");
    setDraftAvatar(cached?.avatarUrl ?? cachedAvatar ?? "");
    setDraftOutfit(cached?.outfit ?? cachedOutfit ?? DEFAULT_OUTFIT_KEY);
    setConfirmReset(false);
    setMode("edit");
  };

  const leaveEdit = () => {
    setConfirmReset(false);
    setMode("view");
  };

  // While editing, the hero previews the DRAFT — pick an outfit and the
  // mannequin wears it immediately, without a second canvas or a remount.
  const shownAvatar = mode === "edit" ? draftAvatar || avatarKey : avatarKey;
  const shownOutfit = mode === "edit" ? draftOutfit || outfitKey : outfitKey;
  const outfit = getOutfit(shownOutfit);

  const status = connected ? "online" : "offline";
  const matchesLost = stats ? Math.max(0, stats.matchesPlayed - stats.matchesWon) : 0;
  const firstLoad = !cached && loading;
  // Clamped for the hero meter's width. The server's rate is already 0–1, but a
  // bar is one of the few places a bad value would be visible as a broken UI
  // rather than a wrong number.
  const winPct = Math.round(Math.min(1, Math.max(0, cached?.winRate ?? 0)) * 100);

  const handleSaveEdit = async () => {
    const trimmed = draftName.trim();
    const nameChanged = trimmed && trimmed !== displayName;
    const avatarChanged = draftAvatar && draftAvatar !== avatarKey;
    const outfitChanged = draftOutfit && draftOutfit !== outfitKey;
    if (nameChanged) await renameProfile(trimmed);
    if (avatarChanged) await setAvatar(draftAvatar);
    if (outfitChanged) await setOutfit(draftOutfit);
    if (!useProfileStore.getState().error) leaveEdit();
  };

  const handleReset = async () => {
    await resetProfile();
    if (!useProfileStore.getState().error) setConfirmReset(false);
  };

  return (
    <Modal
      open={isOpen}
      onClose={close}
      size="md"
      labelledBy="profile-modal-title"
      zIndex={2000}
      className="profile-panel"
    >
      <ModalHeader
        id="profile-modal-title"
        title={mode === "edit" ? "Edit Profile" : "Player Profile"}
        icon={mode === "edit" ? <Pencil size={16} aria-hidden="true" /> : <User size={16} aria-hidden="true" />}
        onClose={close}
        closeLabel="Close profile"
      />

      {/* Navigation Tab Bar — Pinned right under header, ultra-compact */}
      {mode === "view" && (
        <div className="shrink-0 border-b border-white/10 px-2 py-1 bg-black/40">
          <TabBar value={tab} onChange={setTab} items={TABS} label="Profile sections" />
        </div>
      )}

      {/* Errors surface inline, above the content they belong to. */}
      <AnimatePresence>
        {storeError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 overflow-hidden px-3 pt-2"
            role="alert"
          >
            <div className="font-rounded flex items-center gap-2 rounded-xl border-2 border-rose-400/50 bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-100">
              <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0">{storeError}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyed so a tab (or mode) change replays the short fade, and so only the
          visible section is ever mounted. */}
      <ModalBody
        key={mode === "edit" ? "edit" : tab}
        id={mode === "edit" ? undefined : `tabpanel-${tab}`}
        className="ui-body-tight ui-tab-in"
      >
        {/* ── Hero Card ──────────────────────────────────────────────────
            Placed inside ModalBody so it scrolls naturally with the stats,
            preventing the top fixed header from swallowing mobile vertical space. */}
        {mode === "view" && (
          <div className="relative shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-black/50 p-2 sm:p-3 mb-1">
            {/* Ambient background glow matching outfit palette */}
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${outfit.gradient} opacity-25`} aria-hidden="true" />
            <div className="arcade-dots pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
            <div className="profile-hero-scrim pointer-events-none absolute inset-0" aria-hidden="true" />

            <div className="relative z-10 flex items-stretch gap-2 sm:gap-3">
              {/* 3D Mannequin Studio Pod */}
              <div className={`relative shrink-0 overflow-hidden rounded-xl border-2 border-white/20 bg-gradient-to-b ${outfit.gradient} shadow-[0_4px_12px_rgba(0,0,0,0.5)] w-24 sm:w-36 h-28 sm:h-32 short:w-20 short:h-24`}>
                <PreviewStage
                  outfitKey={shownOutfit}
                  name={displayName}
                  className="relative h-full w-full cursor-grab active:cursor-grabbing"
                />

                {/* Streak badge */}
                {(stats?.currentStreak ?? 0) > 0 && (
                  <span className="home-chip font-arcade pointer-events-none absolute right-1 top-1 text-[9px] sm:text-[10px] tabular-nums text-orange-300 bg-black/80 backdrop-blur-md border-orange-500/40 px-1 py-0.5">
                    <Flame size={9} className="shrink-0 text-orange-400 animate-pulse" aria-hidden="true" />
                    {stats?.currentStreak}
                  </span>
                )}
              </div>

              {/* Identity & Win Rate Info */}
              <div className="profile-identity flex min-w-0 flex-1 flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-2 sm:p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="relative shrink-0">
                    <PresetAvatar avatarKey={shownAvatar} size={36} />
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <PresenceDot status={status} size={12} halo={connected} />
                    </span>
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1 flex-wrap">
                      <span className="font-arcade arcade-stroke-sm truncate text-[clamp(0.9rem,0.8rem+0.6vw,1.2rem)] leading-tight text-white drop-shadow">
                        {displayName}
                      </span>
                      <PlayerIdTag id={profileId} copyable size="text-[10px]" />
                    </div>
                    {/* Status indicator */}
                    <span className={`font-rounded block truncate text-[10px] font-bold ${presenceTextClass(status)}`}>
                      {presenceLabel(status)}
                      {cached && (
                        <span className="text-white/40 font-medium">
                          {" · "}
                          {formatRelative(cached.lastSeenAt, now)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Win rate bar & stats readout */}
                <div className="mt-1 pt-1 border-t border-white/8">
                  <div className="flex items-baseline justify-between gap-1.5">
                    <span className="font-rounded text-[9px] font-bold uppercase tracking-wider text-white/50">
                      Win Rate
                    </span>
                    <span className="font-arcade text-[10px] sm:text-[11px] tabular-nums text-yellow-300">
                      {formatWinRate(cached?.winRate ?? 0)}
                      <span className="font-rounded ml-1 text-[8px] sm:text-[9px] font-bold text-white/40">
                        ({stats?.matchesWon ?? 0}/{stats?.matchesPlayed ?? 0} W)
                      </span>
                    </span>
                  </div>
                  <div
                    className="profile-meter mt-0.5"
                    role="meter"
                    aria-label="Win rate"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={winPct}
                    aria-valuetext={`${formatWinRate(cached?.winRate ?? 0)} — ${stats?.matchesWon ?? 0} of ${stats?.matchesPlayed ?? 0} games won`}
                  >
                    <span className="profile-meter-fill" style={{ width: `${winPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {mode === "edit" ? (
          <EditForm
            draftName={draftName}
            setDraftName={setDraftName}
            draftAvatar={draftAvatar || avatarKey || ""}
            setDraftAvatar={setDraftAvatar}
            draftOutfit={draftOutfit || outfitKey}
            setDraftOutfit={setDraftOutfit}
            loading={loading}
            confirmReset={confirmReset}
            setConfirmReset={setConfirmReset}
            onReset={handleReset}
          />
        ) : firstLoad ? (
          <StatsSkeleton />
        ) : tab === "overview" ? (
          <>
            {/* No Win Rate tile: the hero meter above already leads with it, and
                the same number twice on one screen reads as two numbers. */}
            <SectionLabel icon={<Trophy size={11} />}>Record</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              <StatTile label="Played" value={stats?.matchesPlayed ?? 0} icon={<Layers size={10} />} />
              <StatTile label="Won" value={stats?.matchesWon ?? 0} tone="good" icon={<Trophy size={10} />} />
              <StatTile label="Lost" value={matchesLost} tone="bad" icon={<Swords size={10} />} />
            </div>

            <SectionLabel icon={<Flame size={11} />}>Streaks &amp; Scoring</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <StatTile label="Streak" value={stats?.currentStreak ?? 0} tone="gold" icon={<Flame size={10} />} />
              <StatTile label="Best" value={stats?.bestStreak ?? 0} tone="gold" icon={<Flame size={10} />} />
              <StatTile label="Points" value={stats?.pointsScored ?? 0} icon={<Zap size={10} />} />
              <StatTile
                label="Avg Place"
                value={stats ? formatAvgPlacement(stats.placementSum, stats.placementCount) : "—"}
              />
            </div>

            <SectionLabel icon={<ShieldCheck size={11} />}>Calls &amp; Challenges</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <StatTile label="UNO!" value={stats?.unoCalls ?? 0} tone="gold" />
              <StatTile label="Last Card" value={stats?.lastCardCalls ?? 0} />
              <StatTile label="Won" value={stats?.challengesWon ?? 0} tone="good" icon={<ShieldCheck size={10} />} />
              <StatTile label="Lost" value={stats?.challengesLost ?? 0} tone="bad" icon={<ShieldX size={10} />} />
            </div>

            {/* Account facts, not scores. A date in a big number tile reads as
                a stat you should be proud of; these are just facts, so they get
                a quiet label→value list instead. */}
            <SectionLabel icon={<User size={11} />}>Profile</SectionLabel>
            <div className="ui-card divide-y divide-white/8 px-2.5">
              <MetaRow
                icon={<CalendarDays size={12} aria-hidden="true" />}
                label="Joined"
                value={cached ? formatDate(cached.createdAt) : "—"}
              />
              <MetaRow
                icon={<Clock size={12} aria-hidden="true" />}
                label="Time at the table"
                value={cached ? formatPlayTime(cached.totalPlayTimeMs) : "—"}
              />
              <MetaRow
                icon={<Users size={12} aria-hidden="true" />}
                label="Friends"
                value={String(cached?.friendCount ?? 0)}
              />
            </div>
          </>
        ) : tab === "cards" ? (
          <>
            <SectionLabel icon={<Hand size={11} />}>Volume</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <StatTile label="Played" value={stats?.cardsPlayed ?? 0} />
              <StatTile label="Drawn" value={stats?.cardsDrawn ?? 0} />
              <StatTile label="Jump-In" value={stats?.jumpIns ?? 0} tone="info" />
              <StatTile label="Rounds" value={stats?.roundsPlayed ?? 0} />
            </div>

            <SectionLabel icon={<Zap size={11} />}>Action cards</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <StatTile label="Reverse" value={stats?.reverseCardsPlayed ?? 0} />
              <StatTile label="Skip" value={stats?.skipCardsPlayed ?? 0} />
              <StatTile label="Draw 2" value={stats?.drawCardsPlayed ?? 0} />
              <StatTile label="Wild" value={stats?.wildsPlayed ?? 0} tone="info" />
            </div>

            <SectionLabel icon={<ShieldX size={11} />}>Costly ones</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <StatTile label="Wild +4" value={stats?.wildDrawFourPlayed ?? 0} tone="bad" />
              <StatTile label="UNO Slips" value={stats?.unoPenalties ?? 0} tone="bad" />
              <StatTile label="Rounds Won" value={stats?.roundsWon ?? 0} tone="good" />
              <StatTile
                label="Closest Loss"
                value={stats?.closestLoss != null ? stats.closestLoss : "—"}
                sub="cards left"
              />
            </div>
          </>
        ) : cached && cached.recentMatches.length > 0 ? (
          <>
            <SectionLabel icon={<History size={11} />} trailing={<Badge>{cached.recentMatches.length}</Badge>}>
              Recent rounds
            </SectionLabel>
            {cached.recentMatches.map((m, i) => {
              const won = m.placement === 1;
              return (
                <div
                  key={`${m.date}-${i}`}
                  className={`ui-card flex items-center gap-2.5 px-2.5 py-2 ${won ? "ui-card-lead" : ""}`}
                >
                  <span
                    className={`font-arcade grid h-8 w-8 shrink-0 place-items-center rounded-xl border-2 text-[11px] ${
                      won
                        ? "border-yellow-300/70 bg-yellow-400/20 text-yellow-200"
                        : "border-white/20 bg-white/5 text-white/65"
                    }`}
                  >
                    {formatPlacement(m.placement)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-rounded flex items-center gap-1.5 truncate text-[12px] font-bold text-white">
                      {won ? (
                        <Trophy size={12} className="shrink-0 text-yellow-300" aria-hidden="true" />
                      ) : (
                        <Swords size={12} className="shrink-0 text-white/35" aria-hidden="true" />
                      )}
                      <span className="truncate">{won ? "Victory" : `Winner: ${m.winnerName}`}</span>
                    </span>
                    <span className="font-rounded mt-px block truncate text-[10px] font-bold text-white/40">
                      {m.players.length}p · {formatDuration(m.durationMs)} · {m.settings.houseRulesSummary}
                    </span>
                  </span>
                  <span className="font-rounded shrink-0 text-[10px] font-bold text-white/35">
                    {formatRelative(m.date, now)}
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <EmptyState
            icon={<History size={26} aria-hidden="true" />}
            title="No rounds yet"
            hint="Finish a round and it lands here, with your placement and who won."
          />
        )}
      </ModalBody>

      {/* The footer carries exactly one loud action per mode, on the right,
          with the way back on the left — the same shape in both modes, so the
          button under your thumb never changes meaning between them. */}
      <ModalFooter>
        {mode === "edit" ? (
          <>
            <Button
              tone="neutral"
              size="sm"
              onClick={leaveEdit}
              disabled={loading}
              icon={<ArrowLeft size={13} />}
            >
              Back
            </Button>
            <Button
              tone="success"
              size="md"
              onClick={handleSaveEdit}
              disabled={loading}
              icon={<Save size={14} />}
              className="ml-auto min-w-[7.5rem]"
            >
              {loading ? "Saving…" : "Save Changes"}
            </Button>
          </>
        ) : (
          <>
            <Button tone="neutral" size="sm" onClick={close}>
              Done
            </Button>
            <Button
              tone="primary"
              size="md"
              onClick={enterEdit}
              icon={<Pencil size={14} />}
              className="ml-auto min-w-[7.5rem]"
            >
              Edit Profile
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
//  Local pieces. Declared at module scope — a component defined inside the
//  render body is a NEW type every render, which remounts its whole subtree
//  (and, for an input, drops focus on every keystroke).
// ---------------------------------------------------------------------------

/** One label → value line in the quiet "Profile" list. */
const MetaRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 py-1.5">
    <span className="shrink-0 text-white/30">{icon}</span>
    <span className="font-rounded min-w-0 flex-1 truncate text-[11px] font-bold text-white/45">
      {label}
    </span>
    <span className="font-rounded shrink-0 text-[11px] font-bold text-white">{value}</span>
  </div>
);

interface EditFormProps {
  draftName: string;
  setDraftName: (v: string) => void;
  draftAvatar: string;
  setDraftAvatar: (v: string) => void;
  draftOutfit: string;
  setDraftOutfit: (v: string) => void;
  loading: boolean;
  confirmReset: boolean;
  setConfirmReset: (v: boolean) => void;
  onReset: () => void;
}

/** The editor. Three edits plus the danger zone, in the order you'd do them. */
const EditForm: React.FC<EditFormProps> = ({
  draftName, setDraftName,
  draftAvatar, setDraftAvatar,
  draftOutfit, setDraftOutfit,
  loading, confirmReset, setConfirmReset, onReset,
}) => (
  <>
    <SectionLabel icon={<User size={11} />}>Username</SectionLabel>
    <input
      id="profile-edit-name"
      type="text"
      maxLength={MAX_NAME}
      value={draftName}
      onChange={(e) => setDraftName(e.target.value)}
      disabled={loading}
      autoComplete="off"
      data-lpignore="true"
      data-form-type="other"
      aria-label="Username"
      aria-describedby="profile-edit-name-hint"
      className="ui-input px-3 py-2.5 text-center text-[15px] uppercase tracking-wide"
    />
    <p
      id="profile-edit-name-hint"
      className="font-rounded px-1 text-center text-[10px] font-bold text-white/40"
    >
      Up to {MAX_NAME} characters. Names can repeat — your Player ID is what makes
      you findable, and it never changes.
    </p>

    <SectionLabel icon={<Smile size={11} />}>Avatar</SectionLabel>
    <AvatarPicker value={draftAvatar} onChange={setDraftAvatar} disabled={loading} />

    <SectionLabel icon={<Shirt size={11} />}>Outfit</SectionLabel>
    <p className="font-rounded -mt-1 px-1 text-[10px] font-bold text-white/40">
      Your character&apos;s look at the table — everyone sees it. Preview above
      updates as you pick.
    </p>
    {/* No second preview: the hero mannequin is already wearing the draft, and a
        second PreviewStage would mean a second WebGL context on one screen. */}
    <OutfitPicker
      value={draftOutfit}
      onChange={setDraftOutfit}
      disabled={loading}
      showPreview={false}
    />

    <SectionLabel icon={<TriangleAlert size={11} />}>Danger zone</SectionLabel>
    {confirmReset ? (
      <div className="flex flex-col gap-2 rounded-2xl border-2 border-rose-400/40 bg-rose-950/40 p-2.5">
        <p className="font-rounded text-center text-[11px] font-bold leading-snug text-white/85">
          Reset all lifetime stats and match history? Your Player ID, username and
          avatar are kept. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <Button
            tone="neutral"
            size="sm"
            block
            onClick={() => setConfirmReset(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            tone="danger"
            size="sm"
            block
            onClick={onReset}
            disabled={loading}
            icon={<RotateCcw size={13} />}
          >
            {loading ? "Resetting…" : "Reset Stats"}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-2.5 rounded-2xl border-2 border-white/10 bg-black/25 px-2.5 py-2">
        <p className="font-rounded min-w-0 flex-1 text-[10px] font-bold leading-snug text-white/45">
          Wipe lifetime stats and match history. Your Player ID, name and avatar
          are kept.
        </p>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={loading}
          className="font-rounded inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border-2 border-rose-400/35 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-500/20 disabled:cursor-not-allowed"
        >
          <RotateCcw size={12} aria-hidden="true" /> Reset
        </button>
      </div>
    )}
  </>
);

/** First-load placeholder shaped like the Overview grid, so nothing jumps. */
function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl border-2 border-white/[0.04] bg-white/[0.06]"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default ProfileModal;
