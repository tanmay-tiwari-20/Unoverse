import { BACKEND_URL } from '../config';
import { logger } from '../../utils/logger';

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export interface IceConfiguration {
  iceServers: RTCIceServer[];
  expiresAt: number;
  relayConfigured: boolean;
}

/** Only the backend knows the relay secret; credentials expire within an hour. */
export async function getIceServers(token: string, signal?: AbortSignal): Promise<IceConfiguration> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/voice/ice`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
    if (response.status === 401) throw new Error('Voice membership expired. Please rejoin.');
    if (!response.ok) throw new Error(`ICE configuration unavailable (${response.status})`);
    const data = await response.json() as IceConfiguration;
    if (!Array.isArray(data.iceServers) || !Number.isFinite(data.expiresAt)) throw new Error('Invalid ICE configuration');
    return data;
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.message.startsWith('Voice membership expired'))) throw err;
    logger.warn('[VOICE] Relay configuration unavailable; using direct STUN connections.', err);
    return { iceServers: STUN_SERVERS, expiresAt: Date.now() + 60_000, relayConfigured: false };
  }
}
