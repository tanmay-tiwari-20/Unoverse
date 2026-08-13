import jwt, { JwtPayload } from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { CRAZYGAMES_CONFIG } from '../config/serverConfig';

/**
 * ============================================================================
 *  CrazyGames user-token verification — RS256, signature-checked, server-side.
 * ============================================================================
 *
 * The client calls `SDK.user.getUserToken()` and POSTs the resulting JWT here.
 * This module is the ONLY thing that decides whether that token is genuine.
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE:
 *
 *   1. The signature is ALWAYS verified against CrazyGames' published RS256
 *      public key. A decode-without-verify would accept a token any player could
 *      forge in their browser console, handing them any account they named.
 *   2. The identity comes from the VERIFIED payload only. A `userId` sent
 *      alongside the token in the request body is never read — the endpoint takes
 *      the token and nothing else.
 *   3. No developer secret is invented. Verification needs only the public key,
 *      which is exactly why this flow can be implemented honestly today.
 *
 * The token is used once, at the moment of sign-in, and is never persisted: it is
 * exchanged for the profile's own long-lived secret and then dropped. The client
 * re-calls `getUserToken()` whenever it needs to authenticate again.
 *
 * KEY ROTATION. The key is cached for `publicKeyTtlMs`, and a verification
 * failure triggers exactly one forced re-fetch + retry before the token is
 * rejected. That way a rotated key self-heals without a restart, while a genuinely
 * bad token still fails fast and cannot be used to hammer the key endpoint.
 */

/** A verified CrazyGames identity. Every field came out of a checked signature. */
export interface CrazyGamesIdentity {
  userId: string;
  username: string;
  profilePictureUrl: string | null;
}

/** Why a token was rejected. Kept coarse on purpose — the client is told only
 *  that auth failed, and the detail goes to the server log. */
export type CrazyGamesAuthFailure =
  | 'disabled'
  | 'malformed'
  | 'key_unavailable'
  | 'invalid_signature'
  | 'wrong_game'
  | 'invalid_payload';

export type CrazyGamesAuthResult =
  | { ok: true; identity: CrazyGamesIdentity }
  | { ok: false; reason: CrazyGamesAuthFailure };

interface CachedKey {
  key: string;
  fetchedAt: number;
}

let cached: CachedKey | null = null;
let inFlight: Promise<string | null> | null = null;

/** Drop the cached key. Exposed for tests and for the forced-refetch path. */
export const resetCrazyGamesKeyCache = (): void => {
  cached = null;
  inFlight = null;
};

/**
 * Fetch the published public key, coalescing concurrent callers so a burst of
 * sign-ins produces one request rather than one per player.
 *
 * The response shape is `{ publicKey: "-----BEGIN [RSA] PUBLIC KEY-----..." }`. Both
 * SPKI (`BEGIN PUBLIC KEY`) and PKCS#1 (`BEGIN RSA PUBLIC KEY`) are accepted;
 * anything else is treated as unavailable rather than guessed at.
 */
const fetchPublicKey = async (): Promise<string | null> => {
  inFlight ??= (async () => {
    try {
      const res = await fetch(CRAZYGAMES_CONFIG.publicKeyUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        logger.error(`[CG_AUTH] Public key fetch failed: HTTP ${res.status}`);
        return null;
      }
      const body: unknown = await res.json();
      const key =
        body && typeof body === 'object' ? (body as Record<string, unknown>).publicKey : undefined;
      if (typeof key !== 'string' || !/-----BEGIN (?:RSA )?PUBLIC KEY-----/.test(key)) {
        logger.error('[CG_AUTH] Public key response did not contain a PEM public key.');
        return null;
      }
      cached = { key, fetchedAt: Date.now() };
      logger.info('[CG_AUTH] Fetched CrazyGames public key.');
      return key;
    } catch (err: any) {
      logger.error('[CG_AUTH] Public key fetch error:', err?.message);
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

/** The cached key if still fresh, otherwise a fresh fetch. */
const getPublicKey = async (force = false): Promise<string | null> => {
  if (!force && cached && Date.now() - cached.fetchedAt < CRAZYGAMES_CONFIG.publicKeyTtlMs) {
    return cached.key;
  }
  if (force) cached = null;
  return fetchPublicKey();
};

/** Pull the identity out of a payload whose signature has ALREADY been checked. */
const toIdentity = (payload: string | JwtPayload): CrazyGamesIdentity | null => {
  if (!payload || typeof payload !== 'object') return null;
  const userId = payload.userId;
  const username = payload.username;
  const picture = payload.profilePictureUrl;
  if (typeof userId !== 'string' || !userId) return null;
  return {
    userId: userId.slice(0, 128),
    username: typeof username === 'string' && username.trim() ? username.trim().slice(0, 64) : 'Player',
    profilePictureUrl: typeof picture === 'string' && picture ? picture.slice(0, 512) : null,
  };
};

/**
 * Verify a CrazyGames user token and return the identity it proves.
 *
 * `exp` / `iat` are enforced by `jsonwebtoken`; `algorithms` is pinned to RS256 so
 * a token re-signed as `HS256` (or `none`) with the public key as its secret is
 * rejected rather than trusted — the classic JWT confusion attack.
 */
export const verifyCrazyGamesToken = async (token: unknown): Promise<CrazyGamesAuthResult> => {
  if (!CRAZYGAMES_CONFIG.enabled) return { ok: false, reason: 'disabled' };
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const trimmed = token.trim();
  if (!trimmed || Buffer.byteLength(trimmed, 'utf8') > CRAZYGAMES_CONFIG.maxTokenBytes) {
    return { ok: false, reason: 'malformed' };
  }

  const attempt = async (force: boolean): Promise<CrazyGamesAuthResult | 'retry'> => {
    const key = await getPublicKey(force);
    if (!key) return force ? { ok: false, reason: 'key_unavailable' } : 'retry';

    let payload: string | JwtPayload;
    try {
      payload = jwt.verify(trimmed, key, { algorithms: ['RS256'] });
    } catch (err: any) {
      // A signature failure is the case key rotation looks like, so it is the one
      // worth retrying against a freshly fetched key. An expired token is not.
      if (!force && err?.name === 'JsonWebTokenError') return 'retry';
      logger.warn(`[CG_AUTH] Token rejected: ${err?.name || 'error'}`);
      return { ok: false, reason: 'invalid_signature' };
    }

    const identity = toIdentity(payload);
    if (!identity) {
      logger.warn('[CG_AUTH] Verified token carried no usable userId.');
      return { ok: false, reason: 'invalid_payload' };
    }

    const expected = CRAZYGAMES_CONFIG.gameId;
    if (expected) {
      const claimed = typeof payload === 'object' ? payload.gameId : undefined;
      if (claimed !== expected) {
        logger.warn('[CG_AUTH] Token was minted for a different gameId.');
        return { ok: false, reason: 'wrong_game' };
      }
    }

    return { ok: true, identity };
  };

  const first = await attempt(false);
  if (first !== 'retry') return first;

  const second = await attempt(true);
  return second === 'retry' ? { ok: false, reason: 'key_unavailable' } : second;
};
