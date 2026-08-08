'use client';

/**
 * ============================================================================
 *  FriendsPanel — the friends drawer.
 * ============================================================================
 *
 * Three tabs over one social store: Friends, Requests (incoming + outgoing) and
 * Search. Docks to the right edge on anything wider than a phone and rises as a
 * bottom sheet on a phone — two layouts, not one rotated — and sits in the shared
 * `Modal` shell, so its chrome, motion, focus handling and safe-area behaviour
 * are literally the same code the settings, profile and results screens use.
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Check, Search, UserPlus, Users, X, Clock, UserCheck, Ban,
} from 'lucide-react';
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
import { isLive } from './PresenceDot';
import {
  Badge, Button, EmptyState, IconButton, Modal, ModalBody, ModalHeader,
  SectionLabel, Skeleton, TabBar,
} from '../ui/kit';
import { formatRelative } from '../../lib/profile/format';
import type { RelationshipState } from '../../types/social';

type Tab = 'friends' | 'requests' | 'search';

/** Debounce before a keystroke becomes a server search. Long enough that typing
 *  a full username is one request, short enough to feel instant. */
const SEARCH_DEBOUNCE_MS = 260;

export const FriendsPanel: React.FC = () => {
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
  // Escape key (which the Modal shell routes here) — so re-opening starts clean.
  // `clearSearch` is left to the debounce effect below, which fires the moment
  // the query becomes empty; calling it twice would be redundant.
  const close = useCallback(() => {
    setQuery('');
    setPanelOpen(false);
  }, [setPanelOpen]);

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
  // Header subtitle: the number a player actually cares about on open is not
  // "how many friends" but "how many can I play with right now".
  const onlineCount = useMemo(
    () => orderedFriends.filter((f) => isLive(presenceOf(presence, f).status)).length,
    [orderedFriends, presence]
  );

  const handleOpenProfile = useCallback((profileId: string) => openProfile(profileId), [openProfile]);
  const handleInvite = useCallback((id: string) => inviteFriend(socket, id), [socket]);
  const handleJoin = useCallback((id: string) => joinFriend(socket, id), [socket]);
  const handleRemove = useCallback((id: string) => removeFriend(socket, id), [socket]);

  const tabs = useMemo(
    () =>
      [
        { value: 'friends' as const, label: 'Friends', icon: <Users size={12} aria-hidden="true" />, badge: friends.length },
        { value: 'requests' as const, label: 'Requests', icon: <UserCheck size={12} aria-hidden="true" />, badge: pendingCount },
        { value: 'search' as const, label: 'Find', icon: <Search size={12} aria-hidden="true" /> },
      ],
    [friends.length, pendingCount]
  );

  return (
    <Modal
      open={open}
      onClose={close}
      variant="drawer"
      size="sm"
      className="ui-panel-drawer"
      labelledBy="friends-panel-title"
      zIndex={1900}
    >
      <ModalHeader
        id="friends-panel-title"
        title="Friends"
        subtitle={
          ready
            ? `${onlineCount} online · ${friends.length} total`
            : 'Loading your list…'
        }
        icon={<Users size={16} aria-hidden="true" />}
        onClose={close}
        closeLabel="Close friends panel"
      />

      {/* Tabs (+ the search field, which belongs to one tab and so stays pinned
          with them rather than scrolling away with the results). */}
      <div className="flex shrink-0 flex-col gap-2 border-b-2 border-white/10 px-3 py-2.5 short:py-2">
        <TabBar value={tab} onChange={setTab} items={tabs} label="Friends sections" />

        {tab === 'search' && (
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              aria-hidden="true"
            />
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
              className="ui-input py-2 pl-9 pr-9 text-[13px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline error — social failures never touch the game UI. */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 overflow-hidden px-3 pt-2"
            role="alert"
          >
            <div className="font-rounded flex items-center gap-2 rounded-xl border-2 border-rose-400/50 bg-rose-500/20 px-2.5 py-2 text-[11px] font-bold text-rose-100">
              <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModalBody
        id={`tabpanel-${tab}`}
        className="ui-body-tight ui-tab-in"
        key={tab}
      >
        {tab === 'friends' &&
          (!ready ? (
            <RowSkeletons />
          ) : orderedFriends.length === 0 ? (
            <EmptyState
              icon={<Users size={26} />}
              title="No friends yet"
              hint="Search by username or Player ID to send your first request."
              action={
                <Button tone="info" size="sm" icon={<Search size={13} />} onClick={() => setTab('search')}>
                  Find players
                </Button>
              }
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
          ))}

        {tab === 'requests' &&
          (incoming.length === 0 && outgoing.length === 0 ? (
            <EmptyState
              icon={<UserCheck size={26} />}
              title="No pending requests"
              hint="Requests you send and receive show up here."
            />
          ) : (
            <>
              {incoming.length > 0 && (
                <>
                  <SectionLabel trailing={<Badge tone="bad">{incoming.length}</Badge>}>
                    Incoming
                  </SectionLabel>
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
                        <Button
                          tone="success"
                          size="sm"
                          onClick={() => acceptFriendRequest(socket, req.profileId)}
                          icon={<Check size={13} />}
                          aria-label={`Accept ${req.displayName}'s friend request`}
                        >
                          <span className="tiny:hidden">Accept</span>
                        </Button>
                        <IconButton
                          onClick={() => declineFriendRequest(socket, req.profileId)}
                          label={`Decline ${req.displayName}'s friend request`}
                          title="Decline"
                          className="hover:!border-rose-400/40 hover:!bg-rose-500/15 hover:!text-rose-300"
                        >
                          <X size={14} />
                        </IconButton>
                      </PlayerRow>
                    ))}
                  </AnimatePresence>
                </>
              )}

              {outgoing.length > 0 && (
                <>
                  <SectionLabel trailing={<Badge>{outgoing.length}</Badge>}>Sent</SectionLabel>
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
                        <Badge tone="gold" icon={<Clock size={10} aria-hidden="true" />}>
                          Pending
                        </Badge>
                        <IconButton
                          onClick={() => cancelFriendRequest(socket, req.profileId)}
                          label={`Cancel friend request to ${req.displayName}`}
                          title="Cancel request"
                          className="hover:!border-rose-400/40 hover:!bg-rose-500/15 hover:!text-rose-300"
                        >
                          <X size={14} />
                        </IconButton>
                      </PlayerRow>
                    ))}
                  </AnimatePresence>
                </>
              )}
            </>
          ))}

        {tab === 'search' &&
          (query.trim() === '' ? (
            <EmptyState
              icon={<Search size={26} />}
              title="Find players"
              hint="Names can repeat — the #ID on every result is unique."
            />
          ) : searchLoading && searchResults.length === 0 ? (
            <RowSkeletons />
          ) : searchResults.length === 0 ? (
            <EmptyState
              icon={<Search size={26} />}
              title="No players found"
              hint="Check the spelling, or try their full Player ID."
            />
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
          ))}
      </ModalBody>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Small local pieces.
// ---------------------------------------------------------------------------

/** The one action a search row offers, chosen from the SERVER's relationship.
 *  Settled states are badges, not buttons — a disabled button that says
 *  "Friends" invites a click that can't do anything. */
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
      return <Badge>You</Badge>;
    case 'friends':
      return (
        <Badge tone="good" icon={<UserCheck size={10} aria-hidden="true" />}>
          Friends
        </Badge>
      );
    case 'request-sent':
      return (
        <Badge tone="gold" icon={<Clock size={10} aria-hidden="true" />}>
          Sent
        </Badge>
      );
    case 'request-received':
      return (
        <Button
          tone="success"
          size="sm"
          onClick={onAccept}
          icon={<Check size={13} />}
          aria-label={`Accept ${displayName}'s friend request`}
        >
          <span className="tiny:hidden">Accept</span>
        </Button>
      );
    case 'blocked':
    case 'blocked-by':
      return (
        <Badge icon={<Ban size={10} aria-hidden="true" />}>Blocked</Badge>
      );
    default:
      return (
        <Button
          tone="info"
          size="sm"
          onClick={onAdd}
          icon={<UserPlus size={13} />}
          aria-label={`Send ${displayName} a friend request`}
        >
          <span className="tiny:hidden">Add</span>
        </Button>
      );
  }
}

/** Loading placeholder — three inert rows at the real row height, so the panel
 *  doesn't jump when the data lands. */
function RowSkeletons() {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--ui-gap-tight)' }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[52px]" />
      ))}
    </div>
  );
}

export default FriendsPanel;
