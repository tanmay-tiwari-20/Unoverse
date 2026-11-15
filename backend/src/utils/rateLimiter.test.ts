import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocketRateLimiter, IP_LIMIT_CONFIG } from './rateLimiter';

/**
 * Token-bucket limiter: a burst up to `capacity` is allowed, further requests in
 * the same instant are rejected, and tokens refill over time. Buckets are
 * independent per (socket, event) and freed on disconnect.
 */

describe('SocketRateLimiter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows a burst up to capacity then throttles', () => {
    const rl = new SocketRateLimiter();
    // send-reaction: capacity 10.
    let allowed = 0;
    for (let i = 0; i < 15; i++) {
      if (rl.consume('sock', 'send-reaction').allowed) allowed++;
    }
    expect(allowed).toBe(10);
    expect(rl.consume('sock', 'send-reaction').allowed).toBe(false);
  });

  it('refills tokens over time', () => {
    const rl = new SocketRateLimiter();
    // Drain send-chat (capacity 6).
    for (let i = 0; i < 6; i++) rl.consume('sock', 'send-chat');
    expect(rl.consume('sock', 'send-chat').allowed).toBe(false);
    // send-chat refills 1.5/sec -> after 2s, ~3 tokens available.
    vi.advanceTimersByTime(2000);
    expect(rl.consume('sock', 'send-chat').allowed).toBe(true);
  });

  it('tracks limits independently per event', () => {
    const rl = new SocketRateLimiter();
    for (let i = 0; i < 6; i++) rl.consume('sock', 'send-chat');
    expect(rl.consume('sock', 'send-chat').allowed).toBe(false);
    // A different event on the same socket is unaffected.
    expect(rl.consume('sock', 'send-reaction').allowed).toBe(true);
  });

  it('tracks limits independently per socket', () => {
    const rl = new SocketRateLimiter();
    for (let i = 0; i < 6; i++) rl.consume('sockA', 'send-chat');
    expect(rl.consume('sockA', 'send-chat').allowed).toBe(false);
    expect(rl.consume('sockB', 'send-chat').allowed).toBe(true);
  });

  it('notifies on throttle for notify-enabled events, paced', () => {
    const rl = new SocketRateLimiter();
    for (let i = 0; i < 6; i++) rl.consume('sock', 'send-chat');
    const first = rl.consume('sock', 'send-chat');
    expect(first.allowed).toBe(false);
    expect(first.notify).toBe(true);
    // Immediate re-throttle should NOT notify again (paced by RATE_LIMIT_NOTIFY_GAP_MS).
    const second = rl.consume('sock', 'send-chat');
    expect(second.notify).toBe(false);
  });

  it('does not notify for silent-drop events', () => {
    const rl = new SocketRateLimiter();
    // webrtc-signal has no notify flag.
    for (let i = 0; i < 200; i++) rl.consume('sock', 'webrtc-signal');
    const r = rl.consume('sock', 'webrtc-signal');
    expect(r.allowed).toBe(false);
    expect(r.notify).toBe(false);
  });

  it('resets a socket bucket after removeSocket', () => {
    const rl = new SocketRateLimiter();
    for (let i = 0; i < 6; i++) rl.consume('sock', 'send-chat');
    expect(rl.consume('sock', 'send-chat').allowed).toBe(false);
    rl.removeSocket('sock');
    // Fresh bucket after cleanup.
    expect(rl.consume('sock', 'send-chat').allowed).toBe(true);
  });
});

describe('reconnect-resistant IP limits', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preserves event buckets across socket disconnects and new identities', () => {
    const rl = new SocketRateLimiter({ ...IP_LIMIT_CONFIG, eventMultiplier: 1 });
    expect(rl.registerSocket('first', '192.0.2.1')).toBe(true);
    for (let i = 0; i < 6; i++) expect(rl.consume('first', 'send-chat').allowed).toBe(true);
    rl.removeSocket('first');
    expect(rl.registerSocket('new', '192.0.2.1')).toBe(true);
    expect(rl.consume('new', 'send-chat').allowed).toBe(false);
    expect(rl.registerSocket('other', '192.0.2.2')).toBe(true);
    expect(rl.consume('other', 'send-chat').allowed).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(rl.consume('new', 'send-chat').allowed).toBe(true);
  });

  it('caps active connections and frees concurrent slots on disconnect', () => {
    const rl = new SocketRateLimiter({ ...IP_LIMIT_CONFIG, maxConnections: 2 });
    expect(rl.registerSocket('a', 'ip')).toBe(true);
    expect(rl.registerSocket('b', 'ip')).toBe(true);
    expect(rl.registerSocket('c', 'ip')).toBe(false);
    rl.removeSocket('a');
    expect(rl.registerSocket('c', 'ip')).toBe(true);
    rl.removeSocket('a'); // Idempotent; cannot manufacture another free slot.
    expect(rl.registerSocket('d', 'ip')).toBe(false);
  });

  it('preserves connection burst limits across disconnects', () => {
    const rl = new SocketRateLimiter({ ...IP_LIMIT_CONFIG, connectionCapacity: 2 });
    expect(rl.registerSocket('a', 'ip')).toBe(true);
    rl.removeSocket('a');
    expect(rl.registerSocket('b', 'ip')).toBe(true);
    rl.removeSocket('b');
    expect(rl.registerSocket('c', 'ip')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(rl.registerSocket('c', 'ip')).toBe(true);
  });

  it('caps aggregate events even when a flood alternates event names', () => {
    const rl = new SocketRateLimiter({ ...IP_LIMIT_CONFIG, totalCapacity: 2 });
    rl.registerSocket('a', 'ip');
    expect(rl.consume('a', 'send-chat').allowed).toBe(true);
    expect(rl.consume('a', 'send-reaction').allowed).toBe(true);
    expect(rl.consume('a', 'play-card').allowed).toBe(false);
  });

  it('bounds retained IP entries and prunes expired inactive ones', () => {
    const rl = new SocketRateLimiter({ ...IP_LIMIT_CONFIG, maxTrackedIps: 1, retentionMs: 1000 });
    rl.registerSocket('a', 'ip');
    rl.removeSocket('a');
    expect(rl.registerSocket('b', 'other-ip')).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rl.registerSocket('b', 'other-ip')).toBe(true);
  });
});
