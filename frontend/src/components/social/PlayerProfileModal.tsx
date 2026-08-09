'use client';

/**
 * ============================================================================
 *  PlayerProfileModal — inspect any player, from anywhere.
 * ============================================================================
 *
 * Opened by clicking a player in the friends panel, a search result, a request
 * row or a social notification. Renders the server's `InspectedProfile` verbatim:
 * identity, live status, lifetime record, streaks, favourite arena and recent
 * matches, plus a full-body 3D outfit preview.
 *
 * THE PREVIEW IS THE HOME SCREEN'S PREVIEW. `PreviewStage` is imported and used
 * unmodified — same camera, same three-point rig, same on-demand frame loop,
 * same drag-to-spin turntable — so an outfit looks identical here and on the
 * landing page, and any future change to that stage lands in both at once. It is
 * loaded through `next/dynamic` with `ssr: false` so none of the three.js bundle
 * is paid for until someone actually opens a profile.
 *
 * PRIVACY IS THE SERVER'S. The payload carries a `hidden` block saying what was
 * withheld; this file renders an honest "hidden" state for those sections rather
 * than a misleading zero. It never receives the underlying values at all.
 *
 * FRIEND ACTIONS live in the footer and are chosen from the server's
 * `relationship` field, so the button set updates the moment the graph changes —
 * an accepted request swaps Add Friend for Invite/Join without a refetch.
 */

import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Trophy, Flame, History, Swords, Layers, DoorOpen, Send, UserPlus, UserMinus,
  Check, Clock, EyeOff, Ban, Map as MapIcon, Users,
} from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useNow } from '../../hooks/useNow';
import { useGameStore } from '../../store/useGameStore';
import { useSocialStore } from '../../store/useSocialStore';
import {
  acceptFriendRequest, cancelFriendRequest, declineFriendRequest, inspectPlayer,
  inviteFriend, joinFriend, removeFriend, sendFriendRequest,
} from '../../lib/social/socialClient';
import { PresetAvatar } from '../profile/PresetAvatar';
import { PresenceDot, isLive, presenceLabel, presenceTextClass } from './PresenceDot';
import { PlayerIdTag } from './PlayerIdTag';
import { getArenaMeta } from '../../lib/arenas/registry';
import {
  formatWinRate, formatPlayTime, formatDuration, formatDate, formatRelative, formatPlacement,
} from '../../lib/profile/format';
import type { InspectedProfile } from '../../types/social';

/**
 * The 3D stage, loaded on demand. `ssr: false` because it mounts a WebGL canvas;
 * the placeholder holds the exact final height so opening the modal never
 * reflows once the chunk lands.
 */
const PreviewStage = dynamic(() => import('../home/PreviewStage'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center">
      <span className="font-rounded text-[0.68rem] uppercase tracking-wide text-white/35">
        Loading outfit…
      </span>
    </div>
  ),
});

/** One stat cell — same geometry as the profile modal's, so the two read alike. */
function Stat({
  label, value, icon: Icon, accent = 'text-white',
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

function SectionTitle({
  icon: Icon, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h3 className="font-arcade text-sm uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2 mb-2.5">
      <Icon size={15} className="text-white" /> {children}
    </h3>
  );
}

export const PlayerProfileModal: React.FC = () => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const openProfileId = useSocialStore((s) => s.openProfileId);
  const openProfile = useSocialStore((s) => s.openProfile);
  const profiles = useSocialStore((s) => s.profiles);
  const loadingProfile = useSocialStore((s) => s.loadingProfile);
  const presenceMap = useSocialStore((s) => s.presence);
  const sentInvites = useSocialStore((s) => s.sentInvites);

  const socket = useGameStore((s) => s.socket);
  const inRoom = useGameStore((s) => Boolean(s.room));

  const isOpen = Boolean(openProfileId);
  const close = () => openProfile(null);
  useDialogA11y(dialogRef, isOpen, close);

  // Cached copy paints instantly; the fresh copy is fetched behind it and
  // swapped in when it lands. Opening a profile you've seen before never blanks.
  const profile: InspectedProfile | undefined = openProfileId ? profiles[openProfileId] : undefined;
  const loading = Boolean(openProfileId) && loadingProfile === openProfileId && !profile;

  // Lazy-load: the detailed view is only ever requested when a profile is
  // actually opened, never eagerly for a list of friends.
  useEffect(() => {
    if (openProfileId) inspectPlayer(socket, openProfileId);
  }, [openProfileId, socket]);

  // A modal-lifetime clock for "last seen" and the invite-sent pill. Only ticks
  // while the modal is actually open.
  const now = useNow(30_000, isOpen);

  // Live presence outranks the snapshot the inspect call carried, so a friend
  // who starts a match while their profile is open updates in place.
  const presence = profile ? presenceMap[profile.profileId] ?? profile.presence : undefined;
  const invited = profile ? (sentInvites[profile.profileId] ?? 0) > now : false;

  const stats = profile?.stats;
  const lost = stats ? Math.max(0, stats.matchesPlayed - stats.matchesWon) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 sm:p-6 pointer-events-auto"
          onClick={close}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-profile-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl sm:max-w-2xl lg:max-w-3xl bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90dvh]"
          >
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b-2 border-white/15 bg-red-600/20 shrink-0 short:px-4 short:py-2">
              <h2
                id="player-profile-title"
                className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2 truncate"
              >
                <Trophy size={18} className="text-white shrink-0" />
                <span className="truncate">{profile?.displayName ?? 'Player'}</span>
              </h2>
              <button
                onClick={close}
                className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer shrink-0"
                aria-label="Close player profile"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col gap-5 short:p-4 short:gap-3">
              {loading || !profile ? (
                <ProfileSkeleton />
              ) : (
                <>
                  {/* ── Outfit preview — the home screen's stage, verbatim ── */}
                  {profile.hidden.outfit ? (
                    <div className="relative overflow-hidden rounded-2xl border-[3px] border-white/15 bg-white/[0.04] h-44 sm:h-52 shrink-0 flex flex-col items-center justify-center gap-2">
                      <EyeOff size={22} className="text-white/25" />
                      <span className="font-rounded text-[0.7rem] uppercase tracking-wide text-white/35">
                        Outfit hidden
                      </span>
                    </div>
                  ) : (
                    /* The height lives on the WRAPPER, not just on the stage: the
                       dynamic-import placeholder sizes itself with `h-full`, and a
                       wrapper with auto height would collapse it (and the whole
                       preview box) to zero while the three.js chunk loads. */
                    <div className="relative overflow-hidden rounded-2xl border-[3px] border-white/20 bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-[0_3px_0_0_rgba(0,0,0,0.3)] h-44 sm:h-52 shrink-0">
                      <PreviewStage
                        // Re-mount per player, so opening a second profile builds a
                        // fresh stage instead of reusing the first one's canvas.
                        key={profile.profileId}
                        outfitKey={profile.outfit}
                        name={profile.displayName}
                        className="relative h-full w-full"
                      />
                    </div>
                  )}

                  {/* ── Identity ───────────────────────────────────────── */}
                  <div className="flex items-center gap-4">
                    <span className="relative shrink-0">
                      <PresetAvatar avatarKey={profile.avatarUrl} size={64} />
                      {presence && (
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <PresenceDot status={presence.status} size={16} halo={isLive(presence.status)} />
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="font-arcade text-2xl text-white truncate">{profile.displayName}</span>
                        {/* Player ID, not the legacy tag: names repeat, this does
                            not. Muted and one size down so the name still leads. */}
                        <PlayerIdTag id={profile.profileId} copyable size="text-sm" />
                      </div>
                      {presence && (
                        <span className={`block font-rounded text-xs font-bold ${presenceTextClass(presence.status)}`}>
                          {profile.hidden.onlineStatus ? 'Status hidden' : presenceLabel(presence.status)}
                          {!profile.hidden.onlineStatus && presence.status === 'offline'
                            ? ` · last seen ${formatRelative(profile.lastSeenAt, now)}`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Dates + friends strip ──────────────────────────── */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="chip-arcade bg-white/5 flex flex-col items-center py-2 px-1 text-center">
                      <span className="font-rounded font-bold text-white text-xs">{formatDate(profile.createdAt)}</span>
                      <span className="font-rounded text-[0.6rem] uppercase tracking-wide text-white/50">Joined</span>
                    </div>
                    <div className="chip-arcade bg-white/5 flex flex-col items-center py-2 px-1 text-center">
                      <span className="font-rounded font-bold text-white text-xs">{formatPlayTime(profile.totalPlayTimeMs)}</span>
                      <span className="font-rounded text-[0.6rem] uppercase tracking-wide text-white/50">Play Time</span>
                    </div>
                    <div className="chip-arcade bg-white/5 flex flex-col items-center py-2 px-1 text-center">
                      <span className="font-rounded font-bold text-white text-xs flex items-center gap-1">
                        <Users size={11} className="text-white/45" /> {profile.friendCount}
                      </span>
                      <span className="font-rounded text-[0.6rem] uppercase tracking-wide text-white/50">Friends</span>
                    </div>
                  </div>

                  {/* ── Record ─────────────────────────────────────────── */}
                  <div>
                    <SectionTitle icon={Trophy}>Record</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="Played" value={stats?.matchesPlayed ?? 0} icon={Layers} />
                      <Stat label="Won" value={stats?.matchesWon ?? 0} icon={Layers} accent="text-lime-400" />
                      <Stat label="Lost" value={lost} accent="text-rose-400" />
                      <Stat label="Win %" value={formatWinRate(profile.winRate)} accent="text-yellow-400" />
                    </div>
                  </div>

                  {/* ── Streaks + favourite arena ──────────────────────── */}
                  <div>
                    <SectionTitle icon={Flame}>Streaks</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <Stat label="Streak" value={stats?.currentStreak ?? 0} icon={Flame} accent="text-orange-400" />
                      <Stat label="Best" value={stats?.bestStreak ?? 0} icon={Flame} accent="text-yellow-400" />
                      <Stat
                        label="Fav Arena"
                        value={
                          <span className="font-rounded text-sm font-bold">
                            {profile.favoriteArena ? getArenaMeta(profile.favoriteArena).name : '—'}
                          </span>
                        }
                        icon={MapIcon}
                      />
                    </div>
                  </div>

                  {/* ── Match history ──────────────────────────────────── */}
                  <div>
                    <SectionTitle icon={History}>Recent Matches</SectionTitle>
                    {profile.hidden.matchHistory ? (
                      <div className="chip-arcade bg-white/5 py-6 text-center font-rounded text-sm text-white/40 flex flex-col items-center gap-1.5">
                        <EyeOff size={18} className="text-white/25" />
                        Match history is private.
                      </div>
                    ) : profile.recentMatches.length === 0 ? (
                      <div className="chip-arcade bg-white/5 py-6 text-center font-rounded text-sm text-white/40">
                        No matches played yet.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {profile.recentMatches.map((m, i) => {
                          const won = m.placement === 1;
                          return (
                            <div key={`${m.date}-${i}`} className="chip-arcade bg-white/5 flex items-center gap-3 py-2.5 px-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-arcade text-sm shrink-0 border-2 ${
                                  won ? 'bg-lime-500/25 border-lime-400 text-lime-300' : 'bg-white/5 border-white/25 text-white/70'
                                }`}
                              >
                                {formatPlacement(m.placement)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-rounded font-bold text-white text-sm truncate flex items-center gap-1.5">
                                  {won ? (
                                    <Trophy size={13} className="text-yellow-400 shrink-0" />
                                  ) : (
                                    <Swords size={13} className="text-white/40 shrink-0" />
                                  )}
                                  <span className="truncate">{won ? 'Victory' : `Winner: ${m.winnerName}`}</span>
                                </div>
                                <div className="font-rounded text-[0.66rem] text-white/50 truncate">
                                  {m.players.length}p · {formatDuration(m.durationMs)}
                                  {m.arena ? ` · ${getArenaMeta(m.arena).name}` : ''}
                                </div>
                              </div>
                              <span className="font-rounded text-[0.62rem] text-white/40 shrink-0 text-right">
                                {formatRelative(m.date, now)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Footer actions — driven entirely by `relationship` ───── */}
            {profile && profile.relationship !== 'self' && (
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-t-2 border-white/15 bg-black/40 shrink-0 flex gap-2.5">
                {profile.relationship === 'friends' ? (
                  <>
                    {presence?.roomCode && (
                      <button
                        type="button"
                        onClick={() => joinFriend(socket, profile.profileId)}
                        disabled={!presence.joinable}
                        className={`btn-arcade flex-1 py-3 text-[0.7rem] uppercase inline-flex items-center justify-center gap-2 ${
                          presence.joinable
                            ? 'bg-gradient-to-b from-lime-400 to-green-600 text-white cursor-pointer'
                            : 'bg-gradient-to-b from-neutral-700 to-neutral-900 text-white/35 cursor-not-allowed'
                        }`}
                      >
                        <DoorOpen size={14} />
                        {presence.joinable ? (presence.joinAsSpectator ? 'Watch' : 'Join') : 'Full'}
                      </button>
                    )}
                    {inRoom && isLive(presence?.status ?? 'offline') && (
                      <button
                        type="button"
                        onClick={() => inviteFriend(socket, profile.profileId)}
                        disabled={invited}
                        className={`btn-arcade flex-1 py-3 text-[0.7rem] uppercase inline-flex items-center justify-center gap-2 ${
                          invited
                            ? 'bg-gradient-to-b from-neutral-700 to-neutral-900 text-yellow-300/60 cursor-not-allowed'
                            : 'bg-gradient-to-b from-sky-500 to-blue-700 text-white cursor-pointer'
                        }`}
                      >
                        <Send size={14} /> {invited ? 'Invited' : 'Invite'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFriend(socket, profile.profileId)}
                      className="btn-arcade bg-gradient-to-b from-neutral-600 to-neutral-800 text-white px-3.5 py-3 text-[0.7rem] uppercase cursor-pointer inline-flex items-center justify-center gap-2"
                      aria-label={`Remove ${profile.displayName} from friends`}
                    >
                      <UserMinus size={14} />
                    </button>
                  </>
                ) : profile.relationship === 'request-received' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => acceptFriendRequest(socket, profile.profileId)}
                      className="btn-arcade flex-1 bg-gradient-to-b from-lime-400 to-green-600 text-white py-3 text-[0.7rem] uppercase cursor-pointer inline-flex items-center justify-center gap-2"
                    >
                      <Check size={14} /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => declineFriendRequest(socket, profile.profileId)}
                      className="btn-arcade flex-1 bg-gradient-to-b from-neutral-600 to-neutral-800 text-white py-3 text-[0.7rem] uppercase cursor-pointer inline-flex items-center justify-center gap-2"
                    >
                      <X size={14} /> Decline
                    </button>
                  </>
                ) : profile.relationship === 'request-sent' ? (
                  <button
                    type="button"
                    onClick={() => cancelFriendRequest(socket, profile.profileId)}
                    className="btn-arcade flex-1 bg-gradient-to-b from-neutral-600 to-neutral-800 text-white py-3 text-[0.7rem] uppercase cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Clock size={14} /> Request Sent — Cancel
                  </button>
                ) : profile.relationship === 'blocked' || profile.relationship === 'blocked-by' ? (
                  <div className="flex-1 font-rounded text-[0.7rem] uppercase tracking-wide text-white/35 text-center py-3 inline-flex items-center justify-center gap-2">
                    <Ban size={14} /> Unavailable
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendFriendRequest(socket, profile.profileId)}
                    disabled={!profile.canSendRequest}
                    className={`btn-arcade flex-1 py-3 text-[0.7rem] uppercase inline-flex items-center justify-center gap-2 ${
                      profile.canSendRequest
                        ? 'bg-gradient-to-b from-sky-500 to-blue-700 text-white cursor-pointer'
                        : 'bg-gradient-to-b from-neutral-700 to-neutral-900 text-white/35 cursor-not-allowed'
                    }`}
                    title={profile.canSendRequest ? undefined : 'This player is not accepting friend requests.'}
                  >
                    <UserPlus size={14} /> {profile.canSendRequest ? 'Add Friend' : 'Not Accepting'}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-pulse" aria-hidden="true">
      <div className="h-44 sm:h-52 rounded-2xl bg-white/[0.06] border-[3px] border-white/10" />
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-white/10 shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-4 w-1/2 rounded-full bg-white/10" />
          <div className="h-2.5 w-1/3 rounded-full bg-white/[0.07]" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  );
}

export default PlayerProfileModal;
