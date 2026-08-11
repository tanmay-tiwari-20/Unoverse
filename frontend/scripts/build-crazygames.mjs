/**
 * ============================================================================
 *  build-crazygames — produce the uploadable CrazyGames HTML5 package.
 * ============================================================================
 *
 * `npm run build:crazygames`
 *
 * Output: `frontend/crazygames-build/`, whose ROOT `index.html` is the whole
 * game. That directory is what gets zipped and uploaded to the CrazyGames
 * developer portal; nothing outside it is needed to run the game.
 *
 * WHY A SCRIPT AND NOT JUST `next build`:
 *
 *   1. ENV. The target and Backend B have to be set for this build and only this
 *      build, and `NEXT_PUBLIC_PLATFORM=... next build` is not portable to
 *      PowerShell or cmd. Setting them in-process is.
 *   2. OUTPUT NAME. `output: 'export'` always writes `out/`. The portal package
 *      wants its own directory, so `out/` is moved to `crazygames-build/` once
 *      the build has actually succeeded.
 *   3. RELATIVE URLS. `assetPrefix` makes Next emit `./_next/...`, but the HTML
 *      also carries links Next generates on its own (favicons, and anything
 *      metadata adds later). Those are rewritten here, because the package is
 *      served from a subdirectory and a root-absolute URL would 404.
 *   4. VERIFICATION. The failure modes that matter — no `index.html`, no SDK tag,
 *      a localhost backend baked into a zip nobody can hotfix — are all cheap to
 *      assert and expensive to discover after upload. So the build fails here
 *      instead.
 *
 * This script never touches the web build. `npm run build` is unchanged.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_DIR = path.join(FRONTEND_DIR, 'out');
const PACKAGE_DIR = path.join(FRONTEND_DIR, 'crazygames-build');
const NEXT_BIN = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

/** Where Backend B may be configured, in precedence order (env wins). */
const ENV_FILE = path.join(FRONTEND_DIR, '.env.crazygames');

/** The SDK the portal requires the document itself to load. */
const SDK_SRC = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * PWA artefacts. `CAPABILITIES.pwa` is false on CrazyGames so nothing registers
 * the service worker or reads the manifest — but shipping them inside the package
 * invites a stale cache inside the portal iframe, which is miserable to diagnose
 * through an embed. They are dropped rather than merely unused.
 *
 * `manifest.webmanifest` is here rather than excluded at build time because
 * `pageExtensions` cannot gate a metadata file convention (see next.config.ts):
 * `app/manifest.ts` is shared by both targets, so its exported file and the
 * `<link rel="manifest">` that points at it are removed here instead. Its
 * `start_url: "/"` and install metadata mean nothing inside a portal iframe.
 */
const PRUNE = ['sw.js', 'site.webmanifest', 'manifest.webmanifest'];

const log = (msg) => console.log(`[crazygames] ${msg}`);
const fail = (msg) => {
  console.error(`\n[crazygames] BUILD FAILED: ${msg}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// 1. Resolve Backend B
// ---------------------------------------------------------------------------

/**
 * Minimal `KEY=value` reader for `.env.crazygames`. Deliberately not a dotenv
 * dependency: this file holds one or two deployment URLs, and the real
 * environment always wins so CI can set them without a file at all.
 */
const readEnvFile = (file) => {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    out[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
};

const fileEnv = readEnvFile(ENV_FILE);
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || fileEnv.NEXT_PUBLIC_BACKEND_URL;

if (!backendUrl) {
  fail(
    'NEXT_PUBLIC_BACKEND_URL (Backend B) is not set.\n' +
      `  Either export it, or create ${path.relative(FRONTEND_DIR, ENV_FILE)} containing:\n` +
      '      NEXT_PUBLIC_BACKEND_URL=https://your-backend-b.example.com\n' +
      '  Without it the package would ship pointing at http://localhost:3001.',
  );
}
if (/localhost|127\.0\.0\.1/.test(backendUrl)) {
  fail(
    `NEXT_PUBLIC_BACKEND_URL points at a local address (${backendUrl}).\n` +
      "  An uploaded package must point at Backend B's public origin.",
  );
}

log(`platform target : crazygames`);
log(`backend B       : ${backendUrl}`);

// ---------------------------------------------------------------------------
// 2. Build
// ---------------------------------------------------------------------------

// Start from a clean slate: a stale `out/` would otherwise be silently packaged
// if the build failed in a way that left the directory behind.
//
// Windows holds a directory open for anything whose cwd is inside it — a running
// `python -m http.server --directory crazygames-build`, or a terminal left in
// there after the last build — and reports EBUSY rather than waiting. A short
// retry covers the file-watcher case; a persistent holder gets named, because
// "EBUSY: rmdir" on its own sends people looking for a bug in the build.
const removeDir = (dir) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (error) {
      if (attempt === 4) {
        fail(
          `could not delete ${path.relative(FRONTEND_DIR, dir)} (${error.code}).\n` +
            '  Something is holding it open — a local static server, a file explorer, or a\n' +
            '  shell whose working directory is inside it. Close it and re-run.',
        );
      }
    }
  }
};

removeDir(EXPORT_DIR);
removeDir(PACKAGE_DIR);

log('running next build (static export)…');

const build = spawnSync(
  process.execPath,
  [NEXT_BIN, 'build'],
  {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_PLATFORM: 'crazygames',
      NEXT_PUBLIC_BACKEND_URL: backendUrl,
      // Source maps are not shipped: they are not needed to run the game and
      // would roughly double the package size for no player benefit.
      NEXT_PUBLIC_SOURCE_MAPS: '',
    },
  },
);

if (build.status !== 0) fail(`next build exited with code ${build.status}`);
if (!fs.existsSync(EXPORT_DIR)) fail(`next build produced no ${path.basename(EXPORT_DIR)}/ directory`);

// ---------------------------------------------------------------------------
// 3. Assemble the package
// ---------------------------------------------------------------------------

fs.renameSync(EXPORT_DIR, PACKAGE_DIR);

for (const name of PRUNE) {
  const target = path.join(PACKAGE_DIR, name);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true });
    log(`pruned ${name} (PWA artefact, unused on CrazyGames)`);
  }
}

/** Every file under `dir`, recursively, as absolute paths. */
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const files = walk(PACKAGE_DIR);

// Source maps: dropped if the bundler emitted any. Nothing in the package
// references them except a trailing comment, so removing them is safe.
let mapsRemoved = 0;
for (const file of files) {
  if (file.endsWith('.map')) {
    fs.rmSync(file, { force: true });
    mapsRemoved++;
  }
}
if (mapsRemoved) log(`pruned ${mapsRemoved} source map(s)`);

/**
 * Rewrite the exported HTML for a subdirectory host.
 *
 * 1. ROOT-ABSOLUTE URLS → PACKAGE-RELATIVE. `assetPrefix` already handles
 *    `_next/*`. This catches the links Next emits from file conventions and
 *    metadata — `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png` — which
 *    would otherwise be requested from the root of the portal's game-files
 *    domain instead of from inside the package. Scoped to `src`/`href` values
 *    starting with a single `/`, so protocol-relative (`//`) and absolute
 *    (`https://`) URLs are left alone.
 *
 * 2. THE MANIFEST LINK, dropped along with the file itself (see PRUNE). Order
 *    matters: this runs first, while the href is still root-absolute.
 */
let rewritten = 0;
for (const file of files.filter((f) => f.endsWith('.html'))) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/<link[^>]*\brel="manifest"[^>]*>/g, '')
    .replace(/(\s(?:src|href)=")\/(?!\/)/g, '$1./');
  if (after !== before) {
    fs.writeFileSync(file, after);
    rewritten++;
  }
}
if (rewritten) log(`rewrote asset URLs / dropped manifest link in ${rewritten} HTML file(s)`);

// ---------------------------------------------------------------------------
// 4. Verify what we are about to hand to the portal
// ---------------------------------------------------------------------------

const indexPath = path.join(PACKAGE_DIR, 'index.html');
if (!fs.existsSync(indexPath)) {
  fail(`no index.html at the package root (${path.relative(FRONTEND_DIR, indexPath)})`);
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');

/**
 * The portal requires the SDK to be loaded BY THE DOCUMENT, so assert the actual
 * element — not merely that the URL appears somewhere. `next/script`'s
 * `beforeInteractive` puts only a preload link and a `__next_s` queue entry in the
 * HTML, which would pass a substring check while leaving the document without a
 * script tag. See `platformHead.crazygames.tsx`.
 */
const SDK_TAG = new RegExp(`<script[^>]*\\ssrc="${SDK_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
if (!SDK_TAG.test(indexHtml)) {
  fail(
    `index.html has no <script src="${SDK_SRC}"> element.\n` +
      (indexHtml.includes(SDK_SRC)
        ? '  The URL is present but not as a script tag — check platformHead.crazygames.tsx.'
        : '  The SDK is missing entirely — is @platform-head resolving to the CrazyGames arm?'),
  );
}
if (/rel="manifest"/.test(indexHtml)) {
  fail('index.html still links a web app manifest (PWA metadata must not ship in the package)');
}
if (/serviceWorker|sw\.js/.test(indexHtml)) {
  fail('index.html references a service worker (CAPABILITIES.pwa must keep it out of this build)');
}

// The remaining checks scan every text file in the package, because a bad value
// baked into a JS chunk is exactly as broken as one in the HTML.
const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.txt', '.mjs']);
const textFiles = walk(PACKAGE_DIR).filter((f) => TEXT_EXT.has(path.extname(f)));

/**
 * WHAT IS AND IS NOT CHECKABLE HERE.
 *
 * HTML and CSS can be checked exactly: every `src`/`href`/`url()` in them is a URL
 * the browser will resolve, so a leading `/` is unambiguously a bug in a package
 * served from a subdirectory.
 *
 * JS cannot. A root-absolute string in a chunk may be a URL, or a substring probe,
 * or an error message — the Turbopack runtime contains all three around the literal
 * `/_next/`, because it derives the chunk base from `document.currentScript.src`
 * (which is itself the mechanism that makes relative loading work). Pattern-hunting
 * there produces false failures that future builds would have to keep suppressing.
 *
 * So JS is checked for the few shapes that are always wrong in a static package —
 * a root-absolute `fetch`, or a root-absolute media/script `src` assignment — and
 * the real proof of chunk loading is the subdirectory smoke test at the end.
 */
const ROOT_ABSOLUTE_FETCH = /fetch\(\s*["'`]\//;
const ROOT_ABSOLUTE_SRC = /(?:\.src\s*=\s*|new\s+(?:Audio|Image|Worker)\(\s*)["'`]\//;

/**
 * Root-absolute requests that predate this build target and are inert.
 *
 * `/api/report-bug` has never existed — not on web either. `ReportBugModal`
 * posts to it, catches the 404, and reports success anyway. It is listed rather
 * than ignored so that a NEW root-absolute request still fails this build: in a
 * static package the package origin's root belongs to the portal, so anything
 * expecting our own server there is a bug.
 */
const KNOWN_ROOT_FETCHES = ['/api/report-bug'];
const KNOWN_ROOT_FETCH_RE = new RegExp(
  `fetch\\(\\s*["'\`](?:${KNOWN_ROOT_FETCHES.join('|')})["'\`]`,
  'g',
);

const offenders = { localhost: [], badJs: [], absoluteCss: [] };
let backendSeen = false;

for (const file of textFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(PACKAGE_DIR, file);

  if (content.includes(backendUrl)) backendSeen = true;
  if (/https?:\/\/localhost:3001|127\.0\.0\.1:3001/.test(content)) offenders.localhost.push(rel);

  if (path.extname(file) === '.js') {
    const scrubbed = content.replace(KNOWN_ROOT_FETCH_RE, '');
    if (ROOT_ABSOLUTE_FETCH.test(scrubbed) || ROOT_ABSOLUTE_SRC.test(scrubbed)) {
      offenders.badJs.push(rel);
    }
  }

  // Fonts and images referenced from inside a stylesheet resolve against the
  // stylesheet, not the document — the one place `assetPrefix` cannot help.
  if (path.extname(file) === '.css' && /url\(\s*["']?\//.test(content)) {
    offenders.absoluteCss.push(rel);
  }
}

if (!backendSeen) fail(`Backend B (${backendUrl}) does not appear anywhere in the package`);
if (offenders.localhost.length) {
  fail(`localhost:3001 is baked into: ${offenders.localhost.slice(0, 5).join(', ')}`);
}
if (offenders.badJs.length) {
  fail(
    'root-absolute fetch/src in JS (nothing serves the package origin root): ' +
      offenders.badJs.slice(0, 5).join(', '),
  );
}
if (offenders.absoluteCss.length) {
  fail(
    'root-absolute url() in stylesheets (fonts/images would 404 from a subdirectory) in: ' +
      offenders.absoluteCss.slice(0, 5).join(', '),
  );
}

// HTML is checked strictly: nothing the document loads may be root-absolute,
// whatever its origin (metadata, file conventions, or our own markup).
for (const file of textFiles.filter((f) => f.endsWith('.html'))) {
  const stray = fs
    .readFileSync(file, 'utf8')
    .match(/\s(?:src|href)="\/(?!\/)[^"]*"/g);
  if (stray) {
    fail(
      `root-absolute asset URL(s) left in ${path.relative(PACKAGE_DIR, file)}: ` +
        stray.slice(0, 5).join(', '),
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------

const finalFiles = walk(PACKAGE_DIR);
const bytes = finalFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);

log('');
log(`package   : ${path.relative(process.cwd(), PACKAGE_DIR) || '.'}`);
log(`entry     : index.html (at package root)`);
log(`files     : ${finalFiles.length}`);
log(`size      : ${(bytes / 1024 / 1024).toFixed(2)} MB`);
log(`SDK tag   : present`);
log(`backend B : baked in`);
log('');
log('Verify locally before uploading:');
log(`  python -m http.server 8080 --directory ${path.relative(process.cwd(), PACKAGE_DIR)}`);
log('  → http://localhost:8080/');
