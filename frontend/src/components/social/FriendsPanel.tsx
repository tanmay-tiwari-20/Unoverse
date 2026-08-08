'use client';

/**
 * ============================================================================
 *  FriendsPanel — the friends drawer.
 * ============================================================================
 *
 * Three tabs over one social store: Friends, Requests (incoming + outgoing) and
 * Search. Slides in from the right on desktop, becomes a bottom sheet on narrow
 * screens, and reuses the arcade modal chrome (`panel-arcade`, `chip-arcade`,
 * `btn-arcade`, `custom-scrollbar`) so it reads as part of the same game.
 *
 * PERFORMANCE — every list row is memoized and the panel subscribes to narrow
 * slices, so a presence tick re-renders one row rather than the drawer. Search is
 * debounced and its responses are matched against the current query in the store,
 * so an out-of-order reply can never flash stale results.
 *
 * The panel NEVER decides what is allowed. Buttons are rendered from the
 * server's `relationship` / `joinable` fields; every click is a request the
 * server can still refuse, and a refusal comes back on `social:error` and shows
 * inline here rather than as a game error.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Check, Search, UserPlus, Users, X, Clock, UserCheck, Ban,
} from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useNow } from '../../hooks/useNow';
import { useGameStore } from '../../store/useGameStore';
import {
  useSocialStore, sortedFriends, presenceOf,
} from '../../store/useSocialStore';
import {
  acceptFriendRequest, cancelFriendRequest, declineFriendRequest, inviteFriend,
  joinFriend, removeFriend, searchPlayers, sendFriendRequest,
} from '../../lib/social/socialClient';
import { FriendCard } from './FriendCard';
import { PlayerRow } from './PlayerRow';
import { formatRelative } from '../../lib/profile/format';
import type { RelationshipState } from '../../types/social';

type Tab = 'friends' | 'requests' | 'search';

/** Debounce before a keystroke becomes a server search. Long enough that typing
 *  a full username is one request, short enough to feel instant. */
const SEARCH_DEBOUNCE_MS = 260;

export const FriendsPanel: React.FC = () => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = useSocialStore((s) => s.panelOpen);
  const setPanelOpen = useSocialStore((s) => s.setPanelOpen);
  const friends = useSocialStore((s) => s.friends);
  const incoming = useSocialStore((s) => s.incoming);
  const outgoing = useSocialStore((s) => s.outgoing);
  const presence = useSocialStore((s) => s.presence);
  const sentInvites = useSocialStore((s) => s.sentInvites);
  const searchResults = useSocialStore((s) => s.searchResults);
  const searchLoading = useSocialStore((s) => s.searchLoading);
  const ready = useSocialStore((s) => s.ready);
  const error = useSocialStore((s) => s.error);
  const openProfile = useSocialStore((s) => s.openProfile);
  const clearSearch = useSocialStore((s) => s.clearSearch);

  const socket = useGameStore((s) => s.socket);
  // Inviting requires being somewhere to invite TO. The server enforces this
  // too ("You need to be in a room before you can invite someone."); reading it
  // here just avoids offering a button that would only produce an error.
  const inRoom = useGameStore((s) => Boolean(s.room));

  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');

  // Closing is an event, not a side effect, so the transient view is reset right
  // here rather than in an effect watching `open`. Every user-initiated close
  // funnels through this one callback — the X button, the backdrop click and the
  // Escape key (which `useDialogA11y` routes here) — so re-opening starts clean.
  // `clearSearch` is left to the debounce effect below, which fires the moment
  // the query becomes empty; calling it twice would be redundant.
  const close = useCallback(() => {
    setQuery('');
    setPanelOpen(false);
  }, [setPanelOpen]);
  useDialogA11y(dialogRef, open, close);

  // One clock for the whole list, so twenty rows don't each call Date.now() and
  // can't disagree about what "2m ago" means. Minute-grained: relative labels
  // never change faster than that, and the timer only runs while open.
  const now = useNow(30_000, open);

  // Debounced search. The store holds the in-flight query, so a response that
  // arrives after the player has typed on is discarded rather than rendered.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      clearSearch();
      return;
    }
    const timer = setTimeout(() => searchPlayers(socket, trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, socket, clearSearch]);

  const orderedFriends = useMemo(() => sortedFriends(friends, presence), [friends, presence]);
  const pendingCount = incoming.length;

  const handleOpenProfile = useCallback((profileId: string) => openProfile(profileId), [openProfile]);
  const handleInvite = useCallback((id: string) => inviteFriend(socket, id), [socket]);
  const handleJoin = useCallback((id: string) => joinFriend(socket, id), [socket]);
  const handleRemove = useCallback((id: string) => removeFriend(socket, id), [socket]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1900] bg-black/55 backdrop-blur-sm pointer-events-auto flex items-end sm:items-stretch sm:justify-end short:items-center short:justify-end short:p-3"
          onClick={close}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="friends-panel-title"
            tabIndex={-1}
            initial={{ opacity: 0, x: 24, y: 24 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 24, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[26rem] sm:max-w-[92vw] bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-none sm:h-full sm:rounded-r-none short:h-auto short:max-h-[76dvh] short:my-auto short:rounded-2xl safe-x"
          >
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b-2 border-white/15 bg-red-600/20 shrink-0 short:px-4 short:py-2">
              <h2
                id="friends-panel-title"
                className="font-arcade text-lg uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2"
              >
                <Users size={17} className="text-white" /> Friends
              </h2>
              <button
                onClick={close}
                className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 cursor-pointer"
                aria-label="Close friends panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────── */}
            <div className="flex gap-1.5 px-3 pt-3 shrink-0" role="tablist" aria-label="Friends sections">
              <TabButton active={tab === 'friends'} onClick={() => setTab('friends')} icon={Users} label="Friends" count={friends.length} />
              <TabButton active={tab === 'requests'} onClick={() => setTab('requests')} icon={UserCheck} label="Requests" count={pendingCount} highlight={pendingCount > 0} />
              <TabButton active={tab === 'search'} onClick={() => setTab('search')} icon={Search} label="Search" />
            </div>

            {/* ── Inline error — social failures never touch the game UI ─ */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden px-3 pt-3"
                >
                  <div className="bg-red-500/90 border-[3px] border-white rounded-2xl p-2.5 flex gap-2 items-center text-white font-rounded font-bold text-xs shadow-[0_5px_0_0_rgba(0,0,0,0.3)]">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Body ────────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
              {tab === 'friends' && (
                <>
                  {!ready ? (
                    <Skeleton />
                  ) : orderedFriends.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No friends yet"
                      hint="Search for a player by username, tag or Player ID to send your first request."
                      action={{ label: 'Find players', onClick: () => setTab('search') }}
                    />
                  ) : (
                    <AnimatePresence initial={false}>
                      {orderedFriends.map((friend) => (
                        <FriendCard
                          key={friend.profileId}
                          friend={friend}
                          presence={presenceOf(presence, friend)}
                          invitedUntil={sentInvites[friend.profileId]}
                          now={now}
                          canInvite={inRoom}
                          onOpenProfile={handleOpenProfile}
                          onInvite={handleInvite}
                          onJoin={handleJoin}
                          onRemove={handleRemove}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </>
              )}

              {tab === 'requests' && (
                <>
                  {incoming.length === 0 && outgoing.length === 0 ? (
                    <EmptyState
                      icon={UserCheck}
                      title="No pending requests"
                      hint="Requests you send and receive show up here."
                    />
                  ) : (
                    <>
                      {incoming.length > 0 && (
                        <>
                          <GroupLabel>Incoming</GroupLabel>
                          <AnimatePresence initial={false}>
                            {incoming.map((req) => (
                              <PlayerRow
                                key={req.profileId}
                                player={req}
                                presence={presence[req.profileId]}
                                subtitle={`Asked ${formatRelative(req.at, now)}`}
                                now={now}
                                onOpenProfile={handleOpenProfile}
                              >
                                <button
                                  type="button"
                                  onClick={() => acceptFriendRequest(socket, req.profileId)}
                                  className="chip-arcade w-8 h-8 flex items-center justify-center bg-gradient-to-b from-lime-400 to-green-600 text-white cursor-pointer"
                                  aria-label={`Accept ${req.displayName}'s friend request`}
                                  title="Accept"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => declineFriendRequest(socket, req.profileId)}
                                  className="chip-arcade w-8 h-8 flex items-center justify-center bg-white/5 text-white/40 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                                  aria-label={`Decline ${req.displayName}'s friend request`}
                                  title="Decline"
                                >
                                  <X size={14} />
                                </button>
                              </PlayerRow>
                            ))}
                          </AnimatePresence>
                        </>
                      )}

                      {outgoing.length > 0 && (
                        <>
                          <GroupLabel>Sent</GroupLabel>
                          <AnimatePresence initial={false}>
                            {outgoing.map((req) => (
                              <PlayerRow
                                key={req.profileId}
                                player={req}
                                presence={presence[req.profileId]}
                                subtitle={`Sent ${formatRelative(req.at, now)}`}
                                now={now}
                                onOpenProfile={handleOpenProfile}
                              >
                                <button
                                  type="button"
                                  onClick={() => cancelFriendRequest(socket, req.profileId)}
                                  className="chip-arcade px-2.5 h-8 flex items-center gap-1.5 bg-white/5 text-white/50 hover:text-white transition-colors cursor-pointer font-rounded text-[0.66rem] font-bold uppercase"
                                  aria-label={`Cancel request to ${req.displayName}`}
                                >
                                  <Clock size={12} /> Cancel
                                </button>
                              </PlayerRow>
                            ))}
                          </AnimatePresence>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {tab === 'search' && (
                <>
                  <div className="relative shrink-0">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Username, #tag or Player ID"
                      maxLength={64}
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      aria-label="Search for players"
                      className="w-full bg-white/10 border-[3px] border-white/60 rounded-2xl pl-10 pr-3 py-2.5 text-white placeholder-white/40 font-rounded font-bold text-sm focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all"
                    />
                  </div>

                  {query.trim() === '' ? (
                    <EmptyState
                      icon={Search}
                      title="Find players"
                      hint="Search by username or Player ID. Names can repeat — the #ID on each result is unique."
                    />
                  ) : searchLoading && searchResults.length === 0 ? (
                    <Skeleton />
                  ) : searchResults.length === 0 ? (
                    <EmptyState icon={Search} title="No players found" hint="Check the spelling, or try their full Player ID." />
                  ) : (
                    <AnimatePresence initial={false}>
                      {searchResults.map((result) => (
                        <PlayerRow
                          key={result.profileId}
                          player={result}
                          presence={presence[result.profileId]}
                          now={now}
                          onOpenProfile={handleOpenProfile}
                        >
                          <RelationshipAction
                            relationship={result.relationship}
                            displayName={result.displayName}
                            onAdd={() => sendFriendRequest(socket, result.profileId)}
                            onAccept={() => acceptFriendRequest(socket, result.profileId)}
                          />
                        </PlayerRow>
                      ))}
                    </AnimatePresence>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ---------------------------------------------------------------------------
// Small local pieces.
// ---------------------------------------------------------------------------

function TabButton({
  active, onClick, icon: Icon, label, count, highlight = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`chip-arcade flex-1 flex items-center justify-center gap-1.5 py-2 font-rounded font-bold text-[0.68rem] uppercase tracking-wide transition-colors cursor-pointer ${
        active
          ? 'bg-gradient-to-b from-yellow-400 to-amber-600 text-black'
          : 'bg-white/5 text-white/55 hover:text-white hover:bg-white/10'
      }`}
    >
      <Icon size={13} />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span
          className={`min-w-[1.15rem] h-[1.15rem] px-1 rounded-full flex items-center justify-center font-arcade text-[0.6rem] ${
            active ? 'bg-black/25 text-black' : highlight ? 'bg-rose-500 text-white' : 'bg-white/15 text-white/70'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** The one action a search row offers, chosen from the SERVER's relationship. */
function RelationshipAction({
  relationship, displayName, onAdd, onAccept,
}: {
  relationship: RelationshipState;
  displayName: string;
  onAdd: () => void;
  onAccept: () => void;
}) {
  switch (relationship) {
    case 'self':
      return <Pill>You</Pill>;
    case 'friends':
      return (
        <Pill tone="lime">
          <UserCheck size={12} /> Friends
        </Pill>
      );
    case 'request-sent':
      return (
        <Pill tone="amber">
          <Clock size={12} /> Sent
        </Pill>
      );
    case 'request-received':
      return (
        <button
          type="button"
          onClick={onAccept}
          className="chip-arcade px-2.5 h-8 flex items-center gap-1.5 bg-gradient-to-b from-lime-400 to-green-600 text-white cursor-pointer font-rounded text-[0.66rem] font-bold uppercase"
          aria-label={`Accept ${displayName}'s friend request`}
        >
          <Check size={12} /> Accept
        </button>
      );
    case 'blocked':
    case 'blocked-by':
      return (
        <Pill>
          <Ban size={12} /> Blocked
        </Pill>
      );
    default:
      return (
        <button
          type="button"
          onClick={onAdd}
          className="chip-arcade w-8 h-8 flex items-center justify-center bg-gradient-to-b from-sky-500 to-blue-700 text-white cursor-pointer"
          aria-label={`Send ${displayName} a friend request`}
          title="Add friend"
        >
          <UserPlus size={14} />
        </button>
      );
  }
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'lime' | 'amber' }) {
  const look =
    tone === 'lime' ? 'text-lime-300 bg-lime-500/12' : tone === 'amber' ? 'text-amber-300 bg-amber-500/12' : 'text-white/40 bg-white/5';
  return (
    <span className={`chip-arcade px-2.5 h-8 flex items-center gap-1.5 font-rounded text-[0.66rem] font-bold uppercase ${look}`}>
      {children}
    </span>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-arcade text-[0.68rem] uppercase tracking-wide text-white/45 px-1 pt-1.5 first:pt-0">
      {children}
    </h3>
  );
}

function EmptyState({
  icon: Icon, title, hint, action,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="chip-arcade bg-white/5 flex flex-col items-center gap-2 py-8 px-5 text-center my-auto">
      <Icon size={26} className="text-white/25" />
      <span className="font-arcade text-sm text-white/70 uppercase tracking-wide">{title}</span>
      <span className="font-rounded text-[0.72rem] text-white/40 leading-relaxed max-w-[16rem]">{hint}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="btn-arcade mt-1.5 bg-gradient-to-b from-sky-500 to-blue-700 text-white px-4 py-2 text-[0.68rem] uppercase cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Loading placeholder — three inert rows at the real row height, so the panel
 *  doesn't jump when the data lands. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="chip-arcade bg-white/5 flex items-center gap-3 py-2.5 px-3 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-2.5 w-2/5 rounded-full bg-white/10" />
            <div className="h-2 w-1/4 rounded-full bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default FriendsPanel;
