import { describe, expect, it } from 'vitest';
import { SOURCE_KINDS } from '../../contracts/sourcing.js';
import { parseDiscoverSourcesResponse } from '../sourcing/contract-validation.js';
import { CS231N_CASE_STUDY_SHA256 } from './attribution.js';
import {
  PINNED_UNIVERSITY_SOURCES,
  UNIVERSITY_CANDIDATES,
  UNIVERSITY_CANDIDATE_IDS,
  pinnedUniversitySource,
  universityCandidate,
} from './catalog.js';
import { universityCatalogSources } from './catalog-sources.js';
import {
  EXTERNAL_COURSE_DIRECTORY,
  UNIVERSITY_DIRECTORY_IDS,
  externalCourseEntry,
} from './directory.js';
import * as universityAcquisition from './index.js';

describe('university source catalog states', () => {
  it('keeps candidate metadata, rights, extraction and indexing separate', () => {
    const mit = universityCandidate(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
    const delft = universityCandidate(
      UNIVERSITY_CANDIDATE_IDS.delftQuantization,
    );
    const stanford = universityCandidate(
      UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
    );
    expect(mit?.permission).toBe('hash-verified');
    expect(mit?.extraction).toBe('pending');
    expect(mit?.indexing).toBe('not-indexed');
    expect(delft?.format).toBe('myst-markdown');
    expect(stanford?.format).toBe('html');
    expect(stanford?.kind).toBe('chapter');
    expect(
      PINNED_UNIVERSITY_SOURCES.map((entry) => entry.source.sha256),
    ).toContain(CS231N_CASE_STUDY_SHA256);
    expect(
      universityCandidate(UNIVERSITY_DIRECTORY_IDS.stanfordCs229),
    ).toBeNull();
  });

  it('exposes learner-facing catalog metadata for official courses and lectures', () => {
    const catalog = universityCatalogSources();
    expect(
      catalog.some((source) => source.sourceId === 'univ_stan_cs229'),
    ).toBe(true);
    expect(
      catalog.some((source) => source.sourceId === 'univ_berk_cs61a'),
    ).toBe(true);
    expect(
      catalog.some((source) => source.sourceId === 'univ_harv_cs50x'),
    ).toBe(true);
    expect(
      catalog.some((source) => source.sourceId === 'univ_stan_cs231n_nncs'),
    ).toBe(true);
    expect(
      catalog.some((source) => /BCcampus|dbdesign01/i.test(source.title)),
    ).toBe(false);
    const cs229 = catalog.find(
      (source) => source.sourceId === 'univ_stan_cs229',
    );
    expect(cs229?.kind).toBe('course');
    expect(cs229?.metadataSummary).toMatch(/linear regression/i);
    expect(cs229?.content.state).toBe('metadata-only');
    expect(cs229?.usePolicy.indexing.status).toBe('unknown');
    const lecture = catalog.find(
      (source) =>
        source.sourceId === UNIVERSITY_DIRECTORY_IDS.stanfordCs229Videos,
    );
    expect(lecture?.relationships[0]).toMatchObject({
      kind: 'lecture-of-course',
      parentSourceId: UNIVERSITY_DIRECTORY_IDS.stanfordCs229,
    });
    const notes = catalog.find(
      (source) =>
        source.sourceId === UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
    );
    expect(notes?.usePolicy.acquisition.status).toBe('permitted');
    expect(notes?.usePolicy.license).toMatchObject({
      status: 'known',
      spdxId: 'MIT',
    });
    expect(notes?.metadataSummary).toMatch(/linear softmax classifier/i);
    const parsed = parseDiscoverSourcesResponse(
      {
        outcome: 'success',
        requestId: 'catalog-01',
        candidates: [...catalog],
      },
      {
        apiVersion: '2026-09-08',
        requestId: 'catalog-01',
        intent: 'learning',
        query: 'machine learning neural networks python',
        kinds: [...SOURCE_KINDS],
        limit: 50,
      },
    );
    expect(parsed.outcome).toBe('success');
  });

  it('does not treat external course directory rows as extractable corpus', () => {
    expect(
      UNIVERSITY_CANDIDATES.every(
        (entry) => entry.format !== 'external-reading',
      ),
    ).toBe(true);
    for (const entry of EXTERNAL_COURSE_DIRECTORY) {
      expect(entry.format).toBe('external-reading');
      expect(entry.permission).toBe('directory-only');
      expect(entry.extraction).toBe('none');
      expect(entry.indexing).toBe('not-indexed');
      expect(entry.acquisitionUrl).toBeNull();
      expect(pinnedUniversitySource(entry.id)).toBeNull();
      expect(externalCourseEntry(entry.id)?.sourceId).toBe(entry.sourceId);
    }
    expect(universityAcquisition.UNIVERSITY_CANONICALIZATION_VERSION).toBe(
      'univ-canon-v1',
    );
    expect(universityAcquisition.universityCatalogSources().length).toBe(
      UNIVERSITY_CANDIDATES.length + EXTERNAL_COURSE_DIRECTORY.length,
    );
  });
});
