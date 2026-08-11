'use client';

/**
 * ============================================================================
 *  Platform gameplay + loading lifecycle.
 * ============================================================================
 *
 * Platforms want to know two things: when the game is genuinely LOADING, and
 * when the player is genuinely PLAYING. Both are reported from here so the
 * start/stop pairs live in one file and cannot drift apart — the failure mode
 * for these APIs is an unbalanced pair (a `loadingStart` with no stop leaves the
 * platform showing a spinner forever), and that is exactly the bug that appears
 * when calls are scattered across components.
 *
 * Both hooks are no-ops on web.
 */

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getPlatform } from '../lib/platform';

/**
 * Which statuses count as active gameplay.
 *
 * `awaiting_color_selection` and `awaiting_swap_target` ARE gameplay: the player
 * is mid-decision with a card already committed, and the turn timer is running.
 * Treating them as a pause would report a stop-start pair on every wild card.
 */
const isActiveGameplay = (status: string): boolean =>
  status === 'playing' ||
  status === 'awaiting_color_selection' ||
  status === 'awaiting_swap_target';

/**
 * Report active gameplay to the platform, following `gameStatus`.
 *
 * Mounted once at the table. Deliberately NOT wired to window blur or tab
 * visibility: Unoverse is real-time multiplayer, so a player who alt-tabs is
 * still very much in a live game — their turn timer keeps running and the table
 * does not wait. Reporting a pause there would be a lie about the session.
 */
export const usePlatformGameplayLifecycle = (): void => {
  const gameStatus = useGameStore((s) => s.gameStatus);
  const activeRef = useRef(false);

  useEffect(() => {
    const active = isActiveGameplay(gameStatus);
    if (active === activeRef.current) return;

    activeRef.current = active;
    const platform = getPlatform();
    if (active) platform.gameplayStart();
    else platform.gameplayStop();
  }, [gameStatus]);

  // Leaving the table ends gameplay however it happened — exit button, room
  // closed, navigation, a crash boundary unmounting the tree.
  useEffect(() => {
    return () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      getPlatform().gameplayStop();
    };
  }, []);
};

/**
 * Bracket a loading span, keyed so each new key opens exactly one span.
 *
 * `loadingStop` must fire on SETTLE rather than success. Unoverse's asset
 * preloads are best-effort with procedural fallbacks — a missing `.glb` still
 * yields a playable table — so waiting for success would leave the platform
 * believing we never finished loading whenever an optional asset failed.
 *
 * @param key    identity of the thing being loaded; a new value starts a new
 *               span, `null` means nothing is loading.
 * @param work   produces the promises to wait on. Rejections are absorbed.
 */
export const usePlatformLoadingSpan = (
  key: string | null | undefined,
  work: () => Promise<unknown>[],
): void => {
  // Held in a ref so a caller passing an inline array cannot restart the span on
  // every render — the key alone decides when a new span begins. Refreshed in an
  // effect declared BEFORE the span effect, so a key change sees the current
  // closure rather than the one captured on mount.
  const workRef = useRef(work);
  useEffect(() => {
    workRef.current = work;
  });

  useEffect(() => {
    if (!key) return;

    let stopped = false;
    const platform = getPlatform();
    platform.loadingStart();

    const stop = () => {
      if (stopped) return;
      stopped = true;
      platform.loadingStop();
    };

    void Promise.allSettled(workRef.current()).then(stop);

    // Unmounting mid-load still closes the span; an abandoned "loading" is the
    // one state we must never leave the platform in.
    return stop;
  }, [key]);
};
