import { BACKEND_URL } from './config';

/** Only an acknowledged server save counts as a submitted report. */
export async function submitBugReport(message: string, roomCode?: string | null): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${BACKEND_URL}/api/report-bug`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.trim(), ...(roomCode ? { roomCode } : {}) }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Failed to send bug report. Please try again.');
    if (typeof data?.id !== 'string' || !data.id) throw new Error('The server did not confirm your report. Please try again.');
    return data.id;
  } finally {
    clearTimeout(timeout);
  }
}
