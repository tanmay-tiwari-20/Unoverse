import { logger } from '../../utils/logger';

/**
 * Build the ICE server list for WebRTC peer connections.
 *
 * STUN alone lets most peers discover their public address, but players behind
 * symmetric NATs / strict firewalls (common on mobile data and corporate WiFi)
 * cannot connect without a TURN relay. Provide TURN via env for production:
 *
 *   NEXT_PUBLIC_TURN_URL       e.g. turn:turn.example.com:3478  (comma-separated for multiple)
 *   NEXT_PUBLIC_TURN_USERNAME  TURN credential username
 *   NEXT_PUBLIC_TURN_CREDENTIAL TURN credential password
 *
 * If TURN env is absent, we fall back to public STUN only (voice works for many
 * but not all networks) — fine for local dev, not ideal for production.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    servers.push({ urls, username: turnUser, credential: turnCred });
  } else if (turnUrl) {
    // A URL was provided without full credentials — warn, since most TURN needs auth.
    logger.debug('[VOICE] NEXT_PUBLIC_TURN_URL set without username/credential — TURN may fail.');
  }

  return servers;
}
