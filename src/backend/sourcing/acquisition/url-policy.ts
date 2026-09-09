import { isIP } from 'node:net';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

const FORBIDDEN_HOST_SUFFIXES = [
  '.example',
  '.home',
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.onion',
  '.test',
] as const;

const CREDENTIAL_PARAMETERS = new Set([
  'api_key',
  'apikey',
  'access_token',
  'token',
  'authorization',
  'password',
  'secret',
  'signature',
  'sig',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'x-goog-signature',
  'x-goog-credential',
]);

export function parsePublicHttpsUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = unbracketHostname(url.hostname).toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    [...url.searchParams.keys()].some((key) =>
      CREDENTIAL_PARAMETERS.has(key.toLowerCase()),
    ) ||
    (url.port !== '' && url.port !== '443') ||
    url.hash !== '' ||
    hostname === '' ||
    hostname === 'localhost' ||
    FORBIDDEN_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return null;
  }
  const addressFamily = isIP(hostname);
  if (addressFamily === 0) return url;
  if (addressFamily === 4 || addressFamily === 6) {
    return isPublicAddress({ address: hostname, family: addressFamily })
      ? url
      : null;
  }
  return null;
}

export function isPublicAddress(resolved: ResolvedAddress): boolean {
  if (resolved.family === 4) return isPublicIpv4(resolved.address);
  return isPublicIpv6(resolved.address);
}

export function hostnameForResolution(url: URL): string {
  return unbracketHostname(url.hostname);
}

function unbracketHostname(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isPublicIpv4(value: string): boolean {
  const octets = value.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const first = octets[0] ?? 0;
  const second = octets[1] ?? 0;
  const third = octets[2] ?? 0;
  if (first === 0 || first === 10 || first === 127 || first >= 224)
    return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 0 && (third === 0 || third === 2))
    return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 192 && second === 168) return false;
  if (first === 198 && (second === 18 || second === 19)) {
    return false;
  }
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIpv6(value: string): boolean {
  const groups = parseIpv6(value);
  if (groups === null) return false;
  const first = groups[0] ?? 0;
  const second = groups[1] ?? 0;
  const isGlobalUnicast = first >= 0x2000 && first <= 0x3fff;
  const isTeredo = first === 0x2001 && second === 0;
  const isDocumentation = first === 0x2001 && second === 0x0db8;
  const isBenchmark = first === 0x2001 && second === 0x0002;
  const isOrchid = first === 0x2001 && second >= 0x0010 && second <= 0x002f;
  const isSixToFour = first === 0x2002;
  const isSecondDocumentationPrefix = first === 0x3fff && second <= 0x0fff;
  return (
    isGlobalUnicast &&
    !isTeredo &&
    !isDocumentation &&
    !isBenchmark &&
    !isOrchid &&
    !isSixToFour &&
    !isSecondDocumentationPrefix
  );
}

function parseIpv6(value: string): readonly number[] | null {
  if (value.includes('.')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = parseIpv6Half(halves[0] ?? '');
  const right = parseIpv6Half(halves[1] ?? '');
  if (left === null || right === null) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const omittedGroups = 8 - left.length - right.length;
  if (omittedGroups < 1) return null;
  return [...left, ...Array.from({ length: omittedGroups }, () => 0), ...right];
}

function parseIpv6Half(value: string): readonly number[] | null {
  if (value === '') return [];
  const groups = value.split(':');
  const parsed = groups.map((group) => Number.parseInt(group, 16));
  if (
    groups.some((group) => !/^[0-9a-f]{1,4}$/iu.test(group)) ||
    parsed.some((group) => !Number.isInteger(group))
  ) {
    return null;
  }
  return parsed;
}
