import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GUARDED_HTTP_LIMITS } from '../sourcing/acquisition/guarded-http.js';
import { admitUniversityBytes } from './admission.js';
import { UNIVERSITY_CANDIDATE_IDS, pinnedUniversitySource } from './catalog.js';
import { FIXTURE_URLS } from './fixtures.js';
import { sha256Bytes } from './hashes.js';
import type {
  UniversityByteFetchResult,
  UniversityByteTransport,
} from './types.js';

async function fixtureTransport(options?: {
  sourceOverride?: Uint8Array;
  licenseOverride?: Uint8Array;
  sourceResult?: UniversityByteFetchResult;
}): Promise<UniversityByteTransport> {
  const mit = pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
  if (mit === null) throw new Error('Missing MIT pin.');
  const source =
    options?.sourceOverride ?? (await readFile(FIXTURE_URLS.mitAbstraction));
  const license =
    options?.licenseOverride ?? (await readFile(FIXTURE_URLS.mitLicense));
  return {
    async fetch(url, signal) {
      if (signal.aborted) return { outcome: 'cancelled' };
      if (options?.sourceResult !== undefined && url === mit.source.url) {
        return options.sourceResult;
      }
      if (url === mit.source.url) {
        return success(mit.source.url, source);
      }
      if (url === mit.license.url) {
        return success(mit.license.url, license);
      }
      return { outcome: 'unavailable' };
    },
  };
}

function success(url: string, bytes: Uint8Array): UniversityByteFetchResult {
  return {
    outcome: 'success',
    requestedUrl: url,
    acquiredUrl: url,
    mediaType: 'text/plain',
    bytes,
    redirectCount: 0,
  };
}

describe('university byte admission', () => {
  it('admits only when source and license hashes match the pinned review', async () => {
    const admitted = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport(),
      signal: new AbortController().signal,
    });
    expect(admitted.outcome).toBe('admitted');
    if (admitted.outcome !== 'admitted') return;
    expect(admitted.sourceBytesSha256).toBe(
      pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction)?.source
        .sha256,
    );
    expect(admitted.licenseBytesSha256).toBe(
      pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction)?.license
        .sha256,
    );
  });

  it('refuses a corrupt source or license hash', async () => {
    const source = Uint8Array.from(await readFile(FIXTURE_URLS.mitAbstraction));
    source[0] = source[0] === 0 ? 1 : 0;
    const sourceMismatch = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport({ sourceOverride: source }),
      signal: new AbortController().signal,
    });
    expect(sourceMismatch.outcome).toBe('hash-mismatch');
    const license = Uint8Array.from(await readFile(FIXTURE_URLS.mitLicense));
    license[0] = license[0] === 0 ? 1 : 0;
    const licenseMismatch = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport({ licenseOverride: license }),
      signal: new AbortController().signal,
    });
    expect(licenseMismatch.outcome).toBe('hash-mismatch');
  });

  it('refuses oversized injected bytes and cancelled transport', async () => {
    const oversized = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport({
        sourceOverride: new Uint8Array(
          GUARDED_HTTP_LIMITS.decompressedBytes + 1,
        ),
      }),
      signal: new AbortController().signal,
    });
    expect(oversized.outcome).toBe('oversized');
    const controller = new AbortController();
    controller.abort();
    const cancelled = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport(),
      signal: controller.signal,
    });
    expect(cancelled.outcome).toBe('cancelled');
  });

  it('does not mint a canonical hash for the BCcampus challenge-blocked chapter', async () => {
    const result = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.bccampusSql,
      transport: {
        fetch: async () => ({ outcome: 'unavailable' }),
      },
      signal: new AbortController().signal,
    });
    expect(result.outcome).toBe('unavailable');
    expect(result).not.toHaveProperty('sourceBytesSha256');
    expect(
      pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.bccampusSql),
    ).toBeNull();
  });

  it('keeps directory entries from becoming admitted bytes', async () => {
    const result = await admitUniversityBytes({
      candidateId: 'univ_mit_6100l',
      transport: {
        fetch: async () => success('https://ocw.mit.edu/', new Uint8Array([1])),
      },
      signal: new AbortController().signal,
    });
    expect(result.outcome).toBe('directory-only');
    expect(sha256Bytes(new Uint8Array([1]))).not.toBe(
      'sourceBytesSha256' in result ? result.sourceBytesSha256 : '',
    );
  });

  it('fails closed on unknown ids, timeouts, unsupported MIME, and license cancel', async () => {
    const unknown = await admitUniversityBytes({
      candidateId: 'univ_not_a_source',
      transport: await fixtureTransport(),
      signal: new AbortController().signal,
    });
    expect(unknown.outcome).toBe('invalid-source');
    const timedOut = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport({
        sourceResult: { outcome: 'timed-out' },
      }),
      signal: new AbortController().signal,
    });
    expect(timedOut.outcome).toBe('timed-out');
    const unsupported = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await fixtureTransport({
        sourceResult: { outcome: 'unsupported', mediaType: 'application/pdf' },
      }),
      signal: new AbortController().signal,
    });
    expect(unsupported.outcome).toBe('unsupported');
    const mit = pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
    if (mit === null) throw new Error('Missing MIT pin.');
    const source = await readFile(FIXTURE_URLS.mitAbstraction);
    const cancelledLicense = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: {
        async fetch(url) {
          if (url === mit.source.url) return success(mit.source.url, source);
          return { outcome: 'cancelled' };
        },
      },
      signal: new AbortController().signal,
    });
    expect(cancelledLicense.outcome).toBe('cancelled');
  });

  it('records BCcampus success without minting a canonical hash', async () => {
    const result = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.bccampusSql,
      transport: {
        fetch: async (url) =>
          success(url, new TextEncoder().encode('<html>not original</html>')),
      },
      signal: new AbortController().signal,
    });
    expect(result.outcome).toBe('acquisition-pending');
    expect(result).not.toHaveProperty('sourceBytesSha256');
  });

  it('cancels when the signal is aborted after the source fetch', async () => {
    const mit = pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
    if (mit === null) throw new Error('Missing MIT pin.');
    const source = await readFile(FIXTURE_URLS.mitAbstraction);
    const controller = new AbortController();
    const result = await admitUniversityBytes({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: {
        async fetch(url) {
          if (url === mit.source.url) {
            controller.abort();
            return success(mit.source.url, source);
          }
          return { outcome: 'unavailable' };
        },
      },
      signal: controller.signal,
    });
    expect(result.outcome).toBe('cancelled');
  });
});
