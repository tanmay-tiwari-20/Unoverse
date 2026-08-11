'use client';

/**
 * ============================================================================
 *  End of MATCH — the celebration, and the only safe place for an ad.
 * ============================================================================
 *
 * Both things this hook does are gated on the same moment: `gameStatus` is
 * `'ended'` AND the match itself is over (`match.matchWinnerName` is set, which
 * the server only fills once someone reached the target score). A round ending
 * inside a live match is deliberately NOT that moment.
 *
 * WHY MATCH END AND NOTHING ELSE:
 *
 *   • HAPPYTIME fires once per match win by the LOCAL player. Rounds inside a
 *     match are frequent and fast — firing there would spend the platform's
 *     celebration on routine progress and make it meaningless.
 *   • THE AD runs between matches, never between rounds. Unoverse is real-time
 *     multiplayer: the table does not pause for one player, so an ad while the
 *     group is mid-match would either cost that player their turns or interrupt
 *     everyone. At match end the local player holds no turn and the next round
 *     needs an explicit press from the host, so nothing is running underneath
 *     that this player must respond to.
 *
 * GAMEPLAY PAIRING IS NOT REPEATED HERE, on purpose. `'ended'` is not active
 * gameplay, so `usePlatformGameplayLifecycle` has ALREADY reported
 * `gameplayStop()` for this transition, and it reports `gameplayStart()` again
 * when the next round reaches `'playing'`. Adding a second stop/start pair
 * around the ad would unbalance the very API whose failure mode is an
 * unbalanced pair. This hook is mounted after that one so the ordering is a
 * property of the code rather than a hope. Audio muting during the ad is
 * handled inside the adapter — including the WebRTC voice path — so it cannot
 * be forgotten at a call site.
 *
 * No-op on web: `CAPABILITIES.ads` is false and the web adapter's `happytime`
 * does nothing.
 */

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getPlatform, CAPABILITIES } from '../lib/platform';

/**
 * Ad-blocker check, made ONCE per session and shared by every match end.
 *
 * Cached as a promise rather than a boolean so concurrent callers await the same
 * check instead of racing it. Resolving `true` means we stop asking for ads
 * entirely: requests behind a blocker cannot succeed, and retrying each match
 * would be noise in the platform's own metrics.
 */
let adblockCheck: Promise<boolean> | null = null;

const hasAdblock = (): Promise<boolean> => {
  adblockCheck ??= getPlatform()
    .hasAdblock()
    .catch(() => false);
  return adblockCheck;
};

/**
 * Celebrate a match win and show the between-matches ad.
 *
 * Mounted once at the table, directly after `usePlatformGameplayLifecycle()`.
 */
export const usePlatformMatchEnd = (): void => {
  const gameStatus = useGameStore((s) => s.gameStatus);
  const matchWinnerName = useGameStore((s) => s.match?.matchWinnerName);
  const matchWinnerUid = useGameStore((s) => s.match?.matchWinnerUid);
  const playerUid = useGameStore((s) => s.player?.uid);

  // Fires on the TRANSITION into match-over and re-arms the moment the table
  // leaves that state. Keyed on the transition rather than on match identity
  // because two consecutive matches can legitimately end with the same winner
  // after the same number of rounds — an identity key would silently skip the
  // second one.
  const firedRef = useRef(false);

  useEffect(() => {
    const matchOver = gameStatus === 'ended' && Boolean(matchWinnerName);

    if (!matchOver) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;

    const platform = getPlatform();

    // "Did I win?" is a SEAT comparison, matching how the end-of-round dialog
    // decides it. Two players may share a display name, and a name comparison
    // would celebrate an opponent's win on this client. A bot winning simply
    // fails this test, so bot wins need no special case.
    if (playerUid && matchWinnerUid && matchWinnerUid === playerUid) {
      platform.happytime();
    }

    if (!CAPABILITIES.ads) return;

    void (async () => {
      if (await hasAdblock()) return;
      // Resolves whether the ad played, was unfilled, was on cooldown, or
      // errored — there is one resume path and nothing is ever rewarded, so
      // there is deliberately nothing to branch on here.
      await platform.showMidgameAd({});
    })();
  }, [gameStatus, matchWinnerName, matchWinnerUid, playerUid]);
};
