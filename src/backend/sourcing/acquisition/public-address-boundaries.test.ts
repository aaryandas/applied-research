import { describe, expect, it } from 'vitest';
import {
  hostnameForResolution,
  isPublicAddress,
  parsePublicHttpsUrl,
} from './url-policy.js';

describe('public address classification boundaries', () => {
  it.each([
    {
      label: 'this-network 0.1.2.3',
      address: '0.1.2.3',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'adjacent public 1.0.0.1',
      address: '1.0.0.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'multicast 224.0.0.1',
      address: '224.0.0.1',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'adjacent unicast 223.255.255.255',
      address: '223.255.255.255',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'IETF protocol 192.0.0.1',
      address: '192.0.0.1',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'TEST-NET-1 192.0.2.1',
      address: '192.0.2.1',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'adjacent 192.0.1.1',
      address: '192.0.1.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'adjacent 192.0.3.1',
      address: '192.0.3.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: '6to4 relay 192.88.99.1',
      address: '192.88.99.1',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'adjacent 192.88.98.1',
      address: '192.88.98.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'benchmark 198.18.0.1',
      address: '198.18.0.1',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'benchmark 198.19.0.1',
      address: '198.19.0.1',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'adjacent 198.17.0.1',
      address: '198.17.0.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'adjacent 198.20.0.1',
      address: '198.20.0.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'CGNAT below 100.63.255.255',
      address: '100.63.255.255',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'CGNAT last 100.127.255.255',
      address: '100.127.255.255',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'CGNAT above 100.128.0.1',
      address: '100.128.0.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'RFC1918 172 below 172.15.255.255',
      address: '172.15.255.255',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'RFC1918 172 last 172.31.255.255',
      address: '172.31.255.255',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'RFC1918 172 above 172.32.0.1',
      address: '172.32.0.1',
      family: 4 as const,
      expected: true,
    },
    {
      label: 'Teredo 2001::1',
      address: '2001::1',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'benchmark 2001:2::1',
      address: '2001:2::1',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'ORCHID 2001:10::1',
      address: '2001:10::1',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'ORCHID last 2001:2f::1',
      address: '2001:2f::1',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'second documentation 3fff:fff::1',
      address: '3fff:fff::1',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'adjacent global 2001:1::1',
      address: '2001:1::1',
      family: 6 as const,
      expected: true,
    },
    {
      label: 'adjacent global 2000::1',
      address: '2000::1',
      family: 6 as const,
      expected: true,
    },
    {
      label: 'adjacent after ORCHID 2001:30::1',
      address: '2001:30::1',
      family: 6 as const,
      expected: true,
    },
    {
      label: 'adjacent after second docs 3fff:1000::1',
      address: '3fff:1000::1',
      family: 6 as const,
      expected: true,
    },
    {
      label: 'eight-group uncompressed public',
      address: '2606:4700:4700:0000:0000:0000:0000:1111',
      family: 6 as const,
      expected: true,
    },
    {
      label: 'too many groups',
      address: '1:2:3:4:5:6:7:8:9',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'repeated ::',
      address: '2001::1::2',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'invalid hex',
      address: '2001::gggg',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'embedded IPv4',
      address: '2001:db8::192.0.2.1',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'too few uncompressed groups',
      address: '2606:4700:4700:0:0:0:1111',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'compressed with no omitted group',
      address: '1:2:3:4:5:6:7::8',
      family: 6 as const,
      expected: false,
    },
    {
      label: 'overrange IPv4 octet',
      address: '1.2.3.256',
      family: 4 as const,
      expected: false,
    },
    {
      label: 'short IPv4',
      address: '1.2.3',
      family: 4 as const,
      expected: false,
    },
  ])('$label', ({ address, family, expected }) => {
    expect(isPublicAddress({ address, family })).toBe(expected);
  });
});

describe('public HTTPS URL and hostname boundaries', () => {
  it('accepts a public IPv4 literal and rejects a private IPv4 literal', () => {
    expect(parsePublicHttpsUrl('https://8.8.8.8/reading')?.href).toBe(
      'https://8.8.8.8/reading',
    );
    expect(parsePublicHttpsUrl('https://10.0.0.1/reading')).toBeNull();
  });

  it('accepts a public IPv6 literal URL and rejects loopback', () => {
    expect(
      parsePublicHttpsUrl('https://[2606:4700:4700::1111]/reading')?.hostname,
    ).toBe('[2606:4700:4700::1111]');
    expect(parsePublicHttpsUrl('https://[::1]/reading')).toBeNull();
    expect(parsePublicHttpsUrl('https://[fc00::1]/reading')).toBeNull();
  });

  it('removes brackets from an IPv6 hostname before resolution', () => {
    const url = new URL('https://example.org/reading');
    Object.defineProperty(url, 'hostname', {
      value: '[2606:4700:4700::1111]',
    });
    expect(hostnameForResolution(url)).toBe('2606:4700:4700::1111');
    expect(
      hostnameForResolution(new URL('https://[2606:4700:4700::1111]/reading')),
    ).toBe('2606:4700:4700::1111');
  });
});
