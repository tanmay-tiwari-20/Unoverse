import { describe, it, expect } from 'vitest';
import { moderateChat, clearSenderHistory } from './chatModeration';

/**
 * The moderation layer runs on every send-chat before broadcast. It sanitizes
 * (trim/collapse/length), filters profanity by asterisking (never rejecting the
 * whole message), and drops empty / repeated-spam messages.
 */

describe('moderateChat', () => {
  it('trims and collapses excessive whitespace', () => {
    const r = moderateChat('s1', '   hello     world   ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('hello world');
  });

  it('rejects empty / whitespace-only messages', () => {
    expect(moderateChat('s-empty', '     ').ok).toBe(false);
    expect(moderateChat('s-empty', '\n\t').ok).toBe(false);
  });

  it('rejects a non-string payload', () => {
    expect(moderateChat('s2', 123 as unknown).ok).toBe(false);
  });

  it('truncates to the max length instead of rejecting', () => {
    const r = moderateChat('s3', 'a'.repeat(5000));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.length).toBeLessThanOrEqual(300);
  });

  it('asterisks blocked words but keeps the message', () => {
    const r = moderateChat('s4', 'you are a shit player');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).not.toContain('shit');
      expect(r.text).toContain('****');
      expect(r.text).toContain('player');
    }
  });

  it('matches blocked words case-insensitively', () => {
    const r = moderateChat('s5', 'SHIT happens');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.startsWith('****')).toBe(true);
  });

  it('does not censor substrings inside larger words', () => {
    // 'dick' is blocked, but 'dickens' should be untouched (word-boundary match).
    const r = moderateChat('s6', 'Charles Dickens wrote books');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('Dickens');
  });

  it('drops repeated spam from the same sender', () => {
    const sender = 'spammer';
    clearSenderHistory(sender);
    expect(moderateChat(sender, 'spam').ok).toBe(true); // 1st
    expect(moderateChat(sender, 'spam').ok).toBe(true); // 2nd
    expect(moderateChat(sender, 'spam').ok).toBe(true); // 3rd (repeatCount now 3)
    // 4th identical message: repeatCount >= limit -> dropped.
    expect(moderateChat(sender, 'spam').ok).toBe(false);
    // A different message from the same sender still passes.
    expect(moderateChat(sender, 'something else').ok).toBe(true);
  });

  it('keeps spam history isolated per sender', () => {
    clearSenderHistory('a');
    clearSenderHistory('b');
    for (let i = 0; i < 3; i++) moderateChat('a', 'hi');
    // 'b' has its own history and is unaffected by 'a'.
    expect(moderateChat('b', 'hi').ok).toBe(true);
  });
});
