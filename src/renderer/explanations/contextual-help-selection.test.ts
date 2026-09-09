import { describe, expect, it } from 'vitest';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../../contracts/explanation-artifacts';
import type { RetainedExplanation } from '../../contracts/explanation-artifacts';
import {
  originIdentity,
  originMatches,
  recordMatchesRequestedIntent,
} from './contextual-help-selection';

const projectId = '10000000-0000-4000-8000-000000000001';
const origin = {
  sourceRevisionId: '30000000-0000-4000-8000-000000000001',
  highlightId: '40000000-0000-4000-8000-000000000001',
};

const record: RetainedExplanation = {
  contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
  explanationId: '21000000-0000-4000-8000-000000000001',
  projectId,
  origin,
  intent: 'visual',
  usefulAttemptId: null,
  createdAt: '2026-09-09T08:00:00.000Z',
  updatedAt: '2026-09-09T08:00:00.000Z',
  attempts: [],
};

describe('contextual help selection identity', () => {
  it('matches origin without requiring the toolbar intent', () => {
    expect(originIdentity(projectId, origin)).toBe(
      `${projectId}:h:${origin.highlightId}`,
    );
    expect(originMatches(record.origin, origin)).toBe(true);
    expect(recordMatchesRequestedIntent(record, origin, 'visual')).toBe(true);
    expect(recordMatchesRequestedIntent(record, origin, 'text')).toBe(false);
    expect(originIdentity(projectId, null)).toBe(`${projectId}:none`);
    expect(
      originIdentity(projectId, {
        entry: { entryId: '50000000-0000-4000-8000-000000000001', revision: 2 },
      }),
    ).toBe(`${projectId}:q:50000000-0000-4000-8000-000000000001:2`);
    expect(originIdentity(projectId, {})).toBe(`${projectId}:empty`);
    expect(
      originMatches(
        {
          entry: {
            entryId: '50000000-0000-4000-8000-000000000001',
            revision: 2,
          },
        },
        {
          entry: {
            entryId: '50000000-0000-4000-8000-000000000001',
            revision: 2,
          },
        },
      ),
    ).toBe(true);
    expect(
      originMatches(record.origin, {
        highlightId: origin.highlightId,
        sourceRevisionId: '30000000-0000-4000-8000-000000000099',
      }),
    ).toBe(false);
    expect(
      originMatches(record.origin, {
        entry: {
          entryId: '50000000-0000-4000-8000-000000000001',
          revision: 2,
        },
      }),
    ).toBe(false);
    expect(
      originMatches(
        {
          entry: {
            entryId: '50000000-0000-4000-8000-000000000001',
            revision: 2,
          },
        },
        origin,
      ),
    ).toBe(false);
    expect(
      originMatches(
        {
          entry: {
            entryId: '50000000-0000-4000-8000-000000000001',
            revision: 2,
          },
        },
        {
          entry: {
            entryId: '50000000-0000-4000-8000-000000000001',
            revision: 3,
          },
        },
      ),
    ).toBe(false);
    expect(originMatches(record.origin, {})).toBe(false);
    expect(
      recordMatchesRequestedIntent(
        { ...record, intent: 'text' },
        origin,
        'text',
      ),
    ).toBe(true);
  });
});
