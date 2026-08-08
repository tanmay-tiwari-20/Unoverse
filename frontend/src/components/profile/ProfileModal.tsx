"use client";

/**
 * ============================================================================
 *  ProfileModal — your own player card, and the editor behind it.
 * ============================================================================
 *
 * This is the screen a player opens to look at themselves, so it is built to be
 * looked at: a full-height 3D mannequin wearing the equipped outfit leads the
 * panel, identity sits directly beneath it, and the numbers are grouped into
 * three tabs instead of the seven stacked grids the old version scrolled through.
 *
 * WHAT CHANGED, AND WHY
 *   • The 3D preview is now the headline rather than something you only saw
 *     while picking an outfit. It is the existing `PreviewStage` — the same
 *     camera, lighting rig, turntable and on-demand frame loop the home screen
 *     and the inspect-a-player modal use — so an outfit looks identical
 *     everywhere and any change to that stage lands in all three at once.
 *   • Twenty-four stat cells used to be one long scroll. They are now Overview /
 *     Cards / History, and only the open tab is mounted, which is what keeps the
 *     panel short enough to fit a 390×844 phone without shrinking anything.
 *   • Landscape is a genuinely different arrangement (`short:`): the mannequin
 *     moves beside the identity block instead of above it, because a 390px-tall
 *     viewport cannot afford a stacked hero.
 *   • Reset Stats moved into the editor, alongside the other three
 *     secret-authenticated writes. It is destructive and it is profile
 *     management, so it belongs where you go to manage the profile — not one tap
 *     from the panel you open to admire your win streak.
 *
 * PERFORMANCE — exactly ONE WebGL context exists on this screen. The hero stage
 * is mounted once and re-skinned by prop while editing (`outfitKey` is data, not
 * identity, so picking an outfit never remounts the canvas), and `OutfitPicker`
 * is asked to suppress its own built-in preview rather than opening a second one.
 * The stage itself renders on demand, so a still mannequin costs nothing.
 *
 * SERVER-AUTHORITATIVE — every value shown comes from the server's `PublicProfile`.
 * Nothing is computed here, and the three edits (rename / avatar / outfit) plus
 * the reset all go through the store's secret-authenticated calls unchanged.
 */

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, ArrowLeft, Flame, Hand, History, Layers, Pencil, RotateCcw,
  Save, ShieldCheck, ShieldX, Swords, Trophy, User, Zap,
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
  Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader,
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
    >
      <ModalHeader
        id="profile-modal-title"
        title={mode === "edit" ? "Edit Profile" : "Player Profile"}
        subtitle={
          mode === "edit"
            ? "Name, avatar and outfit — your Player ID and stats stay put."
            : `${stats?.matchesPlayed ?? 0} games · ${formatWinRate(cached?.winRate ?? 0)} win rate`
        }
        icon={mode === "edit" ? <Pencil size={16} aria-hidden="true" /> : <User size={16} aria-hidden="true" />}
        onClose={close}
        closeLabel="Close profile"
      />

      {/* ── Hero: the mannequin + who you are ─────────────────────────────
          Stacked in portrait, side-by-side in landscape (`short:`) — a 390px
          tall viewport cannot spend 12rem of it on a stacked header. */}
      <div className="flex shrink-0 flex-col border-b-2 border-white/10 short:flex-row">
        <div
          className={`relative shrink-0 overflow-hidden bg-gradient-to-b ${outfit.gradient} h-40 sm:h-48 short:h-auto short:w-36 short:min-h-[8.5rem]`}
        >
          {/* Knock the outfit gradient back so the character reads against it
              without losing the colour that identifies the skin. */}
          <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
          <PreviewStage
            outfitKey={shownOutfit}
            name={displayName}
            className="relative h-full w-full"
          />
          <span className="font-rounded pointer-events-none absolute bottom-1.5 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/85">
            {outfit.label}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 short:flex-col short:items-start short:justify-center">
          <span className="relative shrink-0">
            <PresetAvatar avatarKey={shownAvatar} size={52} />
            <span className="absolute -bottom-0.5 -right-0.5">
              <PresenceDot status={status} size={14} halo={connected} />
            </span>
          </span>

          <div className="min-w-0 flex-1 short:w-full">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="font-arcade truncate text-[clamp(1rem,0.8rem+1vw,1.5rem)] text-white">
                {displayName}
              </span>
              <PlayerIdTag id={profileId} copyable size="text-[11px]" />
            </div>
            {/* Status as a word, not just a dot — §16: never colour alone. */}
            <span
              className={`font-rounded mt-0.5 block text-[11px] font-bold ${presenceTextClass(status)}`}
            >
              {presenceLabel(status)}
              {cached ? ` · last played ${formatRelative(cached.lastSeenAt, now)}` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs are pinned above the scroller so switching never means scrolling
          back up first. Hidden while editing — the editor is one flow. */}
      {mode === "view" && (
        <div className="shrink-0 px-3 py-2 short:py-1.5">
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
            <div className="font-rounded flex items-center gap-2 rounded-xl border-2 border-rose-400/50 bg-rose-500/20 px-2.5 py-2 text-[11px] font-bold text-rose-100">
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
            <SectionLabel icon={<Trophy size={11} />}>Record</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <StatTile label="Played" value={stats?.matchesPlayed ?? 0} icon={<Layers size={10} />} />
              <StatTile label="Won" value={stats?.matchesWon ?? 0} tone="good" />
              <StatTile label="Lost" value={matchesLost} tone="bad" />
              <StatTile label="Win Rate" value={formatWinRate(cached?.winRate ?? 0)} tone="gold" />
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

            <SectionLabel icon={<User size={11} />}>Profile</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              <StatTile label="Joined" value={<Small>{cached ? formatDate(cached.createdAt) : "—"}</Small>} />
              <StatTile label="Play Time" value={<Small>{cached ? formatPlayTime(cached.totalPlayTimeMs) : "—"}</Small>} />
              <StatTile label="Friends" value={cached?.friendCount ?? 0} />
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
          <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center short:py-5">
            <History size={26} className="text-white/20" aria-hidden="true" />
            <p className="font-arcade text-[11px] uppercase tracking-wider text-white/60">
              No rounds yet
            </p>
            <p className="font-rounded max-w-[28ch] text-[10px] font-bold leading-snug text-white/35">
              Finish a round and it lands here, with your placement and who won.
            </p>
          </div>
        )}
      </ModalBody>

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
              size="sm"
              onClick={handleSaveEdit}
              disabled={loading}
              icon={<Save size={13} />}
              className="ml-auto"
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </>
        ) : (
          <Button
            tone="primary"
            size="sm"
            onClick={enterEdit}
            icon={<Pencil size={13} />}
            className="ml-auto"
          >
            Edit Profile
          </Button>
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

/** Text-sized value inside a StatTile, for dates and durations. */
const Small: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-rounded text-[11px] font-bold text-white">{children}</span>
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

    <SectionLabel icon={<Trophy size={11} />}>Avatar</SectionLabel>
    <AvatarPicker value={draftAvatar} onChange={setDraftAvatar} disabled={loading} />

    <SectionLabel icon={<Layers size={11} />}>Outfit</SectionLabel>
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

    <SectionLabel icon={<RotateCcw size={11} />}>Danger zone</SectionLabel>
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
      <button
        type="button"
        onClick={() => setConfirmReset(true)}
        className="font-rounded mx-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/40 transition-colors hover:text-rose-300"
      >
        <RotateCcw size={12} aria-hidden="true" /> Reset Stats
      </button>
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
