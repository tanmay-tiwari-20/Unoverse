import { describe, it, expect, afterEach } from 'vitest';
import { resolveCorsOrigin, resolveTrustProxy } from './serverConfig';

/**
 * CORS policy must be safe-by-default: open in dev (localhost always allowed),
 * strict in production (explicit allow-list required; never "*"). The resolver
 * reads NODE_ENV + CORS_ORIGIN at call time, so we drive it via env here.
 */

const origEnv = {
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS,
};
afterEach(() => {
  for (const [key, value] of Object.entries(origEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('trusted proxy boundary', () => {
  it('ignores forwarded addresses for an unconfigured or direct deployment', () => {
    delete process.env.TRUST_PROXY_HOPS;
    expect(resolveTrustProxy()).toBe(false);
    process.env.TRUST_PROXY_HOPS = '0';
    expect(resolveTrustProxy()).toBe(false);
  });

  it('accepts an explicitly configured fixed proxy chain', () => {
    process.env.TRUST_PROXY_HOPS = '1';
    expect(resolveTrustProxy()).toBe(1);
    process.env.TRUST_PROXY_HOPS = '8';
    expect(resolveTrustProxy()).toBe(8);
  });

  it('rejects blanket trust and malformed or excessive proxy counts', () => {
    for (const value of ['true', '*', '-1', '1.5', '9']) {
      process.env.TRUST_PROXY_HOPS = value;
      expect(() => resolveTrustProxy()).toThrow(/TRUST_PROXY_HOPS/);
    }
  });
});

/** Run the cors-style resolver and return whether an origin is allowed. */
function allows(resolver: ReturnType<typeof resolveCorsOrigin>, origin: string | undefined): boolean {
  let ok = false;
  resolver(origin, (err, allow) => {
    ok = !err && !!allow;
  });
  return ok;
}

describe('resolveCorsOrigin — production', () => {
  it('throws when CORS_ORIGIN is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    expect(() => resolveCorsOrigin()).toThrow(/CORS_ORIGIN/);
  });

  it('throws when CORS_ORIGIN is empty', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '   ';
    expect(() => resolveCorsOrigin()).toThrow(/CORS_ORIGIN/);
  });

  it('throws when CORS_ORIGIN is a wildcard', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '*';
    expect(() => resolveCorsOrigin()).toThrow(/wildcard|CORS_ORIGIN/);
  });

  it('allows only configured origins', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com, https://www.example.com/';
    const r = resolveCorsOrigin();
    expect(allows(r, 'https://app.example.com')).toBe(true);
    expect(allows(r, 'https://www.example.com')).toBe(true); // trailing slash normalized
    expect(allows(r, 'https://evil.example.com')).toBe(false);
    expect(allows(r, 'http://localhost:3000')).toBe(false); // localhost NOT auto-allowed in prod
  });

  it('allows requests with no Origin header (same-origin / health checks)', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    const r = resolveCorsOrigin();
    expect(allows(r, undefined)).toBe(true);
  });
});

describe('resolveCorsOrigin — development', () => {
  it('reflects any origin when unset or "*"', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;
    const r = resolveCorsOrigin();
    expect(allows(r, 'https://anything.example.com')).toBe(true);
  });

  it('always allows localhost and configured origins when an allow-list is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = 'https://staging.example.com';
    const r = resolveCorsOrigin();
    expect(allows(r, 'http://localhost:3000')).toBe(true);
    expect(allows(r, 'http://127.0.0.1:8080')).toBe(true);
    expect(allows(r, 'https://staging.example.com')).toBe(true);
    expect(allows(r, 'https://random.example.com')).toBe(false);
  });
});
