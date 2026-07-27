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

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

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
export async function createProfile(input: { displayName: string; avatar?: string | null }): Promise<CreatedProfile> {
  const res = await fetch(`${BACKEND_URL}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: input.displayName, avatar: input.avatar ?? null }),
  });
  if (!res.ok) return parseError(res, 'Failed to create profile');
  return res.json();
}

/** Fetch a profile's public view (stats, history, dates) for display. */
export async function fetchProfile(id: string): Promise<PublicProfile> {
  const res = await fetch(`${BACKEND_URL}/api/profiles/${encodeURIComponent(id)}`);
  if (!res.ok) return parseError(res, 'Failed to load profile');
  const data = await res.json();
  return data.profile;
}

/** Rename and/or change avatar. Secret-authenticated. */
export async function patchProfile(
  id: string,
  secret: string,
  changes: { displayName?: string; avatar?: string | null },
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
