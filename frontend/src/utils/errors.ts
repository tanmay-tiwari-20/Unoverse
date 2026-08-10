/**
 * Narrow an unknown thrown value to a displayable message.
 *
 * `catch` binds `unknown`, so this is the one place that decides what a caught
 * value is worth showing a player: a real `Error` message when there is one,
 * and the caller's fallback for everything else (rejected non-Errors, thrown
 * strings, network failures with empty messages).
 */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
