import { describe, expect, it } from 'vitest';
import { isPublicAddress, parsePublicHttpsUrl } from './url-policy.js';

describe('public source URL policy', () => {
  it.each(['api_key', 'access_token', 'X-Amz-Signature', 'X-Goog-Credential'])(
    'rejects credential-bearing query parameter %s',
    (key) => {
      expect(
        parsePublicHttpsUrl(`https://example.org/a?${key}=synthetic-secret`),
      ).toBeNull();
    },
  );

  it.each([
    { address: '10.0.0.1', family: 4 },
    { address: '100.64.0.1', family: 4 },
    { address: '127.0.0.1', family: 4 },
    { address: '169.254.1.1', family: 4 },
    { address: '172.16.0.1', family: 4 },
    { address: '192.168.0.1', family: 4 },
    { address: '198.51.100.1', family: 4 },
    { address: '203.0.113.1', family: 4 },
    { address: '::1', family: 6 },
    { address: 'fc00::1', family: 6 },
    { address: 'fe80::1', family: 6 },
    { address: '2001:db8::1', family: 6 },
    { address: '2002:0a00:0001::1', family: 6 },
  ] as const)('rejects non-public address $address', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    { address: '8.8.8.8', family: 4 },
    { address: '151.101.0.223', family: 4 },
    { address: '2606:4700:4700::1111', family: 6 },
  ] as const)('accepts globally routable address $address', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it('normalizes an ordinary HTTPS URL only after enforcing URL-level rules', () => {
    expect(
      parsePublicHttpsUrl('https://EXAMPLE.org/a/../reading'),
    ).toMatchObject({ href: 'https://example.org/reading' });
    expect(parsePublicHttpsUrl('/local/file.txt')).toBeNull();
  });
});
