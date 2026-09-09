import { describe, expect, it } from 'vitest';
import type { OnboardingSyllabus } from '../../contracts/learning-onboarding-api.js';
import { makeMemoryOnboardingStore } from './store.js';

const AT = new Date('2026-09-09T12:00:00.000Z');

const syllabus: OnboardingSyllabus = {
  title: 'Cited floating-point syllabus',
  topics: [
    {
      topicId: 'topic-01',
      title: 'Hardware fractions',
      outcome: 'Use the cited hardware-fraction constraint.',
      prerequisiteTopicIds: [],
      lessons: [
        {
          stepId: 'step-001',
          title: 'Hardware fractions',
          objective: 'Use the cited hardware-fraction constraint.',
          activity: 'Cite the binary-fraction sentence.',
          role: 'concept',
          prerequisiteStepIds: [],
          sourceState: 'ready',
          sourceIds: ['source-fp01'],
          practice: null,
        },
      ],
    },
  ],
  capstone: null,
};

const diagnostic = {
  author: 'ai' as const,
  summary: 'AI diagnostic review. This is not proof of mastery.',
  observedGaps: ['No diagnostic answer was supplied for this goal.'],
  masteryEstablished: false as const,
};

describe('onboarding proposal store claims', () => {
  it('inserts a first revision and rejects a duplicate proposal id', async () => {
    const store = makeMemoryOnboardingStore();
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
        null,
        'request-create',
        AT,
      ),
    ).toBe('saved');
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
        null,
        'request-dup',
        AT,
      ),
    ).toBe('conflict');
    expect(await store.get('account-1', 'proposal-01')).toMatchObject({
      revision: 1,
    });
  });

  it('requires an expected-revision claim before a paid rewrite can commit', async () => {
    const store = makeMemoryOnboardingStore();
    await store.commit(
      'account-1',
      { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
      null,
      'request-create',
      AT,
    );
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-unclaimed',
        AT,
      ),
    ).toBe('conflict');
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-a', AT),
    ).toEqual({ kind: 'claimed', revision: 1 });
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-b', AT),
    ).toEqual({ kind: 'conflict' });
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-rev-b',
        AT,
      ),
    ).toBe('conflict');
    expect(
      await store.commit(
        'account-1',
        { proposalId: 'proposal-01', revision: 2, syllabus, diagnostic },
        1,
        'request-rev-a',
        AT,
      ),
    ).toBe('saved');
    expect(await store.get('account-1', 'proposal-01')).toMatchObject({
      revision: 2,
    });
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-stale', AT),
    ).toEqual({ kind: 'stale', currentRevision: 2 });
  });

  it('releases a claim so a later request can rewrite', async () => {
    const store = makeMemoryOnboardingStore();
    await store.commit(
      'account-1',
      { proposalId: 'proposal-01', revision: 1, syllabus, diagnostic },
      null,
      'request-create',
      AT,
    );
    await store.claim('account-1', 'proposal-01', 1, 'request-rev-a', AT);
    await store.releaseClaim('account-1', 'proposal-01', 'request-rev-a', AT);
    expect(
      await store.claim('account-1', 'proposal-01', 1, 'request-rev-b', AT),
    ).toEqual({ kind: 'claimed', revision: 1 });
  });
});
