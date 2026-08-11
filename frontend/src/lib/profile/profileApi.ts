/**
 * ============================================================================
 *  Profile REST client.
 * ============================================================================
 *
 * Thin wrappers over the server's `/api/profiles` endpoints. The server is the
 * sole authority for stats; these calls only CREATE a profile, READ its public
 * view for display, or perform the two secret-authenticated writes the server
 * allows (rename / change avatar / reset). Stat values are never sent.
 */
import type { PublicProfile } from '../../types/profile';
import { BACKEND_URL } from '../config';

/** Shape returned by POST /api/profiles — the ONLY time the secret is issued. */
export interface CreatedProfile {
  profile: PublicProfile;
  secret: string;
}

async function parseError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    // non-JSON error body — keep the fallback message
  }
  throw new Error(message);
}

/** Create a brand-new persistent profile. Returns the public profile + the
 *  private secret (store it locally; it authenticates all future edits). */
export async function createProfile(input: { displayName: string; avatar?: string | null; outfit?: string | null }): Promise<CreatedProfile> {
  const res = await fetch(`${BACKEND_URL}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: input.displayName, avatar: input.avatar ?? null, outfit: input.outfit ?? null }),
  });
  if (!res.ok) return parseError(res, 'Failed to create profile');
  return res.json();
}

/**
 * Exchange a CrazyGames user token for the usual `{ profile, secret }` pair.
 *
 * The token is the ONLY thing sent — no user id, no username. Identity is decided
 * by the signature check on the server, so anything the client added alongside it
 * would either be ignored or be a way to claim someone else's account.
 *
 * The token itself is never stored: it is passed straight through here and then
 * dropped. Callers re-request one from the SDK whenever they need to authenticate.
 *
 * Mounted only on the CrazyGames deployment, so a 404 here is a configuration
 * answer ("this backend has no platform auth"), not an error worth surfacing —
 * the caller falls back to the normal guest path.
 */
export async function authenticateCrazyGames(token: string): Promise<CreatedProfile> {
  const res = await fetch(`${BACKEND_URL}/api/auth/crazygames`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return parseError(res, 'CrazyGames authentication failed');
  return res.json();
}

/** Fetch a profile's public view (stats, history, dates) for display. */
export async function fetchProfile(id: string): Promise<PublicProfile> {
  const res = await fetch(`${BACKEND_URL}/api/profiles/${encodeURIComponent(id)}`);
  if (!res.ok) return parseError(res, 'Failed to load profile');
  const data = await res.json();
  return data.profile;
}

/** Rename and/or change avatar and/or cosmetic outfit. Secret-authenticated. */
export async function patchProfile(
  id: string,
  secret: string,
  changes: { displayName?: string; avatar?: string | null; outfit?: string | null },
): Promise<PublicProfile> {
  const res = await fetch(`${BACKEND_URL}/api/profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, ...changes }),
  });
  if (!res.ok) return parseError(res, 'Failed to update profile');
  const data = await res.json();
  return data.profile;
}

/** Reset all lifetime stats / history. Keeps the same Player ID + tag. Secret-authenticated. */
export async function resetProfile(id: string, secret: string): Promise<PublicProfile> {
  const res = await fetch(`${BACKEND_URL}/api/profiles/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret }),
  });
  if (!res.ok) return parseError(res, 'Failed to reset profile');
  const data = await res.json();
  return data.profile;
}
