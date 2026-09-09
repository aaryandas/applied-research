import { describe, expect, it } from 'vitest';
import type {
  SourceCitation,
  SourceRecord,
  SourceVersion,
} from '../../contracts/learning-records';
import {
  citedSourceVersion,
  generatedLessonCitations,
  uniqueSourceCitations,
} from './generated-citations';

const original: SourceVersion = {
  revisionId: 'source-v1',
  sourceId: 'source',
  revision: 1,
  title: 'Original notes',
  canonicalText: 'Exact cited passage and later wording.',
  sha256: 'synthetic',
  format: 'plain-text',
  canonicalizationVersion: '1',
  acquiredAt: '2026-09-08T12:00:00Z',
  provenance: { kind: 'human-imported', locator: null },
};

const current: SourceVersion = {
  ...original,
  revisionId: 'source-v2',
  revision: 2,
  title: 'Updated notes',
  canonicalText: 'Rewritten current source without the cited span.',
};

const citation: SourceCitation = {
  sourceId: 'source',
  revisionId: 'source-v1',
  start: 0,
  end: 19,
  quote: 'Exact cited passage',
};

const generated: SourceVersion = {
  revisionId: 'generated-v1',
  sourceId: 'generated',
  revision: 1,
  title: 'Generated lesson',
  canonicalText: 'Teaching prose that is not the original.',
  sha256: 'synthetic',
  format: 'plain-text',
  canonicalizationVersion: '1',
  acquiredAt: '2026-09-08T12:00:00Z',
  provenance: {
    kind: 'generated',
    locator: null,
    remoteSourceId: 'remote',
    remoteRevisionId: 'remote-rev',
    requestId: 'request-1',
    generation: {
      author: 'ai',
      provider: 'openrouter',
      providerRequestId: 'prv',
      model: 'google/gemini-3.8-flash',
      requestVersion: '2026-09-08',
      promptVersion: '1',
      createdAt: '2026-09-08T12:00:00Z',
      sourceRevisions: [],
    },
    citations: [citation],
  },
};

const sources: SourceRecord[] = [
  {
    id: 'source',
    projectId: 'project',
    currentRevision: 2,
    currentVersionId: current.revisionId,
    currentVersion: current,
    createdAt: original.acquiredAt,
    versions: [original, current],
  },
];

describe('generated lesson citations', () => {
  it('keeps the retained cited revision, not the later current source', () => {
    expect(citedSourceVersion(sources, citation)).toEqual(original);
    expect(
      citedSourceVersion(sources, {
        ...citation,
        revisionId: current.revisionId,
      }),
    ).toBeNull();
  });

  it('refuses a citation whose quote is not on that retained edition', () => {
    expect(
      citedSourceVersion(sources, { ...citation, quote: 'missing quote' }),
    ).toBeNull();
  });

  it('dedupes lesson and provenance citations', () => {
    expect(
      uniqueSourceCitations([citation, citation]).map(
        (item) => item.revisionId,
      ),
    ).toEqual(['source-v1']);
    expect(
      generatedLessonCitations(generated, {
        id: 'lesson',
        title: 'Lesson',
        objective: '',
        activity: '',
        sourceState: 'ready',
        sourceRevisionId: generated.revisionId,
        citations: [citation],
      }),
    ).toEqual([citation]);
  });
});
