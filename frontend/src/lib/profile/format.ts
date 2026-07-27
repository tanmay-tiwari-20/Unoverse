/**
 * Display formatters for the profile UI. Pure functions — no server truth here,
 * just presentation of values the server already computed.
 */

/** "0%"–"100%" from a 0–1 win rate. */
export function formatWinRate(rate: number): string {
  return `${Math.round((Number.isFinite(rate) ? rate : 0) * 100)}%`;
}

/** Compact play-time, e.g. "3h 12m", "42m", "18s", "0m". */
export function formatPlayTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Match duration, e.g. "12m 04s", "45s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** Absolute date, e.g. "Jul 27, 2026". */
export function formatDate(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "—";
  return new Date(epochMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Relative "last played", e.g. "just now", "3h ago", "2d ago", or a date. */
export function formatRelative(epochMs: number, now: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "—";
  const diff = Math.max(0, now - epochMs);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(epochMs);
}

/** Ordinal placement, e.g. "1st", "2nd", "3rd", "4th". */
export function formatPlacement(place: number): string {
  if (!Number.isFinite(place) || place <= 0) return "—";
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1: return `${place}st`;
    case 2: return `${place}nd`;
    case 3: return `${place}rd`;
    default: return `${place}th`;
  }
}

/** Average finish from placement aggregates, e.g. "1.8" or "—" when no data. */
export function formatAvgPlacement(sum: number, count: number): string {
  if (!count) return "—";
  return (sum / count).toFixed(1);
}
