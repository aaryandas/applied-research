import { describe, expect, it } from 'vitest';
import { buildCompanionGuidanceEnvelope } from './guidance-envelope';
import type { CompanionResolvedGuidance } from './guidance-context';

const resolved: CompanionResolvedGuidance = {
  identityKey: 'reader:project:highlight',
  question: 'Explain this passage.',
  grounding: 'source',
  source: {
    sourceId: 'source-01',
    revisionId: 'revision01',
    title: 'Linear maps',
    canonicalText: 'Shear the basis.',
    sha256: 'a'.repeat(64),
    format: 'plain-text',
    canonicalizationVersion: 'workspace-plain-v1',
    acquiredAt: '2026-09-09T08:00:00.000Z',
    provenance: { kind: 'human-imported', locator: null },
  },
  excerpt: { start: 0, end: 5, quote: 'Shear' },
  learnerContext: [],
  attribution: 'retained-source',
  attributionSummary: 'Retained source · Linear maps',
};

describe('companion guidance envelope builder', () => {
  it('copies resolved material into the main-to-backend envelope', () => {
    expect(
      buildCompanionGuidanceEnvelope({
        requestId: '31000000-0000-4000-8000-000000000001',
        projectId: '10000000-0000-4000-8000-000000000001',
        projectGeneration: 1,
        requestGeneration: 0,
        cause: 'ask-once',
        resolved,
      }),
    ).toMatchObject({
      apiVersion: '2026-09-09',
      cause: 'ask-once',
      grounding: 'source',
      excerpt: { quote: 'Shear' },
    });
  });
});
