/**
 * Redis connectivity check — `npm run redis:check`
 *
 * Verifies, in order, the exact things that break a Redis deployment:
 *   1. REDIS_URL is set (and reachable from THIS machine / container)
 *   2. Authentication succeeds
 *   3. Read + write + delete round-trip works on a scratch key
 *   4. Reports latency, server version, and any existing Unoverse keys
 *
 * Run this BEFORE starting the server when setting Redis up, so a connection
 * problem is diagnosed in isolation instead of surfacing as a confusing startup
 * failure. Exits 0 on success, 1 on any failure.
 */

import '../config/loadEnv';
import { getRedis, closeRedis, isRedisConfigured, redactRedisUrl } from '../config/redis';

async function main(): Promise<void> {
  if (!isRedisConfigured()) {
    console.error('FAIL  REDIS_URL is not set.');
    console.error('      Add it to backend/.env, e.g.:');
    console.error('        REDIS_URL=redis://localhost:6379');
    process.exit(1);
  }

  const url = process.env.REDIS_URL!.trim();
  console.log(`Checking ${redactRedisUrl(url)} ...\n`);

  const client = await getRedis();

  // 1. PING — proves the socket, TLS handshake and AUTH all succeeded.
  const started = Date.now();
  const pong = await client.ping();
  const latency = Date.now() - started;
  console.log(`OK    PING -> ${pong} (${latency}ms)`);

  // 2. Round-trip a scratch key with a short TTL, so a failed run cannot leave
  //    litter behind even if the delete below never executes.
  const probeKey = `uno:healthcheck:${process.pid}`;
  await client.set(probeKey, 'ok', 'EX', 30);
  const readBack = await client.get(probeKey);
  if (readBack !== 'ok') throw new Error(`Read-back mismatch: expected "ok", got ${readBack}`);
  await client.del(probeKey);
  console.log('OK    SET / GET / DEL round-trip');

  // 3. Server info — version and memory are the two fields worth eyeballing.
  const info: string = await client.info('server');
  const version = /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? 'unknown';
  console.log(`OK    Redis server version ${version}`);

  // 4. Existing Unoverse data, so you can tell a fresh instance from a populated
  //    one at a glance. SCARD is O(1); never use KEYS against production.
  const rooms = await client.scard('uno:rooms');
  const profiles = await client.scard('uno:profiles');
  console.log(`\nExisting data: ${rooms} room(s), ${profiles} profile(s)`);

  console.log('\nAll checks passed. Set STORE=redis to use it.');
}

main()
  .then(async () => {
    await closeRedis();
    process.exit(0);
  })
  .catch(async (err: any) => {
    console.error(`\nFAIL  ${err?.message || err}`);
    console.error('\nCommon causes:');
    console.error('  - Redis is not running          -> start it (see backend/.env.example)');
    console.error('  - Wrong host/port in REDIS_URL   -> check the connection string');
    console.error('  - Managed Redis needs TLS        -> use rediss:// (two s) not redis://');
    console.error('  - Wrong password                 -> redis://:PASSWORD@host:port');
    console.error('  - Firewall / IP allow-list       -> allow this machine in the provider dashboard');
    await closeRedis();
    process.exit(1);
  });
