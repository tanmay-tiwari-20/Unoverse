import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * The security contract of the CrazyGames token exchange.
 *
 * These tests exist because every failure mode here hands an attacker somebody
 * else's account: an unverified signature, an accepted algorithm swap, or an
 * identity read from the request body instead of the payload.
 *
 * `serverConfig` reads env at import time, so each test imports the module fresh
 * via `vi.resetModules()` after setting the env it needs.
 */

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const { publicKey: otherPublicKey, privateKey: otherPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const PAYLOAD = {
  userId: 'cg-user-1',
  gameId: 'unoverse',
  username: 'Ada',
  profilePictureUrl: 'https://images.crazygames.com/u/ada.png',
};

/** Load the module under test with a given env + a stubbed key endpoint. */
const load = async (env: Record<string, string>, served: string | (() => string | null) = publicKey) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  const fetchMock = vi.fn(async () => {
    const key = typeof served === 'function' ? served() : served;
    if (key === null) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ publicKey: key }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);

  const mod = await import('./crazyGamesAuth');
  mod.resetCrazyGamesKeyCache();
  return { ...mod, fetchMock };
};

const ENABLED = { CRAZYGAMES_AUTH_ENABLED: 'true', CRAZYGAMES_GAME_ID: '' };

describe('verifyCrazyGamesToken', () => {
  beforeEach(() => {
    delete process.env.CRAZYGAMES_AUTH_ENABLED;
    delete process.env.CRAZYGAMES_GAME_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CRAZYGAMES_AUTH_ENABLED;
    delete process.env.CRAZYGAMES_GAME_ID;
  });

  it('accepts a correctly signed RS256 token and returns the verified identity', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED);
    const token = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    const result = await verifyCrazyGamesToken(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.userId).toBe('cg-user-1');
    expect(result.identity.username).toBe('Ada');
    expect(result.identity.profilePictureUrl).toContain('ada.png');
  });

  it('rejects a token signed by a different key', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED);
    const forged = jwt.sign(PAYLOAD, otherPrivateKey, { algorithm: 'RS256', expiresIn: '5m' });

    const result = await verifyCrazyGamesToken(forged);
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects an HS256 token signed with the public key (algorithm confusion)', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED);
    const confused = jwt.sign(PAYLOAD, publicKey, { algorithm: 'HS256' });

    const result = await verifyCrazyGamesToken(confused);
    expect(result.ok).toBe(false);
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED);
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    )}.${Buffer.from(JSON.stringify(PAYLOAD)).toString('base64url')}.`;

    const result = await verifyCrazyGamesToken(unsigned);
    expect(result.ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED);
    const expired = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '-1m' });

    const result = await verifyCrazyGamesToken(expired);
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects a verified token that carries no userId', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED);
    const token = jwt.sign({ username: 'Ada' }, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    const result = await verifyCrazyGamesToken(token);
    expect(result).toEqual({ ok: false, reason: 'invalid_payload' });
  });

  it('rejects non-string, empty and oversized input without fetching a key', async () => {
    const { verifyCrazyGamesToken, fetchMock } = await load(ENABLED);

    expect(await verifyCrazyGamesToken(undefined)).toEqual({ ok: false, reason: 'malformed' });
    expect(await verifyCrazyGamesToken({ userId: 'cg-user-1' })).toEqual({ ok: false, reason: 'malformed' });
    expect(await verifyCrazyGamesToken('   ')).toEqual({ ok: false, reason: 'malformed' });
    expect(await verifyCrazyGamesToken('a'.repeat(9_000))).toEqual({ ok: false, reason: 'malformed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is disabled unless CRAZYGAMES_AUTH_ENABLED is explicitly true', async () => {
    const { verifyCrazyGamesToken, fetchMock } = await load({ CRAZYGAMES_AUTH_ENABLED: 'false' });
    const token = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    expect(await verifyCrazyGamesToken(token)).toEqual({ ok: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces the expected gameId when one is configured', async () => {
    const { verifyCrazyGamesToken } = await load({
      CRAZYGAMES_AUTH_ENABLED: 'true',
      CRAZYGAMES_GAME_ID: 'unoverse',
    });

    const mine = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '5m' });
    expect((await verifyCrazyGamesToken(mine)).ok).toBe(true);

    const otherGame = jwt.sign({ ...PAYLOAD, gameId: 'some-other-game' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '5m',
    });
    expect(await verifyCrazyGamesToken(otherGame)).toEqual({ ok: false, reason: 'wrong_game' });
  });

  it('caches the public key across verifications', async () => {
    const { verifyCrazyGamesToken, fetchMock } = await load(ENABLED);
    const token = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    await verifyCrazyGamesToken(token);
    await verifyCrazyGamesToken(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once and recovers when the signing key has rotated', async () => {
    // Serve the STALE key first, then the rotated one — the shape of a real
    // rotation from the server's point of view.
    let serve = otherPublicKey;
    const { verifyCrazyGamesToken, fetchMock } = await load(ENABLED, () => serve);
    const token = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    await verifyCrazyGamesToken(token); // primes the cache with the stale key
    serve = publicKey;

    const result = await verifyCrazyGamesToken(token);
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('reports key_unavailable when the key endpoint cannot be reached', async () => {
    const { verifyCrazyGamesToken } = await load(ENABLED, () => null);
    const token = jwt.sign(PAYLOAD, privateKey, { algorithm: 'RS256', expiresIn: '5m' });

    expect(await verifyCrazyGamesToken(token)).toEqual({ ok: false, reason: 'key_unavailable' });
  });
});
