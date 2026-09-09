import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { acquireUniversitySource } from './acquire.js';
import { toAcquiredSource, toRetrieveEvidenceResponse } from './adapter.js';
import {
  DELFT_INTRODUCTION_SHA256,
  MIT_ABSTRACTION_SOURCE_SHA256,
  MIT_LICENSE_SHA256,
} from './attribution.js';
import { UNIVERSITY_CANDIDATE_IDS, pinnedUniversitySource } from './catalog.js';
import { extractMystMarkdown } from './extractors/myst.js';
import { extractPlutoStaticSource } from './extractors/pluto.js';
import { FIXTURE_URLS } from './fixtures.js';
import { sha256Utf8 } from './hashes.js';
import { sourcePassagesFromExtraction } from './passages.js';
import type {
  UniversityByteTransport,
  UniversityExtractionResult,
} from './types.js';

async function pinnedBytes(): Promise<{
  mitSource: Uint8Array;
  mitLicense: Uint8Array;
  delftSource: Uint8Array;
  delftLicense: Uint8Array;
}> {
  return {
    mitSource: await readFile(FIXTURE_URLS.mitAbstraction),
    mitLicense: await readFile(FIXTURE_URLS.mitLicense),
    delftSource: await readFile(FIXTURE_URLS.delftIntroduction),
    delftLicense: await readFile(FIXTURE_URLS.delftCredits),
  };
}

function transportFor(
  mapping: ReadonlyMap<string, Uint8Array>,
): UniversityByteTransport {
  return {
    async fetch(url, signal) {
      if (signal.aborted) return { outcome: 'cancelled' };
      const bytes = mapping.get(url);
      if (bytes === undefined) return { outcome: 'unavailable' };
      return {
        outcome: 'success',
        requestedUrl: url,
        acquiredUrl: url,
        mediaType: 'text/plain',
        bytes,
        redirectCount: 0,
      };
    },
  };
}

async function pinnedTransport(): Promise<UniversityByteTransport> {
  const files = await pinnedBytes();
  const mit = pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
  const delft = pinnedUniversitySource(
    UNIVERSITY_CANDIDATE_IDS.delftQuantization,
  );
  if (mit === null || delft === null) throw new Error('Missing pins.');
  return transportFor(
    new Map([
      [mit.source.url, files.mitSource],
      [mit.license.url, files.mitLicense],
      [delft.source.url, files.delftSource],
      [delft.license.url, files.delftLicense],
    ]),
  );
}

const clock = { now: () => new Date('2026-09-09T09:20:00.000Z') };

describe('pinned university acquisition', () => {
  it('extracts MIT Pluto static cells in display order from the pinned bytes', async () => {
    const files = await pinnedBytes();
    expect(files.mitSource.byteLength).toBe(24_463);
    const parsed = extractPlutoStaticSource(files.mitSource);
    expect(parsed.outcome).toBe('success');
    if (parsed.outcome !== 'success') return;
    const text = parsed.document.text;
    expect(text.indexOf('Initializing packages')).toBeLessThan(
      text.indexOf('using PlutoUI'),
    );
    expect(text).toContain('## Introduction');
    expect(text).toContain('function insert(new, A, i, j)');
    expect(text).not.toContain('PLUTO_PROJECT_TOML_CONTENTS');
    expect(text).not.toContain('PLUTO_MANIFEST_TOML_CONTENTS');
    expect(text).not.toContain('youtube_id');
    expect(text).not.toContain('load(download(');
    expect(text).not.toContain('@bind');
    expect(parsed.document.extraction.coverage).toBe('partial');
    expect(parsed.document.gaps.map((gap) => gap.kind)).toEqual(
      expect.arrayContaining([
        'frontmatter-media',
        'notebook-runtime',
        'widget',
        'remote-download',
        'toml-runtime',
      ]),
    );
    const acquired = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(acquired.outcome).toBe('extraction-ready');
    if (acquired.outcome !== 'extraction-ready') return;
    expect(acquired.sourceBytesSha256).toBe(MIT_ABSTRACTION_SOURCE_SHA256);
    expect(acquired.licenseBytesSha256).toBe(MIT_LICENSE_SHA256);
    expect(acquired.indexing).toBe('not-indexed');
    expect(
      acquired.attribution.licenseComponents.map((item) => item.spdxId),
    ).toEqual(['CC-BY-SA-4.0', 'MIT']);
    const again = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(again).toEqual(acquired);
  });

  it('extracts the Delft quantization slice with TeX, footnote 6, and explicit media gaps', async () => {
    const files = await pinnedBytes();
    expect(files.delftSource.byteLength).toBe(120_676);
    const parsed = extractMystMarkdown(files.delftSource, {
      slice: { startLine: 52, endLine: 128 },
      includeFootnotes: ['6'],
    });
    expect(parsed.outcome).toBe('success');
    if (parsed.outcome !== 'success') return;
    expect(parsed.document.text).toContain(
      'Matter: quantization of (angular) momentum',
    );
    expect(parsed.document.text).toContain('\\hbar');
    expect(parsed.document.text).toContain('deBroglieenergy');
    expect(parsed.document.text).toContain('Photons have no mass');
    expect(parsed.document.text).not.toContain('HydrogenVisibleSpectrum.jpg');
    expect(parsed.document.text).not.toContain('xkcd.com');
    expect(parsed.document.text).not.toContain('unsplash.com');
    expect(
      parsed.document.gaps.some((gap) => gap.kind === 'unsupported-media'),
    ).toBe(true);
    const locators = parsed.document.locators.filter((locator) =>
      locator.sectionPath.some((part) => part.includes('quantization')),
    );
    expect(locators[0]?.sourceStartLine).toBe(52);
    const whole = extractMystMarkdown(files.delftSource, {
      slice: null,
      includeFootnotes: [],
    });
    expect(whole.outcome).toBe('success');
    if (whole.outcome !== 'success') return;
    expect(sha256Utf8(whole.document.text)).not.toBe(
      sha256Utf8(parsed.document.text),
    );
    const acquired = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(acquired.outcome).toBe('extraction-ready');
    if (acquired.outcome !== 'extraction-ready') return;
    expect(acquired.sourceBytesSha256).toBe(DELFT_INTRODUCTION_SHA256);
    expect(acquired.indexing).toBe('not-indexed');
  });

  it('adapts attributed passages onto the existing retrieval validator without indexing', async () => {
    const acquired = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(acquired.outcome).toBe('extraction-ready');
    if (acquired.outcome !== 'extraction-ready') return;
    const source = toAcquiredSource(acquired, {
      status: 'unknown',
      reason: 'This source is extraction-ready and is not production indexed.',
    });
    expect(source.usePolicy.indexing.status).toBe('unknown');
    expect(source.content.revision.format).toBe('markdown');
    const passages = sourcePassagesFromExtraction(acquired);
    expect(passages.length).toBeGreaterThan(0);
    const quote = passages[0]?.locator.quote ?? '';
    expect(
      source.content.revision.canonicalText.slice(
        passages[0]?.locator.start ?? 0,
        passages[0]?.locator.end ?? 0,
      ),
    ).toBe(quote);
    const evidence = toRetrieveEvidenceResponse({
      result: acquired,
      indexing: {
        status: 'permitted',
        basis: 'license',
        evidenceUrl:
          acquired.attribution.licenseEvidenceUrl ??
          acquired.attribution.originalUrl,
      },
      retrievedAt: '2026-09-09T09:20:00.000Z',
      request: {
        apiVersion: '2026-09-08',
        requestId: 'request-01',
        intent: 'learning',
        query: 'quantization of angular momentum',
        sourceRevisions: [
          {
            sourceId: source.content.revision.sourceId,
            revisionId: source.content.revision.revisionId,
            sha256: source.content.revision.sha256,
            canonicalizationVersion:
              source.content.revision.canonicalizationVersion,
          },
        ],
        maxPassages: 8,
      },
    });
    expect(evidence.outcome).toBe('success');
    if (evidence.outcome !== 'success') return;
    expect(evidence.evidence[0]?.provenance.rankingMethod).toBe(
      'exact-canonical-offset-handoff',
    );
    expect(evidence.evidence[0]?.sourceQuality).toBe('unknown');
  });

  it('does not turn directory metadata into extraction-ready passages', async () => {
    const result = await acquireUniversitySource({
      candidateId: 'univ_yale_phys200',
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(result.outcome).toBe('directory-only');
    expect(isExtractionReady(result)).toBe(false);
  });
});

function isExtractionReady(
  result: UniversityExtractionResult,
): result is Extract<
  UniversityExtractionResult,
  { outcome: 'extraction-ready' }
> {
  return result.outcome === 'extraction-ready';
}
