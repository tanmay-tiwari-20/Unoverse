/**
 * ============================================================================
 *  serve-crazygames — the local stand-in for the portal's file host.
 * ============================================================================
 *
 * `npm run serve:crazygames`  →  http://localhost:8080/pkg/
 *
 * WHY THIS EXISTS AND `python -m http.server` DOES NOT DO. The portal serves an
 * uploaded package from a SUBDIRECTORY of its game-files domain, and the bugs that
 * only appear there are invisible when the package is served from a server root:
 *
 *   `python -m http.server --directory crazygames-build`   package AT the root
 *   this script                                            package UNDER /pkg/
 *
 * The failure that motivated this script: App Router client navigation in an
 * `output: 'export'` build fetches the target route's RSC payload from
 * `<pathname>.txt` built off `location.origin`, so a root-absolute route URL asks
 * the DOMAIN ROOT for `/index.txt`. Served from a root, that request resolves and
 * everything looks fine. Served from a subdirectory — which is what production is
 * — it 404s and Next hard-navigates to the domain root, and the game vanishes.
 *
 * So this server does two things a static file server does not:
 *
 *   1. MOUNTS THE PACKAGE UNDER A PREFIX, with nothing whatsoever at the root
 *      except a page that says so, exactly like the real host.
 *   2. TREATS ANY REQUEST OUTSIDE THE PREFIX AS A TEST FAILURE, names it, and
 *      reports the tally on exit — with an RSC payload (`*.txt`) escape called out
 *      specially, because that one is the navigation bug rather than a stray asset.
 *
 * It asserts rather than merely logs: a clean run is a run whose summary says zero
 * violations, so "the game still worked" is not the only evidence. The exit status
 * carries the verdict — 0 for a clean run, 1 if anything escaped.
 *
 *   npm run serve:crazygames                    walk the flows, Ctrl-C for the verdict
 *   npm run serve:crazygames -- --for 30        self-terminating run (scriptable/CI)
 *   npm run serve:crazygames -- --mount deep/er non-root mount depth
 *   npm run serve:crazygames -- --verbose       log every request, not just documents
 *
 * Nothing here ships in the package, and nothing here touches the web build.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(FRONTEND_DIR, 'crazygames-build');

/** `--port 8080 --mount /pkg/ --verbose` */
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PORT = Number(argOf('port', 8080));
const VERBOSE = process.argv.includes('--verbose');

/**
 * `--for <seconds>`: serve for a fixed window, then print the verdict and exit on
 * its own. Ctrl-C is the interactive path, but a Ctrl-C cannot be scripted — on
 * Windows a programmatic kill terminates the process outright rather than raising
 * SIGINT, so the handler never runs and the verdict never prints. Without this flag
 * the assertion could only ever be triggered by hand, which is a strange property
 * for a test to have. Zero means "run until interrupted".
 */
const FOR_SECONDS = Number(argOf('for', 0));

/**
 * The subdirectory the package is mounted at. The name is arbitrary and that is
 * the point — the real one is assigned by the portal and unknown at build time, so
 * the package must not depend on knowing it.
 */
const MOUNT = `/${argOf('mount', 'pkg').replace(/^\/+|\/+$/g, '')}/`;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Requests browsers make on their own initiative for a document's origin root,
 * whatever the document links. They are not the package reaching outside itself,
 * so they are reported and not counted.
 */
const BROWSER_DEFAULTS = new Set([
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
]);

const violations = [];

// Raw ESC via char code, so no control character is ever pasted into this file.
const ESC = String.fromCharCode(27);
const c = {
  dim: `${ESC}[2m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  bold: `${ESC}[1m`,
  off: `${ESC}[0m`,
};
const log = (msg) => console.log(`[serve] ${msg}`);

if (!fs.existsSync(PACKAGE_DIR)) {
  console.error(
    `\n[serve] ${path.relative(process.cwd(), PACKAGE_DIR)} does not exist.\n` +
      '  Run `npm run build:crazygames` first.\n',
  );
  process.exit(1);
}

/**
 * The page the domain root serves. The real game-files domain has the portal's own
 * content here, not ours; what matters for the test is that it is NOT the game, so
 * an escaped navigation is unmistakable on screen as well as in this log.
 */
const ROOT_STUB = `<!doctype html><meta charset="utf-8"><title>Not the game</title>
<body style="background:#120c2e;color:#fff;font:16px/1.6 system-ui;padding:3rem">
<h1 style="color:#f87171">This is the file host's root, not the game.</h1>
<p>If the game navigated you here, that is the bug this server exists to catch —
   check the terminal.</p>
<p>The package is mounted at <a style="color:#a78bfa" href="${MOUNT}">${MOUNT}</a>.</p>
`;

const send = (res, status, body, type) => {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    // A smoke test must not be answered out of the browser cache, or the second
    // run measures the first one.
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // ---------------------------------------------------------------------------
  // Outside the mount: the package reached beyond itself.
  // ---------------------------------------------------------------------------
  if (!pathname.startsWith(MOUNT)) {
    if (BROWSER_DEFAULTS.has(pathname)) {
      log(`${c.dim}browser default  ${pathname} → 404 (not counted)${c.off}`);
      return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    }

    const isRscPayload = pathname.endsWith('.txt');
    violations.push({ pathname, search: url.search, isRscPayload });

    console.log('');
    if (isRscPayload) {
      console.log(
        `${c.red}${c.bold}[serve] RSC PAYLOAD ESCAPED THE PACKAGE${c.off}\n` +
          `        ${c.red}${pathname}${url.search}${c.off}\n` +
          '        This is the production failure: App Router asked the domain ROOT\n' +
          '        for a route payload. On the portal this 404s and Next then hard-\n' +
          `        navigates to the root, losing the game. Expected under ${MOUNT}.`,
      );
    } else {
      console.log(
        `${c.red}${c.bold}[serve] REQUEST ESCAPED THE PACKAGE${c.off}\n` +
          `        ${c.red}${pathname}${url.search}${c.off}\n` +
          `        Nothing outside ${MOUNT} exists on the portal's host. A root-\n` +
          '        absolute URL got into the package.',
      );
    }
    console.log('');

    if (pathname === '/') return send(res, 200, ROOT_STUB, MIME['.html']);
    return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  }

  // ---------------------------------------------------------------------------
  // Inside the mount: serve the package.
  // ---------------------------------------------------------------------------
  const relative = pathname.slice(MOUNT.length) || 'index.html';
  const resolved = path.resolve(PACKAGE_DIR, relative.endsWith('/') ? `${relative}index.html` : relative);

  // Containment check, not politeness: `..` must not be able to read the repo.
  if (resolved !== PACKAGE_DIR && !resolved.startsWith(PACKAGE_DIR + path.sep)) {
    log(`${c.yellow}refused traversal ${pathname}${c.off}`);
    return send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
  }

  let file = resolved;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }

  const ext = path.extname(file).toLowerCase();

  if (!fs.existsSync(file)) {
    log(`${c.yellow}404 ${pathname}${url.search}${c.off}`);
    return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  }

  // `.txt` inside the mount is a route payload resolving where it should — worth
  // seeing, because it is the same mechanism that fails when it escapes.
  if (VERBOSE || ext === '.html' || ext === '.txt') {
    log(`200 ${pathname}${url.search}`);
  }

  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
});

const summarise = () => {
  // SIGINT during a `--for` window would otherwise print the verdict twice.
  if (summarise.done) return;
  summarise.done = true;

  const rsc = violations.filter((v) => v.isRscPayload);
  console.log('');
  if (violations.length === 0) {
    log(`${c.green}${c.bold}PASS${c.off} — every request stayed inside ${MOUNT}.`);
  } else {
    log(`${c.red}${c.bold}FAIL${c.off} — ${violations.length} request(s) escaped ${MOUNT}:`);
    for (const v of violations.slice(0, 20)) {
      log(`  ${v.isRscPayload ? 'RSC payload' : 'asset      '}  ${v.pathname}${v.search}`);
    }
    if (rsc.length) {
      log(`${c.red}  ${rsc.length} of them were route payloads — client navigation is still${c.off}`);
      log(`${c.red}  going through the network instead of the History API.${c.off}`);
    }
  }
  console.log('');
  process.exit(violations.length ? 1 : 0);
};

process.on('SIGINT', summarise);
process.on('SIGTERM', summarise);

server.listen(PORT, () => {
  console.log('');
  log(`serving ${path.relative(process.cwd(), PACKAGE_DIR)} at ${c.bold}http://localhost:${PORT}${MOUNT}${c.off}`);
  log(`the domain root is deliberately NOT the game — anything requested outside`);
  log(`${MOUNT} is reported as a violation and fails the run.`);
  console.log('');
  log('Walk the flows that navigate, watching this log:');
  log('  create room · quick play · join by code · exit table · settings → leave');
  log('  then browser Back and Forward through each of them.');
  log('');
  log(`Ctrl-C for the verdict.${VERBOSE ? '' : ' (--verbose to log every request.)'}`);
  console.log('');

  if (FOR_SECONDS > 0) {
    log(`${c.dim}--for ${FOR_SECONDS}s: the verdict prints automatically when the window closes.${c.off}`);
    console.log('');
    setTimeout(summarise, FOR_SECONDS * 1000);
  }
});
