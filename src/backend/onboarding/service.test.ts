import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  LearningOnboardingRequest,
  UntrustedHumanLearnerContext,
} from '../../contracts/learning-onboarding-api.js';
import {
  LEARNING_ONBOARDING_API_VERSION,
  ONBOARDING_CONTEXT_TRUST,
} from '../../contracts/learning-onboarding-api.js';
import type {
  MonthlyQuota,
  PublicAccount,
} from '../../contracts/learning-api.js';
import type {
  AcquiredSource,
  RetrievalEvidence,
} from '../../contracts/sourcing.js';
import { makeMemoryGenerationEvalBudget } from '../generation-eval.js';
import { makeLearningService } from '../learning.js';
import { ProviderFailure } from '../provider.js';
import type { ProviderCompletion, ProviderService } from '../provider.js';
import { makeMemorySourceOperations } from '../sourcing/operations.js';
import { sha256Text } from '../validation-primitives.js';
import { makeOnboardingService } from './service.js';
import { makeMemoryOnboardingStore } from './store.js';
import type { SelectedLearningEvidence } from '../sourced-learning/types.js';

const account: PublicAccount = { id: 'account-svc1', name: 'Ada', image: null };
const AT = '2026-09-09T12:00:00.000Z';
const CANONICAL_TEXT =
  'Floating-point numbers are represented in computer hardware as base 2 (binary) fractions.';
const QUOTE = CANONICAL_TEXT;
const SOURCE_ID = 'curated_python_floating_point_3_14_7';
const REVISION_ID = 'revision-fp01';
const SHA = sha256Text(CANONICAL_TEXT);
const CITATION = {
  sourceId: SOURCE_ID,
  revisionId: REVISION_ID,
  start: 0,
  end: QUOTE.length,
  quote: QUOTE,
};
const quota: MonthlyQuota = {
  month: '2026-09',
  limitMicrousd: 20_000_000,
  committedMicrousd: 0,
  reservedMicrousd: 0,
  remainingMicrousd: 20_000_000,
};
const human: UntrustedHumanLearnerContext = {
  trust: ONBOARDING_CONTEXT_TRUST.human,
  goal: 'Learn why binary fractions make decimal rounding surprising.',
  focus: 'Exact floating-point representation from the public tutorial.',
  depth: 'balanced',
  profileRevision: 1,
  interviewRevision: 1,
  profile: {
    background: 'I write Python services.',
    learningGoals: 'Explain binary fractions.',
    priorKnowledge: 'I can print floats.',
  },
  answers: [],
  seedRevisionLocators: [],
  unacquiredSeedUrls: [],
};
const acquired: AcquiredSource = {
  sourceId: SOURCE_ID,
  kind: 'chapter',
  title: 'Floating-Point Arithmetic: Issues and Limitations',
  authorship: { kind: 'authored', creators: ['Python Software Foundation'] },
  providerIds: [
    { provider: 'curated-catalog', id: 'python-floating-point-3-14-7' },
  ],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://docs.python.org/3.14/tutorial/floatingpoint.html',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
    trust: 'untrusted-public-url',
  },
  publicationDate: null,
  discoveredAt: AT,
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://docs.python.org/3.14/license.html',
    license: {
      status: 'known',
      name: 'Python Software Foundation License Version 2',
      spdxId: 'PSF-2.0',
      url: 'https://docs.python.org/3.14/license.html',
    },
    acquisition: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://docs.python.org/3.14/license.html',
    },
    indexing: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: 'https://docs.python.org/3.14/license.html',
    },
  },
  content: {
    state: 'acquired',
    revision: {
      sourceId: SOURCE_ID,
      revisionId: REVISION_ID,
      title: 'Floating-Point Arithmetic: Issues and Limitations',
      canonicalText: CANONICAL_TEXT,
      sha256: SHA,
      format: 'plain-text',
      canonicalizationVersion: 'canonical-text-v1',
      acquiredAt: AT,
      provenance: {
        kind: 'discovered',
        acquiredFromUrl:
          'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
        providerIdentity: {
          provider: 'curated-catalog',
          id: 'python-floating-point-3-14-7',
        },
        discoveredAt: AT,
      },
      extraction: {
        method: 'structured-html-v1',
        coverage: 'complete',
        note: null,
      },
    },
  },
};
const evidence: RetrievalEvidence = {
  evidenceId: 'evidence-01',
  locator: { ...CITATION, position: { kind: 'document' } },
  sourceVersion: {
    sourceId: SOURCE_ID,
    revisionId: REVISION_ID,
    sha256: SHA,
    canonicalizationVersion: 'canonical-text-v1',
  },
  retrieverScore: 0.91,
  sourceQuality: 'high',
  provenance: {
    query: human.goal,
    intent: 'learning',
    provider: 'turbopuffer',
    retrievalVersion: 'retrieval-v1',
    rankingMethod: 'goal-fit',
    rank: 1,
    retrievedAt: AT,
  },
};

function admitted(requestId: string): SelectedLearningEvidence {
  return {
    sources: [acquired],
    retrieval: { outcome: 'success', requestId, evidence: [evidence] },
  };
}

function pathCompletion(requestId: string): ProviderCompletion {
  const prefix = requestId.includes('-rev') ? 'Revised' : 'Cited';
  return {
    contribution: {
      kind: 'learning-path',
      title: `${prefix} floating-point syllabus`,
      steps: [
        {
          title: `${prefix} hardware fractions`,
          objective: 'Use the cited hardware-fraction constraint.',
          activity: 'Cite the binary-fraction sentence.',
          citations: [CITATION],
        },
        {
          title: `${prefix} implement local reproduction`,
          objective: 'Use the cited hardware-fraction constraint.',
          activity: 'Reproduce 0.1 + 0.2.',
          citations: [CITATION],
        },
        {
          title: `${prefix} capstone measurement`,
          objective: 'Use the cited hardware-fraction constraint.',
          activity: 'Measure the cited rounding case.',
          citations: [CITATION],
        },
      ],
    },
    providerRequestId: `generation-${requestId}`.slice(0, 100),
    actualMicrousd: 12,
    model: 'google/gemini-3.8-flash',
  };
}

function tutorCompletion(requestId: string): ProviderCompletion {
  return {
    contribution: {
      kind: 'source-grounded-tutor',
      body: `${QUOTE}\n\nCite the tutorial constraint before writing comparison code.`,
      nextAction: 'Reproduce 0.1 + 0.2 against the cited sentence.',
      citations: [CITATION],
    },
    providerRequestId: `generation-${requestId}`.slice(0, 100),
    actualMicrousd: 9,
    model: 'google/gemini-3.8-flash',
  };
}

function proposeRequest(requestId: string): LearningOnboardingRequest {
  return {
    apiVersion: LEARNING_ONBOARDING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash',
    operation: { kind: 'propose-course', human },
  };
}

function reviseRequest(
  requestId: string,
  proposalId: string,
  revision: number,
): LearningOnboardingRequest {
  return {
    apiVersion: LEARNING_ONBOARDING_API_VERSION,
    requestId,
    model: 'google/gemini-3.8-flash',
    operation: {
      kind: 'revise-course',
      human,
      model: {
        trust: ONBOARDING_CONTEXT_TRUST.model,
        priorProposal: { id: proposalId, revision },
        syllabus: {
          title: 'Cited floating-point syllabus',
          topics: [],
          capstone: null,
        },
        personalization: null,
      },
      changes: {
        focus: 'Binary fractions from the cited tutorial.',
        depth: 'balanced',
      },
    },
  };
}

async function service(provider: ProviderService) {
  const learning = await Effect.runPromise(
    makeLearningService({
      accounting: {
        reserve: () => Effect.succeed({ kind: 'reserved', quota }),
        settle: () => Effect.succeed(quota),
        quota: () => Effect.succeed(quota),
      },
      provider,
      generationEval: makeMemoryGenerationEvalBudget(),
      config: {
        aiEnabled: true,
        monthlyLimitMicrousd: 20_000_000,
        model: 'google/gemini-3.8-flash',
        providerTimeoutMs: 1_000,
        providerConcurrency: 2,
      },
      now: () => new Date(AT),
    }),
  );
  const proposals = makeMemoryOnboardingStore();
  return {
    proposals,
    onboarding: makeOnboardingService({
      learning,
      operations: makeMemorySourceOperations(),
      proposals,
      selectEvidence: async (query) => admitted(query.requestId),
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
      clock: () => new Date(AT),
    }),
  };
}

describe('onboarding service lifecycle accounting', () => {
  it('preserves charged accounting when cancelled after a successful path phase', async () => {
    let pathFinished = (): void => undefined;
    const pathGate = new Promise<void>((resolve) => {
      pathFinished = resolve;
    });
    const { onboarding } = await service({
      complete: (learningRequest) => {
        if (learningRequest.operation.kind === 'generate-learning-path') {
          pathFinished();
          return Effect.succeed(pathCompletion(learningRequest.requestId));
        }
        return Effect.async<ProviderCompletion, ProviderFailure>((resume) => {
          const timer = setTimeout(() => {
            resume(
              Effect.fail(
                new ProviderFailure({
                  message: 'The learning request was cancelled.',
                  charge: { kind: 'none' },
                  cancelled: true,
                }),
              ),
            );
          }, 5_000);
          return () => {
            clearTimeout(timer);
          };
        });
      },
    });
    const controller = new AbortController();
    const pending = onboarding.handle(
      account,
      proposeRequest('onboard-abort01'),
      controller.signal,
    );
    await pathGate;
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
    controller.abort();
    const result = await pending;
    expect(result.outcome).toBe('cancelled');
    if (result.outcome === 'cancelled') {
      expect(['charged', 'reservation-retained']).toContain(result.accounting);
      expect(result.accounting).not.toBe('released');
      expect(result.retryable).toBe(false);
    }
  });

  it('claims the expected revision before paying for a rewrite and rejects a concurrent writer', async () => {
    const calls: string[] = [];
    const { onboarding } = await service({
      complete: (learningRequest) => {
        calls.push(learningRequest.requestId);
        if (learningRequest.operation.kind === 'generate-learning-path') {
          return Effect.succeed(pathCompletion(learningRequest.requestId));
        }
        return Effect.succeed(tutorCompletion(learningRequest.requestId));
      },
    });
    const proposed = await onboarding.handle(
      account,
      proposeRequest('onboard-prop-cas'),
      new AbortController().signal,
    );
    expect(proposed.outcome).toBe('success');
    const [first, second] = await Promise.all([
      onboarding.handle(
        account,
        reviseRequest('onboard-rev-a01', 'onboard-prop-cas', 1),
        new AbortController().signal,
      ),
      onboarding.handle(
        account,
        reviseRequest('onboard-rev-b01', 'onboard-prop-cas', 1),
        new AbortController().signal,
      ),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toContain('success');
    expect(
      outcomes.includes('conflict') || outcomes.includes('stale-revision'),
    ).toBe(true);
    expect(
      calls.filter((id) => id.includes('rev-a01') || id.includes('rev-b01')),
    ).toHaveLength(2);
    const loser = first.outcome === 'success' ? second : first;
    if (loser.outcome === 'stale-revision' || loser.outcome === 'conflict') {
      expect(loser.retryable).toBe(false);
    }
  });

  it('returns stale-revision without a new paid rewrite when the claimed revision moved', async () => {
    const calls: string[] = [];
    const { onboarding } = await service({
      complete: (learningRequest) => {
        calls.push(learningRequest.requestId);
        if (learningRequest.operation.kind === 'generate-learning-path') {
          return Effect.succeed(pathCompletion(learningRequest.requestId));
        }
        return Effect.succeed(tutorCompletion(learningRequest.requestId));
      },
    });
    const proposed = await onboarding.handle(
      account,
      proposeRequest('onboard-prop-stale'),
      new AbortController().signal,
    );
    expect(proposed.outcome).toBe('success');
    const afterPropose = calls.length;
    const revised = await onboarding.handle(
      account,
      reviseRequest('onboard-rev-ok1', 'onboard-prop-stale', 1),
      new AbortController().signal,
    );
    expect(revised.outcome).toBe('success');
    const afterRevise = calls.length;
    const stale = await onboarding.handle(
      account,
      reviseRequest('onboard-rev-old1', 'onboard-prop-stale', 1),
      new AbortController().signal,
    );
    expect(stale.outcome).toBe('stale-revision');
    if (stale.outcome === 'stale-revision') {
      expect(stale.currentRevision).toBe(2);
      expect(stale.expectedRevision).toBe(1);
    }
    expect(calls.length).toBe(afterRevise);
    expect(afterRevise).toBeGreaterThan(afterPropose);
  });

  it('retains an uncertain reservation when execution throws', async () => {
    const learning = await Effect.runPromise(
      makeLearningService({
        accounting: {
          reserve: () => Effect.succeed({ kind: 'reserved', quota }),
          settle: () => Effect.succeed(quota),
          quota: () => Effect.succeed(quota),
        },
        provider: {
          complete: () => Effect.succeed(pathCompletion('unused-path01')),
        },
        generationEval: makeMemoryGenerationEvalBudget(),
        config: {
          aiEnabled: true,
          monthlyLimitMicrousd: 20_000_000,
          model: 'google/gemini-3.8-flash',
          providerTimeoutMs: 1_000,
          providerConcurrency: 2,
        },
        now: () => new Date(AT),
      }),
    );
    const onboarding = makeOnboardingService({
      learning,
      operations: makeMemorySourceOperations(),
      proposals: makeMemoryOnboardingStore(),
      selectEvidence: async () => {
        throw new Error('synthetic selector explosion');
      },
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
      clock: () => new Date(AT),
    });
    const result = await onboarding.handle(
      account,
      proposeRequest('onboard-boom01'),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      outcome: 'unavailable',
      requestId: 'onboard-boom01',
      retryable: false,
      accounting: 'reservation-retained',
    });
  });
});
