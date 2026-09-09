import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { acquireUniversitySource } from './acquire.js';
import { publicLicenseDescriptor, toAcquiredSource } from './adapter.js';
import { extractAdmittedUniversitySource } from './extract.js';
import { UNIVERSITY_CANONICALIZATION_VERSION } from './types.js';
import {
  CS231N_CASE_STUDY_SHA256,
  CS231N_LICENSE_SHA256,
  DELFT_CREDITS_SHA256,
  DELFT_INTRODUCTION_SHA256,
  MIT_ABSTRACTION_SOURCE_SHA256,
  MIT_LICENSE_SHA256,
} from './attribution.js';
import { UNIVERSITY_CANDIDATE_IDS, pinnedUniversitySource } from './catalog.js';
import { extractMystMarkdown } from './extractors/myst.js';
import { extractPlutoStaticSource } from './extractors/pluto.js';
import { FIXTURE_URLS } from './fixtures.js';
import { sha256Utf8 } from './hashes.js';
import {
  canonicalRevisionFromExtraction,
  sourcePassagesFromExtraction,
} from './passages.js';
import type {
  UniversityByteTransport,
  UniversityExtractionResult,
  AttributionRecord,
} from './types.js';

async function pinnedBytes(): Promise<{
  mitSource: Uint8Array;
  mitLicense: Uint8Array;
  delftSource: Uint8Array;
  delftLicense: Uint8Array;
  cs231nSource: Uint8Array;
  cs231nLicense: Uint8Array;
}> {
  return {
    mitSource: await readFile(FIXTURE_URLS.mitAbstraction),
    mitLicense: await readFile(FIXTURE_URLS.mitLicense),
    delftSource: await readFile(FIXTURE_URLS.delftIntroduction),
    delftLicense: await readFile(FIXTURE_URLS.delftCredits),
    cs231nSource: await readFile(FIXTURE_URLS.cs231nCaseStudy),
    cs231nLicense: await readFile(FIXTURE_URLS.cs231nLicense),
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
        mediaType: url.includes('neural-networks-case-study')
          ? 'text/html'
          : 'text/plain',
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
  const cs231n = pinnedUniversitySource(
    UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
  );
  if (mit === null || delft === null || cs231n === null) {
    throw new Error('Missing pins.');
  }
  return transportFor(
    new Map([
      [mit.source.url, files.mitSource],
      [mit.license.url, files.mitLicense],
      [delft.source.url, files.delftSource],
      [delft.license.url, files.delftLicense],
      [cs231n.source.url, files.cs231nSource],
      [cs231n.license.url, files.cs231nLicense],
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
    expect(acquired.licenseBytesSha256).toBe(DELFT_CREDITS_SHA256);
    expect(acquired.indexing).toBe('not-indexed');
    expect(acquired.document.text).toContain('[^6]:');
    expect(acquired.document.text).toContain('Photons have no mass');
  });

  it('hands acquired revisions and exact canonical passages into existing indexing', async () => {
    const mit = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(mit.outcome).toBe('extraction-ready');
    if (mit.outcome !== 'extraction-ready') return;
    const mitRevision = canonicalRevisionFromExtraction(mit);
    const mitSource = toAcquiredSource(mit, {
      status: 'unknown',
      reason: 'This source is extraction-ready and is not production indexed.',
    });
    expect(mitSource.content.state).toBe('acquired');
    expect(mitSource.content.revision).toEqual(mitRevision);
    expect(mitSource.usePolicy.indexing.status).toBe('unknown');
    expect(mitRevision.canonicalizationVersion).toBe(
      UNIVERSITY_CANONICALIZATION_VERSION,
    );
    expect(mitRevision.sha256).toBe(sha256Utf8(mitRevision.canonicalText));
    expect(mitRevision.canonicalText).toContain(
      'function insert(new, A, i, j)',
    );
    expect(mitRevision.canonicalText).not.toContain('@bind');
    expect(mitRevision.canonicalText).not.toContain(
      'PLUTO_PROJECT_TOML_CONTENTS',
    );
    const mitPassages = sourcePassagesFromExtraction(mit);
    expect(mitPassages.length).toBeGreaterThan(0);
    for (const passage of mitPassages) {
      expect(
        mitRevision.canonicalText.slice(
          passage.locator.start,
          passage.locator.end,
        ),
      ).toBe(passage.locator.quote);
    }

    const delft = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(delft.outcome).toBe('extraction-ready');
    if (delft.outcome !== 'extraction-ready') return;
    const delftRevision = canonicalRevisionFromExtraction(delft);
    const delftSource = toAcquiredSource(delft, {
      status: 'unknown',
      reason: 'This source is extraction-ready and is not production indexed.',
    });
    expect(delftSource.content.revision.sha256).toBe(delftRevision.sha256);
    expect(delftRevision.canonicalText).toContain('[^6]:');
    expect(delftRevision.canonicalText).toContain('Photons have no mass');
    expect(delftRevision.canonicalText).toContain('\\hbar');
    const delftPassages = sourcePassagesFromExtraction(delft);
    expect(delftPassages.length).toBeGreaterThan(0);
    for (const passage of delftPassages) {
      expect(
        delftRevision.canonicalText.slice(
          passage.locator.start,
          passage.locator.end,
        ),
      ).toBe(passage.locator.quote);
    }
  });

  it('canonicalizes the pinned Stanford CS231n HTML lesson into exact passages', async () => {
    const files = await pinnedBytes();
    expect(files.cs231nSource.byteLength).toBe(56_638);
    expect(files.cs231nLicense.byteLength).toBe(1_082);
    const acquired = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(acquired.outcome).toBe('extraction-ready');
    if (acquired.outcome !== 'extraction-ready') return;
    expect(acquired.sourceBytesSha256).toBe(CS231N_CASE_STUDY_SHA256);
    expect(acquired.licenseBytesSha256).toBe(CS231N_LICENSE_SHA256);
    expect(acquired.document.format).toBe('html');
    expect(acquired.document.text).toContain(
      'Training a Softmax Linear Classifier',
    );
    expect(acquired.document.text).toContain('Training a Neural Network');
    expect(acquired.document.text).toContain('X = np.zeros((N*K,D))');
    expect(acquired.document.text.length).toBeLessThanOrEqual(48_000);
    expect(acquired.document.extraction.coverage).toBe('partial');
    const revision = canonicalRevisionFromExtraction(acquired);
    expect(revision.sha256).toBe(sha256Utf8(revision.canonicalText));
    const passages = sourcePassagesFromExtraction(acquired);
    expect(passages.length).toBeGreaterThan(0);
    expect(
      passages.some((passage) =>
        passage.locator.quote.includes('linear classifier'),
      ),
    ).toBe(true);
    for (const passage of passages) {
      expect(
        revision.canonicalText.slice(
          passage.locator.start,
          passage.locator.end,
        ),
      ).toBe(passage.locator.quote);
    }
    const source = toAcquiredSource(acquired, {
      status: 'unknown',
      reason: 'This source is extraction-ready and is not production indexed.',
    });
    expect(source.kind).toBe('chapter');
    expect(source.relationships[0]?.kind).toBe('chapter-of-course');
    expect(source.usePolicy.license).toMatchObject({
      status: 'known',
      spdxId: 'MIT',
    });
  });

  it('does not turn directory metadata into extraction-ready passages', async () => {
    const result = await acquireUniversitySource({
      candidateId: 'univ_stan_cs229',
      transport: await pinnedTransport(),
      signal: new AbortController().signal,
      clock,
    });
    expect(result.outcome).toBe('directory-only');
    expect(isExtractionReady(result)).toBe(false);
  });

  it('refuses HTML media as a complete university lesson', async () => {
    const files = await pinnedBytes();
    const mit = pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
    if (mit === null) throw new Error('Missing MIT pin.');
    const result = await acquireUniversitySource({
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      transport: {
        async fetch(url, signal) {
          if (signal.aborted) return { outcome: 'cancelled' };
          const bytes =
            url === mit.source.url ? files.mitSource : files.mitLicense;
          return {
            outcome: 'success',
            requestedUrl: url,
            acquiredUrl: url,
            mediaType: url === mit.source.url ? 'text/html' : 'text/plain',
            bytes,
            redirectCount: 0,
          };
        },
      },
      signal: new AbortController().signal,
      clock,
    });
    expect(result.outcome).toBe('unsupported');
    if (result.outcome !== 'unsupported') return;
    expect(result.message).toContain('HTML was not admitted');
  });

  it('dispatches extractors without inventing a pin and reports malformed Pluto', () => {
    expect(
      extractAdmittedUniversitySource({
        candidateId: 'univ_not_pinned',
        bytes: new Uint8Array(),
      }),
    ).toMatchObject({ outcome: 'unsupported', reason: 'no-pinned-extractor' });
    expect(
      extractAdmittedUniversitySource({
        candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
        bytes: new TextEncoder().encode('not a notebook'),
      }),
    ).toMatchObject({ outcome: 'unsupported' });
    expect(
      extractAdmittedUniversitySource({
        candidateId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
        bytes: new TextEncoder().encode('```\nunclosed'),
      }),
    ).toMatchObject({ outcome: 'malformed-content' });
  });

  it('does not invent a public license from empty attribution components', () => {
    const empty: AttributionRecord = {
      authors: [],
      copyrightHolders: [],
      title: 'Empty',
      edition: null,
      sourceCommit: null,
      originalUrl: 'https://example.edu/empty',
      acquisitionUrl: null,
      licenseComponents: [],
      licenseEvidenceUrl: null,
      licenseEvidenceSha256: null,
      exceptions: [],
      transformationSummary: [],
      compatibleExportObligations: [],
    };
    expect(publicLicenseDescriptor(empty)).toEqual({
      status: 'known',
      name: 'Unknown',
      spdxId: null,
      url: null,
    });
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
