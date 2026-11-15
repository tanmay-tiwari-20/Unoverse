import { describe, expect, it } from 'vitest';
import { normalizeAddress, socketClientAddress } from './clientAddress';

const request = (header?: string) => ({ socket: { remoteAddress: '::ffff:10.0.0.4' }, headers: { 'x-forwarded-for': header } });
describe('proxy-aware socket IP keys', () => {
  it('ignores client-supplied forwarded headers by default', () => {
    expect(socketClientAddress(request('198.51.100.123'), false)).toBe('10.0.0.4');
  });
  it('walks only the configured trusted hops from the transport side', () => {
    expect(socketClientAddress(request('192.0.2.99, 198.51.100.5, 10.0.0.3'), 1)).toBe('10.0.0.3');
    expect(socketClientAddress(request('192.0.2.99, 198.51.100.5, 10.0.0.3'), 2)).toBe('198.51.100.5');
    expect(socketClientAddress(request('192.0.2.88, 198.51.100.5, 10.0.0.3'), 2)).toBe('198.51.100.5');
  });
  it('canonicalizes equivalent addresses and rejects invalid chains', () => {
    expect(normalizeAddress('::ffff:c000:201')).toBe('192.0.2.1');
    expect(normalizeAddress('2001:0DB8:0:0:0:0:0:1')).toBe('2001:db8::1');
    expect(normalizeAddress('fe80::1%12')).toBe('fe80::1');
    expect(normalizeAddress('garbage')).toBeNull();
    expect(socketClientAddress(request('192.0.2.1, garbage'), 2)).toBe('10.0.0.4');
    expect(socketClientAddress(request('a'.repeat(3000)), 1)).toBe('10.0.0.4');
  });
});
