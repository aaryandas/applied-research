import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SourceRevisionInput } from '../../contracts/learning-api.js';
import { bindPlanToCanonicalSources } from './canonical-citations.js';
import type { ExplanationPlan } from './plan-decode.js';

const text = 'Attention is a weighted combination of values.';
const source: SourceRevisionInput = {
  sourceId: '10000000-0000-4000-8000-000000000001',
  revisionId: '20000000-0000-4000-8000-000000000001',
  title: 'Attention notes',
  canonicalText: text,
  sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  format: 'plain-text',
  canonicalizationVersion: 'workspace-plain-v1',
  acquiredAt: '2026-09-09T08:00:00.000Z',
  provenance: { kind: 'human-imported', locator: null },
};

const supportedBase = {
  status: 'supported' as const,
  family: 'weighted-combination' as const,
  parameters: {
    vectors: [
      [2, 1],
      [-1, 2],
    ] as const,
    weights: [3, 1] as const,
    labels: ['First vector', 'Second vector'] as const,
  },
  stages: [{ name: 'Combine', seconds: 2 }],
  caption: 'Weighted sum of two vectors',
  copy: {
    role: 'untrusted-display-copy' as const,
    title: 'Weights',
    quote: null,
  },
  rationale: {
    role: 'untrusted-display-copy' as const,
    text: 'Shows a weighted combination.',
  },
};

function citedPlan(citation: {
  sourceId: string;
  revisionId: string;
  start: number;
  end: number;
  quote: string;
}): ExplanationPlan {
  return {
    ...supportedBase,
    sourceSupport: { kind: 'cited-source', citations: [citation] },
  };
}

describe('bindPlanToCanonicalSources', () => {
  it('keeps exact canonical citations and illustrative assumptions', () => {
    const quote = text.slice(0, 9);
    const bound = bindPlanToCanonicalSources(
      citedPlan({
        sourceId: source.sourceId,
        revisionId: source.revisionId,
        start: 0,
        end: 9,
        quote,
      }),
      [source],
    );
    expect(bound).toMatchObject({
      status: 'supported',
      sourceSupport: {
        kind: 'cited-source',
        citations: [
          {
            sourceId: source.sourceId,
            revisionId: source.revisionId,
            start: 0,
            end: 9,
            quote,
          },
        ],
      },
    });
    expect(
      bindPlanToCanonicalSources(
        {
          status: 'unsupported',
          reason: 'unrelated-topic',
          textualContinuation: 'Use a text explanation.',
          practicalContinuation: 'Try a worked example.',
        },
        [source],
      ),
    ).toMatchObject({ status: 'unsupported' });
    const illustrative = bindPlanToCanonicalSources(
      {
        ...supportedBase,
        sourceSupport: {
          kind: 'illustrative-assumption',
          note: 'Original geometry, not a photograph of the source.',
        },
      },
      [source],
    );
    expect(illustrative.status).toBe('supported');
    if (illustrative.status === 'supported') {
      expect(illustrative.sourceSupport).toMatchObject({
        kind: 'illustrative-assumption',
      });
    }
  });

  it('rejects fabricated ids, stale revisions, out-of-bounds, and equal-length wrong quotes', () => {
    const quote = text.slice(0, 9);
    expect(() =>
      bindPlanToCanonicalSources(
        citedPlan({
          sourceId: '30000000-0000-4000-8000-000000000001',
          revisionId: source.revisionId,
          start: 0,
          end: 9,
          quote,
        }),
        [source],
      ),
    ).toThrow('Provider citation does not match its source revision.');
    expect(() =>
      bindPlanToCanonicalSources(
        citedPlan({
          sourceId: source.sourceId,
          revisionId: '30000000-0000-4000-8000-000000000001',
          start: 0,
          end: 9,
          quote,
        }),
        [source],
      ),
    ).toThrow('Provider citation does not match its source revision.');
    expect(() =>
      bindPlanToCanonicalSources(
        citedPlan({
          sourceId: source.sourceId,
          revisionId: source.revisionId,
          start: 0,
          end: text.length + 1,
          quote: text.padEnd(text.length + 1, 'x'),
        }),
        [source],
      ),
    ).toThrow('Provider citation does not match its source revision.');
    expect(() =>
      bindPlanToCanonicalSources(
        citedPlan({
          sourceId: source.sourceId,
          revisionId: source.revisionId,
          start: 0,
          end: 9,
          quote: 'WRONGQUOT',
        }),
        [source],
      ),
    ).toThrow('Provider citation does not match its source revision.');
  });

  it('requires the quote to equal canonicalText.slice even when UTF-16 length matches', () => {
    const emojiSource: SourceRevisionInput = {
      ...source,
      canonicalText: 'A😀B explains the concept.',
    };
    expect(() =>
      bindPlanToCanonicalSources(
        citedPlan({
          sourceId: source.sourceId,
          revisionId: source.revisionId,
          start: 1,
          end: 3,
          quote: 'AB',
        }),
        [emojiSource],
      ),
    ).toThrow('Provider citation does not match its source revision.');
    const boundEmoji = bindPlanToCanonicalSources(
      citedPlan({
        sourceId: source.sourceId,
        revisionId: source.revisionId,
        start: 1,
        end: 3,
        quote: '😀',
      }),
      [emojiSource],
    );
    expect(boundEmoji.status).toBe('supported');
    if (boundEmoji.status === 'supported') {
      expect(boundEmoji.sourceSupport).toMatchObject({
        kind: 'cited-source',
        citations: [{ start: 1, end: 3, quote: '😀' }],
      });
    }
  });
});
