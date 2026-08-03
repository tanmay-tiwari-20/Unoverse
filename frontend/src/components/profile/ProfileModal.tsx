"use client";

/**
 * Persistent player profile viewer + editor. Opened from the landing page (and
 * reusable elsewhere). Displays the server-authoritative lifetime stats, match
 * history, identity and dates, and offers the three secret-authenticated edits
 * the server allows: rename, change avatar, reset stats.
 *
 * Reuses the arcade modal pattern (AnimatePresence + spring, panel-arcade,
 * arcade-dots, chip-arcade, arcade-stroke-*) and the a11y focus-trap hook. All
 * stat values come from the server — nothing is computed client-side. Presentation
 * polish only; no external assets, layouts, branding, or artwork are copied.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Pencil, RotateCcw, Copy, Check, Trophy, Swords, Layers, Hand,
  Zap, Flame, ShieldCheck, ShieldX, History, AlertCircle, Save, ArrowLeft,
} from "lucide-react";
import { useProfileStore } from "../../store/useProfileStore";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { PresetAvatar } from "./PresetAvatar";
import { AvatarPicker } from "./AvatarPicker";
import { OutfitPicker } from "./OutfitPicker";
import { DEFAULT_OUTFIT_KEY } from "../../lib/cosmetics/outfits";
import type { ProfileStats } from "../../types/profile";
import {
  formatWinRate, formatPlayTime, formatDuration, formatDate,
  formatRelative, formatPlacement, formatAvgPlacement,
} from "../../lib/profile/format";

/** A single stat cell. */
function Stat({
  label, value, icon: Icon, accent = "text-white",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string;
}) {
  return (
    <div className="chip-arcade bg-white/5 flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 text-center">
      <span className={`font-arcade text-lg leading-none ${accent}`}>{value}</span>
      <span className="font-rounded font-semibold text-[0.62rem] uppercase tracking-wide text-white/55 leading-tight flex items-center gap-1">
        {Icon && <Icon size={11} className="text-white/45" />} {label}
      </span>
    </div>
  );
}

/** Section heading with a small icon. */
function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode }) {
  return (
    <h3 className="font-arcade text-sm uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2 mb-2.5">
      <Icon size={15} className="text-white" /> {children}
    </h3>
  );
}

export function ProfileModal() {
  const dialogRef = useRef<HTMLDivElement>(null);

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

  const close = () => setIsProfileOpen(false);
  useDialogA11y(dialogRef, isOpen, close);

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit-mode draft state.
  const [draftName, setDraftName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState("");
  const [draftOutfit, setDraftOutfit] = useState("");

  // Re-fetch fresh stats whenever the modal opens (never trust local totals).
  useEffect(() => {
    if (isOpen && profileId) refreshProfile();
    if (isOpen) {
      setMode("view");
      setConfirmReset(false);
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profileId]);

  // Seed the edit draft from the freshest known values when entering edit mode.
  useEffect(() => {
    if (mode === "edit") {
      setDraftName(cached?.displayName ?? cachedName ?? "");
      setDraftAvatar(cached?.avatarUrl ?? cachedAvatar ?? "");
      setDraftOutfit(cached?.outfit ?? cachedOutfit ?? DEFAULT_OUTFIT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const now = useMemo(() => Date.now(), [isOpen]);

  // Prefer the server view; fall back to cached identity for first paint.
  const displayName = cached?.displayName ?? cachedName ?? "Player";
  const tag = cached?.tag ?? "";
  const avatarKey = cached?.avatarUrl ?? cachedAvatar ?? null;
  const outfitKey = cached?.outfit ?? cachedOutfit ?? DEFAULT_OUTFIT_KEY;
  const stats: ProfileStats | null = cached?.stats ?? null;

  const handleSaveEdit = async () => {
    const trimmed = draftName.trim();
    const nameChanged = trimmed && trimmed !== displayName;
    const avatarChanged = draftAvatar && draftAvatar !== avatarKey;
    const outfitChanged = draftOutfit && draftOutfit !== outfitKey;
    if (nameChanged) await renameProfile(trimmed);
    if (avatarChanged) await setAvatar(draftAvatar);
    if (outfitChanged) await setOutfit(draftOutfit);
    if (!useProfileStore.getState().error) setMode("view");
  };

  const handleReset = async () => {
    await resetProfile();
    if (!useProfileStore.getState().error) setConfirmReset(false);
  };

  const copyId = async () => {
    if (!profileId) return;
    try {
      await navigator.clipboard.writeText(profileId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  };

  const matchesLost = stats ? Math.max(0, stats.matchesPlayed - stats.matchesWon) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 sm:p-6 pointer-events-auto"
          onClick={close}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90dvh]"
          >
            {/* ── Header bar ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b-2 border-white/15 bg-red-600/20 shrink-0">
              <h2 id="profile-modal-title" className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2">
                {mode === "edit" ? <><Pencil size={18} className="text-white" /> Edit Profile</> : <><Trophy size={18} className="text-white" /> Player Profile</>}
              </h2>
              <button
                onClick={close}
                className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer"
                aria-label="Close profile"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col gap-5">
              <AnimatePresence mode="wait">
                {storeError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-red-500/90 border-4 border-white rounded-2xl p-3 flex gap-2.5 items-center text-sm text-white font-rounded font-bold shadow-[0_6px_0_0_rgba(0,0,0,0.3)]">
                      <AlertCircle size={18} className="text-white shrink-0" />
                      <span>{storeError}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {mode === "edit" ? (
                /* ── EDIT MODE ──────────────────────────────────────── */
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-3">
                    <PresetAvatar avatarKey={draftAvatar || avatarKey} size={72} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="profile-edit-name" className="font-arcade text-[0.7rem] uppercase tracking-wide text-white/70 px-1">Username</label>
                    <input
                      id="profile-edit-name"
                      type="text"
                      maxLength={12}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      disabled={loading}
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      className="w-full bg-white/10 border-[3px] border-white/70 rounded-2xl px-4 py-3.5 text-white placeholder-white/50 text-center tracking-wide font-rounded font-bold uppercase focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all text-base"
                    />
                    <p className="font-rounded text-[0.68rem] text-white/45 text-center px-1">Your Player ID and stats stay the same.</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="font-arcade text-[0.7rem] uppercase tracking-wide text-white/70 px-1">Avatar</span>
                    <AvatarPicker value={draftAvatar || avatarKey || ""} onChange={setDraftAvatar} disabled={loading} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="font-arcade text-[0.7rem] uppercase tracking-wide text-white/70 px-1">Outfit</span>
                    <p className="font-rounded text-[0.68rem] text-white/45 px-1 -mt-1">Your in-game character&apos;s look. Everyone at the table sees it.</p>
                    <OutfitPicker value={draftOutfit || outfitKey} onChange={setDraftOutfit} disabled={loading} />
                  </div>

                  <div className="flex gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setMode("view")}
                      disabled={loading}
                      className="btn-arcade flex-1 bg-gradient-to-b from-neutral-600 to-neutral-800 text-white py-3.5 text-xs uppercase cursor-pointer inline-flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={loading}
                      className="btn-arcade flex-1 bg-gradient-to-b from-lime-400 to-green-600 text-white py-3.5 text-xs uppercase disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                    >
                      <Save size={15} /> {loading ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── VIEW MODE ──────────────────────────────────────── */
                <>
                  {/* Identity header */}
                  <div className="flex items-center gap-4">
                    <PresetAvatar avatarKey={avatarKey} size={68} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="font-arcade text-2xl text-white truncate">{displayName}</span>
                        {tag && <span className="font-rounded font-bold text-white/45 text-sm">#{tag}</span>}
                      </div>
                      <button
                        onClick={copyId}
                        className="mt-1 inline-flex items-center gap-1.5 font-rounded text-[0.68rem] text-white/50 hover:text-white/80 transition-colors cursor-pointer"
                        aria-label="Copy Player ID"
                        title={profileId ?? undefined}
                      >
                        <span className="uppercase tracking-wide">ID</span>
                        <span className="font-mono truncate max-w-[10rem]">{profileId ?? "—"}</span>
                        {copied ? <Check size={12} className="text-lime-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                    <button
                      onClick={() => setMode("edit")}
                      className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-sky-500 to-blue-700 cursor-pointer shrink-0"
                      aria-label="Edit profile"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>

                  {/* Dates + playtime strip */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="chip-arcade bg-white/5 flex flex-col items-center py-2 px-1 text-center">
                      <span className="font-rounded font-bold text-white text-xs">{cached ? formatDate(cached.createdAt) : "—"}</span>
                      <span className="font-rounded text-[0.6rem] uppercase tracking-wide text-white/50">Joined</span>
                    </div>
                    <div className="chip-arcade bg-white/5 flex flex-col items-center py-2 px-1 text-center">
                      <span className="font-rounded font-bold text-white text-xs">{cached ? formatRelative(cached.lastSeenAt, now) : "—"}</span>
                      <span className="font-rounded text-[0.6rem] uppercase tracking-wide text-white/50">Last Played</span>
                    </div>
                    <div className="chip-arcade bg-white/5 flex flex-col items-center py-2 px-1 text-center">
                      <span className="font-rounded font-bold text-white text-xs">{cached ? formatPlayTime(cached.totalPlayTimeMs) : "—"}</span>
                      <span className="font-rounded text-[0.6rem] uppercase tracking-wide text-white/50">Play Time</span>
                    </div>
                  </div>

                  {/* Headline record. One completed round counts as one game, so
                      these track rounds finished — the separate round counters
                      would just repeat them. Win % is derived from the same pair. */}
                  <div>
                    <SectionTitle icon={Trophy}>Record</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="Played" value={stats?.matchesPlayed ?? 0} icon={Layers} />
                      <Stat label="Won" value={stats?.matchesWon ?? 0} icon={Layers} accent="text-lime-400" />
                      <Stat label="Lost" value={matchesLost} accent="text-rose-400" />
                      <Stat label="Win %" value={formatWinRate(cached?.winRate ?? 0)} accent="text-yellow-400" />
                    </div>
                  </div>

                  {/* Streaks + scoring */}
                  <div>
                    <SectionTitle icon={Flame}>Streaks &amp; Scoring</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="Streak" value={stats?.currentStreak ?? 0} icon={Flame} accent="text-orange-400" />
                      <Stat label="Best" value={stats?.bestStreak ?? 0} icon={Flame} accent="text-yellow-400" />
                      <Stat label="Points" value={stats?.pointsScored ?? 0} icon={Zap} />
                      <Stat label="Avg Place" value={stats ? formatAvgPlacement(stats.placementSum, stats.placementCount) : "—"} icon={Trophy} />
                    </div>
                  </div>

                  {/* Card play breakdown */}
                  <div>
                    <SectionTitle icon={Hand}>Cards</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="Played" value={stats?.cardsPlayed ?? 0} />
                      <Stat label="Drawn" value={stats?.cardsDrawn ?? 0} />
                      <Stat label="Reverse" value={stats?.reverseCardsPlayed ?? 0} />
                      <Stat label="Skip" value={stats?.skipCardsPlayed ?? 0} />
                      <Stat label="Wild" value={stats?.wildsPlayed ?? 0} />
                      <Stat label="Wild +4" value={stats?.wildDrawFourPlayed ?? 0} />
                      <Stat label="Draw" value={stats?.drawCardsPlayed ?? 0} />
                      <Stat label="Jump-In" value={stats?.jumpIns ?? 0} />
                    </div>
                  </div>

                  {/* Calls + challenges */}
                  <div>
                    <SectionTitle icon={ShieldCheck}>Calls &amp; Challenges</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="UNO!" value={stats?.unoCalls ?? 0} icon={Zap} accent="text-yellow-400" />
                      <Stat label="Last Card" value={stats?.lastCardCalls ?? 0} icon={Hand} />
                      <Stat label="Ch. Won" value={stats?.challengesWon ?? 0} icon={ShieldCheck} accent="text-lime-400" />
                      <Stat label="Ch. Lost" value={stats?.challengesLost ?? 0} icon={ShieldX} accent="text-rose-400" />
                    </div>
                  </div>

                  {/* Match history */}
                  <div>
                    <SectionTitle icon={History}>Match History</SectionTitle>
                    {cached && cached.recentMatches.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {cached.recentMatches.map((m, i) => {
                          const won = m.placement === 1;
                          return (
                            <div
                              key={`${m.date}-${i}`}
                              className="chip-arcade bg-white/5 flex items-center gap-3 py-2.5 px-3"
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-arcade text-sm shrink-0 border-2 ${won ? "bg-lime-500/25 border-lime-400 text-lime-300" : "bg-white/5 border-white/25 text-white/70"}`}>
                                {formatPlacement(m.placement)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-rounded font-bold text-white text-sm truncate flex items-center gap-1.5">
                                  {won ? <Trophy size={13} className="text-yellow-400 shrink-0" /> : <Swords size={13} className="text-white/40 shrink-0" />}
                                  <span className="truncate">
                                    {won ? "Victory" : `Winner: ${m.winnerName}`}
                                  </span>
                                </div>
                                <div className="font-rounded text-[0.66rem] text-white/50 truncate">
                                  {m.players.length}p · {m.rounds} {m.rounds === 1 ? "round" : "rounds"} · {formatDuration(m.durationMs)} · {m.settings.houseRulesSummary}
                                </div>
                              </div>
                              <span className="font-rounded text-[0.62rem] text-white/40 shrink-0 text-right">{formatRelative(m.date, now)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="chip-arcade bg-white/5 py-6 text-center font-rounded text-sm text-white/40">
                        No matches yet — play a game to start your history!
                      </div>
                    )}
                  </div>

                  {/* Danger zone: reset */}
                  <div className="pt-1">
                    {confirmReset ? (
                      <div className="panel-arcade bg-red-950/40 p-3 flex flex-col gap-2.5">
                        <p className="font-rounded font-semibold text-white/85 text-xs text-center leading-relaxed">
                          Reset all lifetime stats and match history? Your Player ID, username, and avatar are kept. This cannot be undone.
                        </p>
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => setConfirmReset(false)}
                            disabled={loading}
                            className="btn-arcade flex-1 bg-gradient-to-b from-neutral-600 to-neutral-800 text-white py-2.5 text-xs uppercase cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleReset}
                            disabled={loading}
                            className="btn-arcade flex-1 bg-gradient-to-b from-rose-500 to-red-700 text-white py-2.5 text-xs uppercase disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
                          >
                            <RotateCcw size={14} /> {loading ? "Resetting…" : "Reset Stats"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmReset(true)}
                        className="font-rounded text-[0.7rem] text-white/40 hover:text-rose-400 transition-colors uppercase tracking-wide inline-flex items-center gap-1.5 cursor-pointer mx-auto"
                      >
                        <RotateCcw size={12} /> Reset Stats
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
