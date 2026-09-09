import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LearningOnboardingRequest,
  OnboardingSyllabus,
  UntrustedHumanLearnerContext,
} from '../../contracts/learning-onboarding-api.js';
import {
  COURSE_PRACTICE_BRIEF_KIND,
  LEARNING_ONBOARDING_API_VERSION,
  LEARNING_ONBOARDING_PATH,
  ONBOARDING_CONTEXT_TRUST,
} from '../../contracts/learning-onboarding-api.js';
import type { CoursePracticeBrief } from '../../contracts/learning-onboarding-api.js';
import { createLearningOnboardingValidation } from '../../contracts/learning-onboarding-validation.js';
import type {
  AcquiredSource,
  MetadataOnlySource,
  RetrievalEvidence,
} from '../../contracts/sourcing.js';
import { SOURCING_PUBLIC_MESSAGES } from '../../contracts/sourcing.js';
import type {
  MonthlyQuota,
  PublicAccount,
} from '../../contracts/learning-api.js';
import type { AccountingStore } from '../accounting.js';
import { makeMemoryGenerationEvalBudget } from '../generation-eval.js';
import { makeLearningService } from '../learning.js';
import { ProviderFailure } from '../provider.js';
import type { ProviderCompletion, ProviderService } from '../provider.js';
import { startHttpServer } from '../runtime.js';
import { sha256Text } from '../validation-primitives.js';
import { makeMemorySourceOperations } from '../sourcing/operations.js';
import type { SourcingService } from '../sourcing/service.js';
import type { SelectedLearningEvidence } from '../sourced-learning/types.js';
import { makeOnboardingService } from './service.js';
import type { OnboardingService } from './service.js';
import { makeMemoryOnboardingStore } from './store.js';

const validation = createLearningOnboardingValidation(sha256Text);
const account: PublicAccount = {
  id: 'account-onb1',
  name: 'Ada',
  image: null,
};
const AT = '2026-09-09T12:00:00.000Z';
const CANONICAL_TEXT =
  'Floating-point numbers are represented in computer hardware as base 2 (binary) fractions. For example, the decimal fraction 0.625 has value 6/10 + 2/100 + 5/1000.';
const QUOTE =
  'Floating-point numbers are represented in computer hardware as base 2 (binary) fractions.';
const SOURCE_ID = 'curated_python_floating_point_3_14_7';
const REVISION_ID = 'revision-fp01';
const LANDING = 'https://docs.python.org/3.14/tutorial/floatingpoint.html';
const ACQUIRED =
  'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html';
const LICENSE = 'https://docs.python.org/3.14/license.html';
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
    background: 'I write Python services and have seen 0.1 + 0.2 surprises.',
    learningGoals:
      'Explain binary fractions, then reproduce a cited rounding case.',
    priorKnowledge:
      'I can print floats and compare them, but not the hardware model.',
  },
  answers: [
    {
      trust: ONBOARDING_CONTEXT_TRUST.human,
      promptId: 'prompt-01',
      answer:
        'I think 0.1 is stored exactly and rounding only happens when printing the value.',
    },
  ],
  seedRevisionLocators: [],
  unacquiredSeedUrls: [],
};

const acquired: AcquiredSource = {
  sourceId: SOURCE_ID,
  kind: 'chapter',
  title: 'Floating-Point Arithmetic: Issues and Limitations',
  authorship: {
    kind: 'authored',
    creators: ['Python Software Foundation'],
  },
  providerIds: [
    { provider: 'curated-catalog', id: 'python-floating-point-3-14-7' },
  ],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: { url: LANDING, trust: 'untrusted-public-url' },
  acquisitionLocation: { url: ACQUIRED, trust: 'untrusted-public-url' },
  publicationDate: null,
  discoveredAt: '2026-09-08T20:57:15.222Z',
  metadataSummary: null,
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: LICENSE,
    license: {
      status: 'known',
      name: 'Python Software Foundation License Version 2',
      spdxId: 'PSF-2.0',
      url: LICENSE,
    },
    acquisition: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: LICENSE,
    },
    indexing: {
      status: 'permitted',
      basis: 'license',
      evidenceUrl: LICENSE,
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
      acquiredAt: '2026-09-08T20:57:15.222Z',
      provenance: {
        kind: 'discovered',
        acquiredFromUrl: ACQUIRED,
        providerIdentity: {
          provider: 'curated-catalog',
          id: 'python-floating-point-3-14-7',
        },
        discoveredAt: '2026-09-08T20:57:15.222Z',
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

function admittedEvidence(requestId: string): SelectedLearningEvidence {
  return {
    sources: [acquired],
    retrieval: {
      outcome: 'success',
      requestId,
      evidence: [evidence],
    },
  };
}

function cpythonBrief(): CoursePracticeBrief {
  return {
    kind: COURSE_PRACTICE_BRIEF_KIND,
    author: 'ai',
    masteryEstablished: false,
    intendedOutcome:
      'Measure the cited 0.1 + 0.2 rounding case in CPython against the tutorial sentence.',
    setup:
      'Open a CPython REPL with the cited floating-point tutorial visible.',
    tool: {
      kind: 'learner-external',
      toolName: 'CPython REPL',
      intendedUse:
        'Reproduce the cited binary-fraction rounding case in the same language as the tutorial.',
    },
    instructions:
      'Print 0.1 + 0.2 and place the cited hardware-fraction sentence beside the output.',
    observableCheckpoints: [
      'The REPL output shows 0.1 + 0.2 is not 0.3.',
      'The cited binary-fraction sentence appears next to the measured result.',
    ],
    expectedArtifact:
      'A CPython transcript of 0.1 + 0.2 annotated with the cited tutorial sentence.',
    reflectionPrompt:
      'Which cited hardware-fraction constraint explains the measured rounding?',
    sourceIds: [SOURCE_ID],
  };
}

function pathSteps(titlePrefix: string) {
  const activity =
    'Cite the binary-fraction sentence, then reproduce 0.1 + 0.2.';
  const objective = 'Use the cited hardware-fraction constraint, not folklore.';
  const brief = cpythonBrief();
  return [
    {
      title: `${titlePrefix} hardware fractions`,
      objective,
      activity,
      citations: [CITATION],
      role: 'concept' as const,
      practice: null,
    },
    {
      title: `${titlePrefix} setup the comparison environment`,
      objective,
      activity,
      citations: [CITATION],
      role: 'setup' as const,
      practice: null,
    },
    {
      title: `${titlePrefix} decimal examples`,
      objective,
      activity,
      citations: [CITATION],
      role: 'concept' as const,
      practice: null,
    },
    {
      title: `${titlePrefix} rounding error`,
      objective,
      activity,
      citations: [CITATION],
      role: 'concept' as const,
      practice: null,
    },
    {
      title: `${titlePrefix} implement local reproduction`,
      objective,
      activity,
      citations: [CITATION],
      role: 'practice' as const,
      practice: brief,
    },
    {
      title: `${titlePrefix} capstone measurement`,
      objective,
      activity,
      citations: [CITATION],
      role: 'capstone' as const,
      practice: brief,
    },
  ];
}

function provider(titlePrefix = 'Cited'): ProviderService {
  return {
    complete: (learningRequest) => {
      const prefix = learningRequest.requestId.includes('-rev')
        ? 'Revised'
        : titlePrefix;
      if (learningRequest.operation.kind === 'generate-learning-path') {
        const emptySources = learningRequest.operation.sources.length === 0;
        const completion: ProviderCompletion = {
          contribution: {
            kind: 'learning-path',
            title: emptySources
              ? `${prefix} diagnostic prompt`
              : `${prefix} floating-point syllabus`,
            steps: emptySources
              ? [
                  {
                    title:
                      'What currently happens when you add 0.1 and 0.2, and why might that surprise you?',
                    objective:
                      "Assess the learner's current understanding without claiming mastery.",
                    activity:
                      'Answer in your own words. Do not invent sources or citations.',
                    citations: [],
                    role: 'concept',
                    practice: null,
                  },
                ]
              : pathSteps(prefix),
          },
          providerRequestId: `generation-${learningRequest.requestId}`.slice(
            0,
            100,
          ),
          actualMicrousd: 12,
          model: 'google/gemini-3.8-flash',
        };
        return Effect.succeed(completion);
      }
      const completion: ProviderCompletion = {
        contribution: {
          kind: 'source-grounded-tutor',
          body: 'Binary fractions cannot represent most decimal values exactly.\n\nCite the tutorial constraint before writing comparison code.',
          nextAction: 'Reproduce 0.1 + 0.2 against the cited sentence.',
          citations: [CITATION],
        },
        providerRequestId: `generation-${learningRequest.requestId}`.slice(
          0,
          100,
        ),
        actualMicrousd: 9,
        model: 'google/gemini-3.8-flash',
      };
      return Effect.succeed(completion);
    },
  };
}

function accountingStore(): AccountingStore {
  return {
    reserve: () => Effect.succeed({ kind: 'reserved', quota }),
    settle: () => Effect.succeed(quota),
    quota: () => Effect.succeed(quota),
  };
}

const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

async function post(
  origin: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}${LEARNING_ONBOARDING_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session=account-onb1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function envelope(
  kind: LearningOnboardingRequest['operation']['kind'],
  extra: object = {},
) {
  return {
    apiVersion: LEARNING_ONBOARDING_API_VERSION,
    model: 'google/gemini-3.8-flash' as const,
    operation: { kind, human, ...extra },
  };
}

function compactSyllabus(syllabus: OnboardingSyllabus) {
  return {
    title: syllabus.title,
    topics: syllabus.topics.map((topic) => ({
      topicId: topic.topicId,
      title: topic.title,
      lessons: topic.lessons.map((lesson) => ({
        stepId: lesson.stepId,
        title: lesson.title,
        role: lesson.role,
        sourceState: lesson.sourceState,
        sourceIds: [...lesson.sourceIds],
        practiceDigest:
          lesson.practice === null
            ? null
            : validation.practiceBriefDigest(lesson.practice),
      })),
    })),
  };
}

async function startOnboarding(options?: {
  readonly authenticate?: () => Promise<PublicAccount | null>;
  readonly provider?: ProviderService;
  readonly accounting?: AccountingStore;
  readonly evidence?: (requestId: string) => SelectedLearningEvidence;
  readonly sourcing?: SourcingService;
  readonly onboarding?: OnboardingService;
}) {
  const generationEval = makeMemoryGenerationEvalBudget();
  const learning = await Effect.runPromise(
    makeLearningService({
      accounting: options?.accounting ?? accountingStore(),
      provider: options?.provider ?? provider(),
      generationEval,
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
  const onboarding =
    options?.onboarding ??
    makeOnboardingService({
      learning,
      operations: makeMemorySourceOperations(),
      proposals: makeMemoryOnboardingStore(),
      selectEvidence: async (query) =>
        (options?.evidence ?? admittedEvidence)(query.requestId),
      ...(options?.sourcing ? { sourcing: options.sourcing } : {}),
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
      clock: () => new Date(AT),
    });
  const backend = await startHttpServer(
    {
      auth: {
        authenticate: options?.authenticate ?? (async () => account),
        handle: async (_request, response) => {
          response.end();
        },
      },
      electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
      learning,
      onboarding,
      ready: async () => true,
      runEffect: (effect, signal) =>
        Effect.runPromise(effect, signal ? { signal } : undefined),
    },
    0,
  );
  stops.push(backend.stop);
  return {
    origin: `http://127.0.0.1:${backend.port}`,
    generationEval,
  };
}

describe('POST /v1/learning/onboarding', () => {
  it('requires a session and rejects caller account or evidence authority', async () => {
    const backend = await startOnboarding({
      authenticate: async () => null,
    });
    const base = {
      ...envelope('interview-prompt'),
      requestId: 'onboard-auth01',
    };
    const unauthenticated = await post(backend.origin, base);
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({
      outcome: 'unauthenticated',
      requestId: 'onboard-auth01',
    });
    const withAccount = await post(backend.origin, {
      ...base,
      accountId: 'another-account',
    });
    expect(withAccount.status).toBe(400);
    expect(await withAccount.json()).toMatchObject({
      outcome: 'invalid-request',
    });
    const withEvidence = await post(backend.origin, {
      ...base,
      evidenceContext: { evidence: [], sourceScopes: [] },
    });
    expect(withEvidence.status).toBe(400);
    expect(await withEvidence.json()).toMatchObject({
      outcome: 'invalid-request',
    });
  });

  it('runs interview, detailed syllabus, revision-stable ids and a later lesson', async () => {
    const backend = await startOnboarding();
    const interviewRequest = {
      ...envelope('interview-prompt'),
      requestId: 'onboard-intv01',
    };
    const interviewResponse = await post(backend.origin, interviewRequest);
    expect(interviewResponse.status).toBe(200);
    const interview = validation.parseLearningOnboardingResponse(
      await interviewResponse.json(),
      validation.parseLearningOnboardingRequest(interviewRequest),
    );
    expect(interview).toMatchObject({
      outcome: 'success',
      scope: 'interview-prompt',
      requestId: 'onboard-intv01',
    });
    if (
      interview.outcome !== 'success' ||
      interview.scope !== 'interview-prompt'
    ) {
      throw new Error('expected interview success');
    }
    expect(interview).not.toHaveProperty('syllabus');
    expect(interview.prompt.text).toMatch(/0\.1 and 0\.2/);
    expect(interview.prompt.provenance.author).toBe('ai');
    expect(interview.prompt.provenance.provider).toBe('openrouter');
    expect(interview.prompt.provenance.sourceRevisions).toEqual([]);
    expect(interview.assessment).toBeNull();

    const proposeRequest = {
      ...envelope('propose-course'),
      requestId: 'onboard-prop01',
    };
    const proposeResponse = await post(backend.origin, proposeRequest);
    expect(proposeResponse.status).toBe(200);
    const proposed = validation.parseLearningOnboardingResponse(
      await proposeResponse.json(),
      validation.parseLearningOnboardingRequest(proposeRequest),
    );
    expect(proposed.outcome).toBe('success');
    if (
      proposed.outcome !== 'success' ||
      proposed.scope !== 'complete-syllabus-and-first-lesson'
    ) {
      throw new Error('expected course proposal');
    }
    const lessons = proposed.syllabus.topics.flatMap((topic) => topic.lessons);
    expect(proposed.syllabus.topics.length).toBeGreaterThanOrEqual(2);
    expect(lessons.length).toBeGreaterThan(3);
    expect(proposed.syllabus.topics[0]?.prerequisiteTopicIds).toEqual([]);
    expect(proposed.syllabus.topics[1]?.prerequisiteTopicIds).toEqual([
      proposed.syllabus.topics[0]?.topicId,
    ]);
    expect(
      proposed.syllabus.topics.every(
        (topic) => topic.outcome.trim().length > 0,
      ),
    ).toBe(true);
    expect(lessons.some((lesson) => lesson.role === 'practice')).toBe(true);
    expect(lessons.some((lesson) => lesson.role === 'capstone')).toBe(true);
    expect(
      lessons.find((lesson) => lesson.role === 'practice')?.practice,
    ).not.toBeNull();
    expect(proposed.syllabus.capstone?.substantial).toBe(true);
    expect(lessons[0]?.prerequisiteStepIds).toEqual([]);
    expect(proposed.firstLesson.stepId).toBe(lessons[0]?.stepId);
    expect(proposed.firstLesson.source.title).toBe(lessons[0]?.title);
    expect(
      proposed.firstLesson.paragraphs.every(
        (item) => item.kind === 'ai-explanation',
      ),
    ).toBe(true);
    expect(
      proposed.firstLesson.paragraphs.some(
        (item) => (item as { kind: string }).kind === 'human-note',
      ),
    ).toBe(false);
    expect(
      proposed.firstLesson.paragraphs.every((item) =>
        item.citations.every((citation) => item.text.includes(citation.quote)),
      ),
    ).toBe(true);
    expect(
      proposed.firstLesson.paragraphs.flatMap((item) => item.citations),
    ).toEqual([]);
    expect(
      proposed.firstLesson.paragraphs.map((item) => item.text).join('\n\n'),
    ).toBe(proposed.firstLesson.source.canonicalText);
    const practiceTool = lessons.find((lesson) => lesson.role === 'practice')
      ?.practice?.tool;
    expect(practiceTool).toMatchObject({
      kind: 'learner-external',
      toolName: 'CPython REPL',
    });
    expect(practiceTool).not.toMatchObject({
      toolName: 'Python and a local editor',
    });
    expect(proposed.personalization.author).toBe('ai');
    expect(proposed.personalization.masteryEstablished).toBe(false);
    expect(proposed.provenance[0]?.requestVersion).toBe('2026-09-08');
    expect(proposed.provenance[0]?.promptVersion).toBe(
      'learning-v2-2026-09-09',
    );
    expect(proposed.sources[0]?.sourceId).toBe(SOURCE_ID);
    expect(proposed.evidence[0]?.locator.quote).toBe(QUOTE);

    const openingIds = lessons.map((lesson) => lesson.stepId);
    const reviseRequest = {
      apiVersion: LEARNING_ONBOARDING_API_VERSION,
      requestId: 'onboard-rev01',
      model: 'google/gemini-3.8-flash' as const,
      operation: {
        kind: 'revise-course' as const,
        human,
        model: {
          trust: ONBOARDING_CONTEXT_TRUST.model,
          priorProposal: { id: 'onboard-prop01', revision: 1 },
          syllabus: compactSyllabus(proposed.syllabus),
          personalization: null,
        },
        changes: {
          focus: 'Binary fractions and rounding from the cited tutorial.',
          depth: 'balanced' as const,
        },
      },
    };
    const reviseResponse = await post(backend.origin, reviseRequest);
    expect(reviseResponse.status).toBe(200);
    const revised = validation.parseLearningOnboardingResponse(
      await reviseResponse.json(),
      validation.parseLearningOnboardingRequest(reviseRequest),
    );
    if (
      revised.outcome !== 'success' ||
      revised.scope !== 'complete-syllabus-and-first-lesson'
    ) {
      throw new Error('expected revised syllabus');
    }
    expect(
      revised.syllabus.topics
        .flatMap((topic) => topic.lessons)
        .map((lesson) => lesson.stepId),
    ).toEqual(openingIds);
    expect(revised.syllabus.title).toContain('Revised');

    const practice = revised.syllabus.topics
      .flatMap((topic) => topic.lessons)
      .find((lesson) => lesson.role === 'practice');
    if (!practice?.practice) throw new Error('expected practice brief');
    const selectedRequest = {
      apiVersion: LEARNING_ONBOARDING_API_VERSION,
      requestId: 'onboard-less01',
      model: 'google/gemini-3.8-flash' as const,
      operation: {
        kind: 'generate-selected-lesson' as const,
        human,
        model: {
          trust: ONBOARDING_CONTEXT_TRUST.model,
          priorProposal: { id: 'onboard-prop01', revision: 2 },
          syllabus: compactSyllabus(revised.syllabus),
          personalization: null,
        },
        target: {
          remoteStepId: practice.stepId,
          acceptedProposal: { id: 'onboard-prop01', revision: 2 },
          practice: practice.practice,
        },
      },
    };
    const selectedResponse = await post(backend.origin, selectedRequest);
    expect(selectedResponse.status).toBe(200);
    const selected = validation.parseLearningOnboardingResponse(
      await selectedResponse.json(),
      validation.parseLearningOnboardingRequest(selectedRequest),
    );
    if (
      selected.outcome !== 'success' ||
      selected.scope !== 'selected-existing-lesson'
    ) {
      throw new Error('expected selected lesson');
    }
    expect(selected).not.toHaveProperty('syllabus');
    expect(selected.lesson.stepId).toBe(practice.stepId);
    expect(selected.lesson.practice?.kind).toBe(
      'source-supported-practice-brief',
    );
    const snap = await Effect.runPromise(backend.generationEval.inspect());
    expect(snap.dispatchCommitted).toBe(6);
    expect(snap.dispatchCommitted).toBeLessThanOrEqual(10);
  });

  it('returns coverage-pending when no admitted sources exist', async () => {
    const backend = await startOnboarding({
      evidence: (requestId) => ({
        sources: [],
        retrieval: {
          outcome: 'no-evidence',
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.noEvidence,
        },
      }),
    });
    const request = {
      ...envelope('propose-course'),
      requestId: 'onboard-cov01',
    };
    const response = await post(backend.origin, request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      outcome: 'coverage-pending',
      retryable: false,
      requestId: 'onboard-cov01',
    });
  });

  it('maps quota-exceeded and cancelled outcomes without paid retry', async () => {
    const quotaBackend = await startOnboarding({
      accounting: {
        reserve: () => Effect.succeed({ kind: 'quota', quota }),
        settle: () => Effect.succeed(quota),
        quota: () => Effect.succeed(quota),
      },
    });
    const quotaResponse = await post(quotaBackend.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-quot01',
    });
    expect(quotaResponse.status).toBe(429);
    expect(await quotaResponse.json()).toMatchObject({
      outcome: 'quota-exceeded',
      retryable: false,
      requestId: 'onboard-quot01',
    });

    const cancelBackend = await startOnboarding({
      provider: {
        complete: () =>
          Effect.fail(
            new ProviderFailure({
              message: 'The learning request was cancelled.',
              charge: { kind: 'none' },
              cancelled: true,
            }),
          ),
      },
    });
    const cancelResponse = await post(cancelBackend.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-cncl01',
    });
    expect(cancelResponse.status).toBe(409);
    expect(await cancelResponse.json()).toMatchObject({
      outcome: 'cancelled',
      retryable: false,
      requestId: 'onboard-cncl01',
    });
  });

  it('keeps interview available with no admitted sources and does not discover', async () => {
    const discoverCandidates = vi.fn(async () => {
      throw new Error('interview must not discover sources');
    });
    const backend = await startOnboarding({
      evidence: (requestId) => ({
        sources: [],
        retrieval: {
          outcome: 'no-evidence',
          requestId,
          message: SOURCING_PUBLIC_MESSAGES.noEvidence,
        },
      }),
      sourcing: {
        discoverCandidates,
        acquireCanonicalSource: async () => {
          throw new Error('interview must not acquire sources');
        },
        retrieveEvidence: async () => {
          throw new Error('interview must not retrieve');
        },
      },
    });
    const response = await post(backend.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-intv02',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      outcome: 'success',
      scope: 'interview-prompt',
      requestId: 'onboard-intv02',
    });
    expect(body.prompt.provenance.sourceRevisions).toEqual([]);
    expect(discoverCandidates).not.toHaveBeenCalled();
  });

  it('prepares permitted public sources before a sourced syllabus', async () => {
    const discovered: MetadataOnlySource = {
      ...acquired,
      content: { state: 'metadata-only' },
    };
    const discoverIds: string[] = [];
    const acquireIds: string[] = [];
    let selections = 0;
    const backend = await startOnboarding({
      evidence: (requestId) => {
        selections += 1;
        if (selections === 1) {
          return {
            sources: [],
            retrieval: {
              outcome: 'no-evidence',
              requestId,
              message: SOURCING_PUBLIC_MESSAGES.noEvidence,
            },
          };
        }
        return admittedEvidence(requestId);
      },
      sourcing: {
        discoverCandidates: async (request) => {
          discoverIds.push(request.requestId);
          return {
            outcome: 'success',
            requestId: request.requestId,
            candidates: [discovered],
          };
        },
        acquireCanonicalSource: async (request) => {
          acquireIds.push(request.requestId);
          expect(request.sourceId).toBe(SOURCE_ID);
          return {
            outcome: 'success',
            requestId: request.requestId,
            source: acquired,
          };
        },
        retrieveEvidence: async () => {
          throw new Error('prepare uses selectEvidence, not retrieveEvidence');
        },
      },
    });
    const request = {
      ...envelope('propose-course'),
      requestId: 'onboard-prep01',
    };
    const response = await post(backend.origin, request);
    expect(response.status).toBe(200);
    const proposed = validation.parseLearningOnboardingResponse(
      await response.json(),
      validation.parseLearningOnboardingRequest(request),
    );
    expect(proposed.outcome).toBe('success');
    expect(discoverIds).toEqual(['onboard-prep01-dsc']);
    expect(acquireIds).toEqual(['onboard-prep01-aq0']);
    expect(selections).toBe(2);
  });

  it('does not claim none after an invalid success envelope', async () => {
    const backend = await startOnboarding({
      onboarding: {
        handle: async (_account, request) =>
          ({
            outcome: 'success',
            requestId: request.requestId,
            scope: 'interview-prompt',
            prompt: { id: 'prompt-x', text: 'Incomplete' },
            assessment: null,
            quota,
          }) as never,
      },
    });
    const response = await post(backend.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-wire01',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      outcome: 'unavailable',
      requestId: 'onboard-wire01',
      retryable: false,
      accounting: 'reservation-retained',
    });
  });

  it('does not claim none when onboarding throws after admission', async () => {
    const backend = await startOnboarding({
      onboarding: {
        handle: async () => {
          throw new Error('synthetic execution failure');
        },
      },
    });
    const response = await post(backend.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-throw01',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      outcome: 'unavailable',
      requestId: 'onboard-throw01',
      retryable: false,
      accounting: 'reservation-retained',
    });
  });

  it('rejects invalid JSON, missing onboarding, and thrown authentication', async () => {
    const backend = await startOnboarding();
    const invalid = await fetch(
      `${backend.origin}${LEARNING_ONBOARDING_PATH}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=account-onb1',
        },
        body: '{',
      },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      outcome: 'invalid-request',
    });
    const empty = await fetch(`${backend.origin}${LEARNING_ONBOARDING_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=account-onb1',
      },
      body: '',
    });
    expect(empty.status).toBe(400);
    const malformed = await post(backend.origin, {
      requestId: 'onboard-bad01',
      apiVersion: 'not-a-version',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      outcome: 'invalid-request',
      requestId: 'onboard-bad01',
    });
    const authThrow = await startOnboarding({
      authenticate: async () => {
        throw new Error('session lookup failed');
      },
    });
    const authResponse = await post(authThrow.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-authfail',
    });
    expect(authResponse.status).toBe(503);
    const missing = await startHttpServer(
      {
        auth: {
          authenticate: async () => account,
          handle: async (_request, response) => {
            response.end();
          },
        },
        electronAuthCallbackScript: Buffer.from('/* synthetic callback */'),
        learning: {
          quota: () => Effect.succeed(quota),
          request: () =>
            Effect.succeed({
              outcome: 'invalid-request',
              requestId: 'unused',
              message: 'unused',
            }),
        },
        ready: async () => true,
        runEffect: (effect, signal) =>
          Effect.runPromise(effect, signal ? { signal } : undefined),
      },
      0,
    );
    stops.push(missing.stop);
    const missingResponse = await fetch(
      `http://127.0.0.1:${missing.port}${LEARNING_ONBOARDING_PATH}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'session=account-onb1',
        },
        body: JSON.stringify({
          ...envelope('interview-prompt'),
          requestId: 'onboard-nosvc',
        }),
      },
    );
    expect(missingResponse.status).toBe(503);
    expect(await missingResponse.json()).toMatchObject({
      outcome: 'unavailable',
      requestId: 'onboard-nosvc',
      accounting: 'none',
    });
  });

  it('does not claim released after invalid cancelled or quota envelopes', async () => {
    const cancelled = await startOnboarding({
      onboarding: {
        handle: async (_account, request) =>
          ({
            outcome: 'cancelled',
            requestId: request.requestId,
            accounting: 'released',
          }) as never,
      },
    });
    const cancelledResponse = await post(cancelled.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-wire-cncl',
    });
    expect(cancelledResponse.status).toBe(409);
    expect(await cancelledResponse.json()).toMatchObject({
      outcome: 'cancelled',
      accounting: 'reservation-retained',
      retryable: false,
    });
    const quotaWire = await startOnboarding({
      onboarding: {
        handle: async (_account, request) =>
          ({
            outcome: 'quota-exceeded',
            requestId: request.requestId,
            quota,
          }) as never,
      },
    });
    const quotaResponse = await post(quotaWire.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-wire-quota',
    });
    expect(quotaResponse.status).toBe(429);
    expect(await quotaResponse.json()).toMatchObject({
      outcome: 'quota-exceeded',
      retryable: false,
      requestId: 'onboard-wire-quota',
    });
    const chargedUnavailable = await startOnboarding({
      onboarding: {
        handle: async (_account, request) =>
          ({
            outcome: 'unavailable',
            requestId: request.requestId,
            accounting: 'charged',
          }) as never,
      },
    });
    const unavailableResponse = await post(chargedUnavailable.origin, {
      ...envelope('interview-prompt'),
      requestId: 'onboard-wire-unavail',
    });
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.json()).toMatchObject({
      outcome: 'unavailable',
      accounting: 'charged',
      retryable: false,
    });
  });
});

describe('onboarding HTTP abort before handle', () => {
  it('returns cancelled when the parent signal is already aborted', async () => {
    const { Readable } = await import('node:stream');
    const { handleOnboardingRoute } = await import('./http.js');
    const body = JSON.stringify({
      ...envelope('interview-prompt'),
      requestId: 'onboard-abort-http',
    });
    const request = Readable.from([
      body,
    ]) as import('node:http').IncomingMessage;
    request.method = 'POST';
    request.headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    };
    let status = 0;
    let payload = '';
    const response = {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writeHead(code: number) {
        status = code;
        return this;
      },
      end(chunk?: string) {
        payload = chunk ?? '';
      },
    } as unknown as import('node:http').ServerResponse;
    const parent = new AbortController();
    parent.abort();
    const handled = await handleOnboardingRoute(
      LEARNING_ONBOARDING_PATH,
      request,
      response,
      {
        auth: {
          authenticate: async () => {
            throw new Error('must not authenticate after abort');
          },
          handle: async (_request, response) => {
            response.end();
          },
        },
        onboarding: {
          handle: async () => {
            throw new Error('must not handle after abort');
          },
        },
      },
      parent.signal,
    );
    expect(handled).toBe(true);
    expect(status).toBe(409);
    expect(JSON.parse(payload)).toMatchObject({
      outcome: 'cancelled',
      requestId: 'onboard-abort-http',
      accounting: 'released',
    });
  });
});
