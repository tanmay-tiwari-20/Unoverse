import { isIP } from 'net';

/** Canonical keys keep IPv4-mapped and alternative IPv6 spellings equivalent. */
export function normalizeAddress(address: string): string | null {
  const value = address.trim();
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6) return null;
  // OS link-local addresses may include an interface scope, which URL rejects.
  const canonical = new URL(`http://[${value.split('%')[0]}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/i.exec(canonical);
  if (mapped) {
    const a = parseInt(mapped[1], 16), b = parseInt(mapped[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return canonical;
}

/** Match Express fixed-hop trust: walk from the transport toward the client. */
export function socketClientAddress(
  request: { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> },
  trustedProxyHops: false | number,
): string {
  const remote = normalizeAddress(request.socket.remoteAddress || '') || 'unknown';
  if (!trustedProxyHops) return remote;
  const header = request.headers['x-forwarded-for'];
  if (typeof header !== 'string' || header.length > 2048) return remote;
  const forwarded = header.split(',').reverse();
  let address = remote;
  for (const entry of forwarded.slice(0, trustedProxyHops)) {
    const parsed = normalizeAddress(entry);
    if (!parsed) break;
    address = parsed;
  }
  return address;
}
