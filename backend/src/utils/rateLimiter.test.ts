import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocketRateLimiter } from './rateLimiter';

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
