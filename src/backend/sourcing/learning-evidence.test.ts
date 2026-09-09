import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeMemorySourcePersistence } from './persistence.js';
import { makeLearningEvidenceSelector } from './learning-evidence.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../contracts/sourcing.js';

describe('sourced evidence selection', () => {
  it('returns no-evidence when the account has no acquired indexable sources', async () => {
    const persistence = makeMemorySourcePersistence();
    const select = makeLearningEvidenceSelector(
      persistence,
      {
        discoverCandidates: async () => {
          throw new Error('unused');
        },
        acquireCanonicalSource: async () => {
          throw new Error('unused');
        },
        retrieveEvidence: async () => {
          throw new Error('unused');
        },
      },
      (effect) => Effect.runPromise(effect),
    );
    const result = await select(
      {
        requestId: 'generate-01',
        query: 'Learn SQL joins',
        intent: 'learning',
        maxPassages: 12,
      },
      {
        account: { id: 'account-a', name: 'Ada', image: null },
        signal: new AbortController().signal,
      },
    );
    expect(result).toEqual({
      sources: [],
      retrieval: {
        outcome: 'no-evidence',
        requestId: 'generate-01',
        message: SOURCING_PUBLIC_MESSAGES.noEvidence,
      },
    });
  });
});
