/**
 * Static-host smoke test for the CrazyGames package.
 *
 * Serves nothing itself — point it at a running static server and it walks what
 * the browser would fetch, asserting every request returns 200:
 *
 *   node scripts/verify-crazygames-package.mjs http://localhost:8080/crazygames-build/
 *
 * The interesting case is a package served from a SUBDIRECTORY, because that is
 * how the portal hosts it and it is the only way a root-absolute URL or a
 * mis-resolved relative one actually shows up as a 404.
 *
 * What it covers:
 *   1. the document itself, and every `src`/`href` in it;
 *   2. every chunk the bundler names inside the loaded JS — the lazy ones the
 *      runtime fetches later (the 3D table, each arena) that no static read of the
 *      HTML would reveal;
 *   3. the `public/` assets our own code resolves at runtime through `assetPath`
 *      (models and sounds), resolved exactly the way the browser will.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2];
if (!base || !base.endsWith('/')) {
  console.error('usage: node verify-crazygames-package.mjs <base-url-with-trailing-slash>');
  process.exit(2);
}

const PACKAGE_DIR = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'crazygames-build',
);

const results = { ok: 0, failed: [] };

const check = async (url, label) => {
  try {
    const res = await fetch(url);
    if (res.ok) {
      results.ok++;
      return await res.text();
    }
    results.failed.push(`${res.status} ${label ?? url}`);
  } catch (error) {
    results.failed.push(`ERR ${label ?? url} (${error.message})`);
  }
  return null;
};

// ---------------------------------------------------------------------------
// 1. The document and everything it references
// ---------------------------------------------------------------------------

const html = await check(base, 'index.html');
if (!html) {
  console.error(`could not load ${base} — is the static server running?`);
  process.exit(1);
}

const docRefs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((ref) => !/^(?:https?:)?\/\//.test(ref) && !ref.startsWith('data:'));

for (const ref of [...new Set(docRefs)]) {
  await check(new URL(ref, base).href, `document ref ${ref}`);
}

// ---------------------------------------------------------------------------
// 2. Lazily-loaded chunks, named inside the JS the document loads
// ---------------------------------------------------------------------------

const chunkRefs = new Set();
const chunkDir = path.join(PACKAGE_DIR, '_next', 'static', 'chunks');
for (const file of fs.readdirSync(chunkDir).filter((f) => f.endsWith('.js'))) {
  const content = fs.readFileSync(path.join(chunkDir, file), 'utf8');
  for (const m of content.matchAll(/["'`](static\/(?:chunks|media)\/[^"'`]+?\.(?:js|css|woff2))["'`]/g)) {
    chunkRefs.add(m[1]);
  }
}
for (const ref of chunkRefs) {
  await check(new URL(`_next/${ref}`, base).href, `lazy chunk ${ref}`);
}

// ---------------------------------------------------------------------------
// 3. public/ assets, resolved the way `assetPath` will resolve them
// ---------------------------------------------------------------------------

const publicAssets = [];
const collect = (dir, prefix) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) collect(path.join(dir, entry.name), rel);
    else if (!entry.name.endsWith('.md')) publicAssets.push(rel);
  }
};
collect(path.join(PACKAGE_DIR, 'models'), 'models');
collect(path.join(PACKAGE_DIR, 'sounds'), 'sounds');

for (const asset of publicAssets) {
  // `assetPath()` strips the leading slash and resolves against `document.baseURI`.
  await check(new URL(asset, base).href, `public asset /${asset}`);
}

// ---------------------------------------------------------------------------
// 4. The lobby URL shape must serve the same document
// ---------------------------------------------------------------------------

const lobbyUrl = `${base}?lobby=TESTRM&name=Verifier`;
const lobbyHtml = await check(lobbyUrl, 'lobby URL (?lobby=…)');
if (lobbyHtml && lobbyHtml !== html) {
  results.failed.push('lobby URL served a different document than the root');
}

// ---------------------------------------------------------------------------

console.log(`\nrequests OK : ${results.ok}`);
console.log(`failed      : ${results.failed.length}`);
for (const failure of results.failed.slice(0, 25)) console.log(`  ✗ ${failure}`);
process.exit(results.failed.length ? 1 : 0);
