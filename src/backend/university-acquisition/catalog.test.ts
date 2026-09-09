import { describe, expect, it } from 'vitest';
import {
  PINNED_UNIVERSITY_SOURCES,
  UNIVERSITY_CANDIDATES,
  UNIVERSITY_CANDIDATE_IDS,
  pinnedUniversitySource,
  universityCandidate,
} from './catalog.js';
import { EXTERNAL_COURSE_DIRECTORY, externalCourseEntry } from './directory.js';
import { MIT_ABSTRACTION_SOURCE_SHA256 } from './attribution.js';
import * as universityAcquisition from './index.js';

describe('university source catalog states', () => {
  it('keeps candidate metadata, rights, extraction and indexing separate', () => {
    const mit = universityCandidate(UNIVERSITY_CANDIDATE_IDS.mitAbstraction);
    const delft = universityCandidate(
      UNIVERSITY_CANDIDATE_IDS.delftQuantization,
    );
    const sql = universityCandidate(UNIVERSITY_CANDIDATE_IDS.bccampusSql);
    expect(mit?.permission).toBe('hash-verified');
    expect(mit?.extraction).toBe('pending');
    expect(mit?.indexing).toBe('not-indexed');
    expect(delft?.format).toBe('myst-markdown');
    expect(sql?.reachability).toBe('challenge-blocked');
    expect(sql?.permission).toBe('pending-evidence');
    expect(sql?.extraction).toBe('none');
    expect(
      PINNED_UNIVERSITY_SOURCES.map((entry) => entry.source.sha256),
    ).toContain(MIT_ABSTRACTION_SOURCE_SHA256);
    expect(
      pinnedUniversitySource(UNIVERSITY_CANDIDATE_IDS.bccampusSql),
    ).toBeNull();
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
    expect(universityAcquisition.EXTERNAL_COURSE_DIRECTORY).toHaveLength(3);
  });
});
