/**
 * Tiny zero-dependency leveled logger.
 *
 * Replaces raw console.* calls so we can keep per-move diagnostics in
 * development without flooding production logs (and without paying the
 * string-building cost on every game broadcast).
 *
 * Level resolution:
 *   - LOG_LEVEL env var ('debug' | 'info' | 'warn' | 'error' | 'silent') wins
 *   - otherwise: 'debug' in development, 'info' in production
 *
 * Usage:
 *   import { logger } from './utils/logger';
 *   logger.debug('[GAME_STATE_UPDATED]', { roomCode, turnPlayerId });
 *   logger.info('Server running on port', port);
 *   logger.error('[Socket] Play card error:', err.message);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveLevel(): LogLevel {
  const fromEnv = (process.env.LOG_LEVEL || '').toLowerCase();
  if (fromEnv in LEVEL_WEIGHT) return fromEnv as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const activeLevel = resolveLevel();
const threshold = LEVEL_WEIGHT[activeLevel];

const enabled = (level: LogLevel) => LEVEL_WEIGHT[level] >= threshold;

export const logger = {
  level: activeLevel,
  debug: (...args: unknown[]) => { if (enabled('debug')) console.debug(...args); },
  info: (...args: unknown[]) => { if (enabled('info')) console.info(...args); },
  warn: (...args: unknown[]) => { if (enabled('warn')) console.warn(...args); },
  error: (...args: unknown[]) => { if (enabled('error')) console.error(...args); },
};
