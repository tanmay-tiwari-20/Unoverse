'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getPlatform } from '../lib/platform';
import { DEFAULT_HOUSE_RULES } from '../lib/houseRules';
import type { Room } from '../types/game';

/**
 * ============================================================================
 *  Publish the current room to the platform.
 * ============================================================================
 *
 * CrazyGames advertises the room and routes invite acceptances into it, so what
 * we publish has to match what the server would actually allow. This derives its
 * answer from the SAME room snapshot the UI renders, on every change, rather
 * than firing `updateRoom()` from individual socket listeners — a set of
 * scattered calls drifts the moment one of them is missed, and "joinable"
 * pointing at a full or started room is a bad experience the platform blames the
 * game for.
 *
 * `isJoinable` mirrors the backend join gate (`getCapacityInfo` + the lobby
 * check): a free SEAT in a room that has not started.
 *
 * SPECTATORS ARE DELIBERATELY NOT COUNTED AS JOINABLE. A room that has started
 * can still be watched, but someone accepting a game invite expects to play, and
 * landing them in a spectator seat mid-match reads as a broken invite.
 *
 * No-op on web: every method here belongs to the platform port.
 */
const isRoomJoinable = (room: Room | null | undefined): boolean => {
  if (!room || room.status !== 'lobby') return false;
  const maxPlayers = room.houseRules?.maxPlayers ?? DEFAULT_HOUSE_RULES.maxPlayers;
  return room.players.length < maxPlayers;
};

export const usePlatformRoomPublisher = (): void => {
  const room = useGameStore((s) => s.room);

  const code = room?.code ?? null;
  const joinable = isRoomJoinable(room);

  // Publishing on every store write would spam the SDK with identical payloads
  // (the room object is replaced on each game update), so only real transitions
  // are forwarded.
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    const platform = getPlatform();

    if (!code) {
      if (lastRef.current !== null) {
        lastRef.current = null;
        platform.clearRoom();
      }
      return;
    }

    const signature = `${code}:${joinable}`;
    if (signature === lastRef.current) return;
    lastRef.current = signature;

    platform.updateRoom({
      roomId: code,
      isJoinable: joinable,
      // Mirrors the `?room=CODE` param the web build already uses for invites, so
      // both platforms hand the join flow the same shape.
      inviteParams: { room: code },
    });
  }, [code, joinable]);

  // Leaving the table (or closing the tab mid-match) must withdraw the room, or
  // the platform keeps advertising a table nobody can join.
  useEffect(
    () => () => {
      if (lastRef.current === null) return;
      lastRef.current = null;
      getPlatform().clearRoom();
    },
    [],
  );
};
