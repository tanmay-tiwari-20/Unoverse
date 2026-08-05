'use client';

/**
 * ============================================================================
 *  useNow — one shared, subscribable wall clock for relative timestamps.
 * ============================================================================
 *
 * Anything that renders "2m ago" or an invite countdown needs the current time,
 * but `Date.now()` is an impure function: calling it during render produces a
 * value that changes when the component happens to re-render, which React's
 * compiler rightly rejects. Reading it in an effect and calling `setState` is
 * the other obvious move, and that is a cascading render.
 *
 * The clock is genuinely an EXTERNAL system — it changes on its own, without
 * React asking — so it belongs behind `useSyncExternalStore`. That gives a
 * value which is stable within a render pass, consistent across every component
 * reading it, and correct on the server (where the snapshot is a fixed epoch, so
 * SSR and the first client paint agree instead of hydration-mismatching).
 *
 * One timer per distinct interval is shared by every subscriber, so twenty
 * friend rows on a 30s clock cost one `setInterval`, not twenty. When the last
 * subscriber for an interval unmounts the timer is cleared, so a closed drawer
 * costs nothing at all.
 */

import { useCallback, useSyncExternalStore } from 'react';

/** One tick group per interval: the timer, its subscribers, and the last value
 *  handed out. The cached value is what makes the snapshot stable — returning a
 *  fresh `Date.now()` on every call would make React loop forever. */
interface Clock {
  now: number;
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<() => void>;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), timer: null, listeners: new Set() };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function subscribe(intervalMs: number, onChange: () => void): () => void {
  const clock = clockFor(intervalMs);
  clock.listeners.add(onChange);

  // The first subscriber starts the timer. Later ones join the existing one, so
  // the tick stays in lockstep for everybody on this interval.
  if (!clock.timer) {
    clock.timer = setInterval(() => {
      clock.now = Date.now();
      clock.listeners.forEach((l) => l());
    }, intervalMs);
  }

  return () => {
    clock.listeners.delete(onChange);
    if (clock.listeners.size === 0 && clock.timer) {
      clearInterval(clock.timer);
      clock.timer = null;
    }
  };
}

/**
 * The value the server renders with. Fixed rather than `Date.now()` so the
 * server HTML and the first client paint can't disagree; the first real tick
 * (or the first client-side subscribe) replaces it immediately.
 */
const SERVER_NOW = 0;

/**
 * Current epoch milliseconds, re-rendering the caller every `intervalMs`.
 *
 * @param intervalMs How often to tick. Match it to the coarsest unit actually
 *   displayed — 1000 for a second-by-second countdown, 30_000 for "5m ago".
 * @param active Pass `false` when the consumer is hidden (a closed drawer, an
 *   empty toast stack) to unsubscribe and let the shared timer stop. The value
 *   returned is then simply frozen, which is what an off-screen list wants.
 */
export function useNow(intervalMs = 1000, active = true): number {
  const sub = useCallback(
    (onChange: () => void) => (active ? subscribe(intervalMs, onChange) : () => {}),
    [intervalMs, active]
  );

  const snapshot = useCallback(() => clockFor(intervalMs).now, [intervalMs]);

  return useSyncExternalStore(sub, snapshot, () => SERVER_NOW);
}

export default useNow;
