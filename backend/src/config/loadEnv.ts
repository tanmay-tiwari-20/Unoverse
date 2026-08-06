/**
 * ============================================================================
 *  Environment bootstrap — MUST be the first import in the process.
 * ============================================================================
 *
 * `process.loadEnvFile()` mutates process.env, so it has to run BEFORE any
 * module that reads process.env at load time. Several modules do exactly that
 * (serverConfig builds its rate-limit / chat / sweep constants at module scope),
 * and because ES import statements are hoisted — and compile to `require()`
 * calls that run top-to-bottom before the rest of the file body — calling
 * loadEnvFile() *inside* index.ts was already too late: every module-level
 * `process.env.X` read had happened during the import phase.
 *
 * Importing this file first (`import './config/loadEnv'`) fixes the ordering for
 * the whole process: this module has no imports of its own, so its side effect
 * runs before any sibling module is evaluated.
 *
 * Safe to import more than once — Node caches modules, so the file loads once.
 */

/** True when a .env file was found and applied. Exported for diagnostics. */
export let envFileLoaded = false;

try {
  // Node >= 20.12 / 21.7. Loads ./.env relative to the process CWD (backend/).
  process.loadEnvFile();
  envFileLoaded = true;
} catch {
  // No .env file (or an unsupported Node). Real env vars still apply, which is
  // exactly how production works — hosts inject config directly.
  envFileLoaded = false;
}
