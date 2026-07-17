import { logger } from '../../utils/logger';

/**
 * Build the ICE server list for WebRTC peer connections.
 *
 * STUN lets most peers discover their public address, but players behind
 * symmetric NATs / strict firewalls (common on mobile data and corporate WiFi)
 * cannot connect without a TURN relay.
 *
 * This project must stay completely free, so by default we use the Open Relay
 * Project's free public TURN servers (openrelay.metered.ca — free tier, static
 * credentials published by the project itself) alongside Google/Twilio STUN.
 * Port 443/TCP + TURNS maximise the chance of traversing corporate firewalls.
 *
 * You can still override/augment with your own (e.g. self-hosted coturn, also
 * free) via env — these take priority and the free defaults stay as fallback:
 *
 *   NEXT_PUBLIC_TURN_URL        e.g. turn:turn.example.com:3478  (comma-separated for multiple)
 *   NEXT_PUBLIC_TURN_USERNAME   TURN credential username
 *   NEXT_PUBLIC_TURN_CREDENTIAL TURN credential password
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // STUN — free, no credentials needed.
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    servers.push({ urls, username: turnUser, credential: turnCred });
  } else if (turnUrl) {
    // A URL was provided without full credentials — warn, since most TURN needs auth.
    logger.warn('[VOICE] NEXT_PUBLIC_TURN_URL set without username/credential — ignoring, using free defaults.');
  }

  // Free public TURN (Open Relay Project). Kept even when a custom TURN is
  // configured — the ICE agent simply picks whichever candidate pair works.
  servers.push({
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  });

  return servers;
}
