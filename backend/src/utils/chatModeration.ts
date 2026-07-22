/**
 * Lightweight server-side chat moderation.
 *
 * Applied to every `send-chat` payload before broadcast:
 *   1. Trim + collapse whitespace
 *   2. Enforce max length (truncate, not reject)
 *   3. Reject empty / whitespace-only messages
 *   4. Replace blocked words with asterisks
 *   5. Detect repeated spam (same text N times in a sliding window per sender)
 *
 * All thresholds come from CHAT_CONFIG so they're env-tunable without code changes.
 */

import { CHAT_CONFIG } from '../config/serverConfig';

/** Per-sender recent-message ring buffer for spam detection. */
const senderHistory = new Map<string, string[]>();

/** Build a regex that matches any blocked word as a whole word (case-insensitive). */
function buildBlocklistRegex(words: string[]): RegExp | null {
  if (words.length === 0) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

const blocklistRegex = buildBlocklistRegex(CHAT_CONFIG.blockedWords);

/**
 * Moderate a raw chat message from `senderId`.
 *
 * Returns `{ ok: true, text }` with the sanitized text, or
 * `{ ok: false, reason }` when the message should be silently dropped.
 */
export function moderateChat(
  senderId: string,
  rawText: unknown
): { ok: true; text: string } | { ok: false; reason: string } {
  if (typeof rawText !== 'string') return { ok: false, reason: 'invalid' };

  // 1. Trim + collapse internal whitespace runs to a single space.
  let text = rawText.replace(/\s+/g, ' ').trim();

  // 2. Reject empty.
  if (!text) return { ok: false, reason: 'empty' };

  // 3. Truncate to max length.
  if (text.length > CHAT_CONFIG.maxLength) {
    text = text.slice(0, CHAT_CONFIG.maxLength);
  }

  // 4. Profanity filter — replace matched words with asterisks of equal length.
  if (blocklistRegex) {
    blocklistRegex.lastIndex = 0;
    text = text.replace(blocklistRegex, (match) => '*'.repeat(match.length));
  }

  // 5. Spam / repeat detection.
  const history = senderHistory.get(senderId) ?? [];
  const normalized = text.toLowerCase();
  const repeatCount = history.filter((m) => m === normalized).length;
  if (repeatCount >= CHAT_CONFIG.repeatLimit) {
    return { ok: false, reason: 'spam' };
  }

  // Slide the window: keep only the last `dedupeWindow` messages.
  history.push(normalized);
  if (history.length > CHAT_CONFIG.dedupeWindow) history.shift();
  senderHistory.set(senderId, history);

  return { ok: true, text };
}

/** Call on socket disconnect to free the sender's history entry. */
export function clearSenderHistory(senderId: string): void {
  senderHistory.delete(senderId);
}
