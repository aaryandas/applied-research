import type { Effect } from 'effect';
import type {
  LearningOnboardingRequest,
  LearningOnboardingResponse,
  LearningOnboardingScope,
  OnboardingCoverageGap,
  OnboardingGeneratedLesson,
  OnboardingSourceCoverage,
  OnboardingSyllabus,
  ProposalSource,
} from '../../contracts/learning-onboarding-api.js';
import {
  LEARNING_ONBOARDING_API_VERSION,
  LEARNING_ONBOARDING_PUBLIC_MESSAGES as MESSAGES,
} from '../../contracts/learning-onboarding-api.js';
import type {
  AiProvenance,
  LearningRequest,
  LearningResponse,
  MonthlyQuota,
  PublicAccount,
  TutorContribution,
} from '../../contracts/learning-api.js';
import { LEARNING_API_VERSION } from '../../contracts/learning-api.js';
import type {
  AcquiredSource,
  RetrievalEvidence,
} from '../../contracts/sourcing.js';
import type { Diagnostics } from '../diagnostics.js';
import { silentDiagnostics } from '../diagnostics.js';
import type { LearningService } from '../learning.js';
import { SOURCED_LESSON_QUESTION } from '../sourced-learning/generation.js';
import { generatedLessonSource } from '../sourced-learning/lesson-source.js';
import type {
  LearningEvidenceQuery,
  SelectedLearningEvidence,
} from '../sourced-learning/types.js';
import {
  clientVisibleInputHash,
  type SourceOperationStore,
} from '../sourcing/operations.js';
import type { SourcingInvocation } from '../sourcing/service.js';
import {
  assembleOnboardingSyllabus,
  diagnosticPersonalization,
} from './syllabus.js';
import type { OnboardingProposalStore } from './store.js';

export interface OnboardingService {
  readonly handle: (
    account: PublicAccount,
    request: LearningOnboardingRequest,
    signal: AbortSignal,
  ) => Promise<LearningOnboardingResponse>;
}

export interface OnboardingServiceOptions {
  readonly learning: LearningService;
  readonly operations: SourceOperationStore;
  readonly proposals: OnboardingProposalStore;
  readonly selectEvidence: (
    query: LearningEvidenceQuery,
    invocation: SourcingInvocation,
  ) => Promise<SelectedLearningEvidence>;
  readonly runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>;
  readonly clock?: () => Date;
  readonly diagnostics?: Diagnostics;
}

function scopeFor(request: LearningOnboardingRequest): LearningOnboardingScope {
  switch (request.operation.kind) {
    case 'interview-prompt':
      return 'interview-prompt';
    case 'generate-selected-lesson':
      return 'selected-existing-lesson';
    default:
      return 'complete-syllabus-and-first-lesson';
  }
}

function unavailable(
  requestId: string,
  accounting: 'none' | 'released' | 'charged' | 'reservation-retained',
): LearningOnboardingResponse {
  return {
    outcome: 'unavailable',
    requestId,
    message: MESSAGES.unavailable,
    retryable: accounting === 'none' || accounting === 'released',
    accounting,
  };
}

function coveragePending(
  request: LearningOnboardingRequest,
  gaps: OnboardingCoverageGap[],
  quota: MonthlyQuota | null,
): LearningOnboardingResponse {
  return {
    outcome: 'coverage-pending',
    requestId: request.requestId,
    scope: scopeFor(request),
    message: MESSAGES.coveragePending,
    gaps,
    sourceCoverage: null,
    quota,
    retryable: false,
  };
}

function cancelled(
  requestId: string,
  accounting: 'released' | 'charged' | 'reservation-retained',
): LearningOnboardingResponse {
  return {
    outcome: 'cancelled',
    requestId,
    message: MESSAGES.cancelled,
    retryable: false,
    accounting,
  };
}

function mapLearningOutcome(
  request: LearningOnboardingRequest,
  response: LearningResponse,
): LearningOnboardingResponse | null {
  if (response.outcome === 'success') return null;
  if (response.outcome === 'quota-exceeded') {
    return {
      outcome: 'quota-exceeded',
      requestId: request.requestId,
      message: MESSAGES.quotaExceeded,
      quota: response.quota,
      retryable: false,
    };
  }
  if (response.outcome === 'cancelled') {
    return cancelled(request.requestId, response.accounting);
  }
  if (response.outcome === 'unavailable') {
    return {
      outcome: 'unavailable',
      requestId: request.requestId,
      message: MESSAGES.unavailable,
      retryable:
        response.accounting === 'none' || response.accounting === 'released',
      accounting: response.accounting,
    };
  }
  if (response.outcome === 'unauthenticated') {
    return {
      outcome: 'unauthenticated',
      requestId: request.requestId,
      message: MESSAGES.unauthenticated,
    };
  }
  if (response.outcome === 'unsupported') {
    return {
      outcome: 'unsupported',
      requestId: request.requestId,
      message: MESSAGES.unsupported,
    };
  }
  return {
    outcome: 'invalid-request',
    requestId: request.requestId,
    message: MESSAGES.invalidRequest,
  };
}

function phaseRequestId(
  requestId: string,
  phase: 'path' | 'lesson' | 'prompt',
): string {
  return `${requestId.slice(0, 80)}-${phase}`;
}

function humanContext(request: LearningOnboardingRequest) {
  const { human } = request.operation;
  const answers = human.answers.slice(0, 6).map((item, index) => ({
    id: `humanans${index + 1}`.padEnd(8, '0'),
    kind: 'human-note' as const,
    text: item.answer.slice(0, 4_000),
  }));
  return [
    {
      id: 'humangoal',
      kind: 'human-note' as const,
      text: human.goal.slice(0, 2_000),
    },
    {
      id: 'humanback',
      kind: 'human-note' as const,
      text: human.profile.background.slice(0, 2_000),
    },
    {
      id: 'humanknow',
      kind: 'human-note' as const,
      text: human.profile.priorKnowledge.slice(0, 2_000),
    },
    ...answers,
  ].filter((item) => item.text.trim().length > 0);
}

function generationSources(selected: SelectedLearningEvidence) {
  return selected.sources.map(
    ({ content: { revision }, originalLocation }) => ({
      sourceId: revision.sourceId,
      revisionId: revision.revisionId,
      title: revision.title,
      canonicalText: revision.canonicalText,
      sha256: revision.sha256,
      format: revision.format,
      canonicalizationVersion: revision.canonicalizationVersion,
      acquiredAt: revision.acquiredAt,
      provenance: {
        kind: 'discovered' as const,
        locator: originalLocation.url,
      },
    }),
  );
}

function evidenceList(selected: SelectedLearningEvidence): RetrievalEvidence[] {
  if (
    selected.retrieval.outcome !== 'success' &&
    selected.retrieval.outcome !== 'partial'
  ) {
    return [];
  }
  return selected.retrieval.evidence;
}

function bibliographyFor(
  syllabus: OnboardingSyllabus,
  sources: readonly AcquiredSource[],
): ProposalSource[] {
  const lessons = syllabus.topics.flatMap((topic) => topic.lessons);
  return sources.map((source) => {
    const revision = source.content.revision;
    const lessonStepIds = lessons
      .filter((lesson) => lesson.sourceIds.includes(source.sourceId))
      .map((lesson) => lesson.stepId);
    return {
      sourceId: source.sourceId,
      kind: source.kind,
      title: source.title,
      originalLocation: source.originalLocation,
      providerIds: source.providerIds,
      scholarlyIdentity: source.scholarlyIdentity,
      access: source.usePolicy.access,
      edition: {
        sourceId: revision.sourceId,
        revisionId: revision.revisionId,
        title: revision.title,
        sha256: revision.sha256,
        format: revision.format,
        canonicalizationVersion: revision.canonicalizationVersion,
        acquiredAt: revision.acquiredAt,
        provenance: {
          kind: revision.provenance.kind,
          locator:
            revision.provenance.kind === 'discovered'
              ? revision.provenance.acquiredFromUrl
              : source.originalLocation.url,
        },
      },
      coverage: revision.extraction.coverage,
      lessonStepIds:
        lessonStepIds.length > 0
          ? lessonStepIds
          : lessons[0]
            ? [lessons[0].stepId]
            : [],
    };
  });
}

function sourceCoverage(
  syllabus: OnboardingSyllabus,
  sources: number,
  gaps: number,
): OnboardingSourceCoverage {
  const lessons = syllabus.topics.flatMap((topic) => topic.lessons);
  return {
    readyLessons: lessons.filter((lesson) => lesson.sourceState === 'ready')
      .length,
    pendingLessons: lessons.filter((lesson) => lesson.sourceState === 'pending')
      .length,
    unsupportedLessons: lessons.filter(
      (lesson) => lesson.sourceState === 'unsupported',
    ).length,
    sources,
    gaps,
  };
}

function stripCanonical(provenance: AiProvenance): AiProvenance {
  return {
    ...provenance,
    sourceRevisions: provenance.sourceRevisions.map((item) => ({
      sourceId: item.sourceId,
      revisionId: item.revisionId,
      title: item.title,
      sha256: item.sha256,
      format: item.format,
      canonicalizationVersion: item.canonicalizationVersion,
      acquiredAt: item.acquiredAt,
      provenance: item.provenance,
    })),
  };
}

function generatedLessonFromTutor(input: {
  readonly step: {
    readonly stepId: string;
    readonly title: string;
    readonly role: OnboardingSyllabus['topics'][number]['lessons'][number]['role'];
    readonly practice: OnboardingSyllabus['topics'][number]['lessons'][number]['practice'];
  };
  readonly contribution: TutorContribution;
  readonly requestId: string;
  readonly generatedAt: string;
}): OnboardingGeneratedLesson {
  const paragraphs = input.contribution.body
    .split(/\n\n+/u)
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .slice(0, 32)
    .map((text) => ({
      text,
      kind: 'ai-explanation' as const,
      citations: input.contribution.citations,
    }));
  const source = generatedLessonSource({
    requestId: input.requestId,
    title: input.step.title,
    paragraphs,
    generatedAt: input.generatedAt,
  });
  return {
    stepId: input.step.stepId,
    source,
    paragraphs,
    practice:
      input.step.practice === null
        ? null
        : {
            ...input.step.practice,
            citations: input.contribution.citations,
          },
  };
}

function courseFocus(request: LearningOnboardingRequest): {
  readonly focus: string;
  readonly depth: LearningOnboardingRequest['operation']['human']['depth'];
} {
  if (request.operation.kind === 'revise-course') {
    return request.operation.changes;
  }
  return {
    focus: request.operation.human.focus,
    depth: request.operation.human.depth,
  };
}

export function makeOnboardingService(
  options: OnboardingServiceOptions,
): OnboardingService {
  const diagnostics = options.diagnostics ?? silentDiagnostics;
  const clock = options.clock ?? (() => new Date());

  async function select(
    account: PublicAccount,
    request: LearningOnboardingRequest,
    signal: AbortSignal,
  ): Promise<SelectedLearningEvidence> {
    const query: LearningEvidenceQuery = {
      requestId: request.requestId,
      query: request.operation.human.goal,
      intent: 'learning',
      maxPassages: 12,
    };
    return options.selectEvidence(query, { account, signal });
  }

  async function completeLearning(
    account: PublicAccount,
    inner: LearningRequest,
    signal: AbortSignal,
  ): Promise<LearningResponse> {
    return options.runEffect(options.learning.request(account, inner), signal);
  }

  async function execute(
    account: PublicAccount,
    request: LearningOnboardingRequest,
    signal: AbortSignal,
  ): Promise<LearningOnboardingResponse> {
    if (signal.aborted) return cancelled(request.requestId, 'released');
    const selected = await select(account, request, signal);
    if (signal.aborted) return cancelled(request.requestId, 'released');
    if (
      selected.retrieval.outcome !== 'success' &&
      selected.retrieval.outcome !== 'partial'
    ) {
      if (selected.retrieval.outcome === 'no-evidence') {
        return coveragePending(
          request,
          [
            {
              kind: 'retrieval',
              message: selected.retrieval.message,
            },
          ],
          null,
        );
      }
      return unavailable(request.requestId, 'none');
    }
    if (selected.sources.length === 0) {
      return coveragePending(
        request,
        [
          {
            kind: 'retrieval',
            message:
              'No admitted sources are available for this onboarding step.',
          },
        ],
        null,
      );
    }
    const sources = generationSources(selected);
    const evidence = evidenceList(selected);
    const learnerContext = humanContext(request);
    if (request.operation.kind === 'interview-prompt') {
      const inner: LearningRequest = {
        apiVersion: LEARNING_API_VERSION,
        requestId: phaseRequestId(request.requestId, 'prompt'),
        model: request.model,
        operation: {
          kind: 'source-grounded-tutor',
          question:
            `Ask one short open-ended diagnostic question about the learner's current understanding of: ${request.operation.human.goal}. Do not claim mastery.`.slice(
              0,
              2_000,
            ),
          sources,
          learnerContext,
        },
      };
      const response = await completeLearning(account, inner, signal);
      const mapped = mapLearningOutcome(request, response);
      if (mapped) return mapped;
      if (response.outcome !== 'success')
        return unavailable(request.requestId, 'none');
      if (response.contribution.kind !== 'source-grounded-tutor') {
        return unavailable(request.requestId, 'charged');
      }
      return {
        outcome: 'success',
        requestId: request.requestId,
        scope: 'interview-prompt',
        prompt: {
          id: `pmt-${request.requestId.slice(0, 12)}`.slice(0, 100),
          text: response.contribution.body.slice(0, 2_000),
          provenance: stripCanonical(response.provenance),
        },
        assessment: null,
        quota: response.quota,
      };
    }
    if (request.operation.kind === 'generate-selected-lesson') {
      const ref = request.operation.target.acceptedProposal;
      const stored = await options.proposals.get(account.id, ref.id);
      if (!stored) {
        return {
          outcome: 'conflict',
          requestId: request.requestId,
          message: MESSAGES.conflict,
          retryable: false,
        };
      }
      if (stored.revision !== ref.revision) {
        return {
          outcome: 'stale-revision',
          requestId: request.requestId,
          message: MESSAGES.staleRevision,
          expectedRevision: ref.revision,
          currentRevision: stored.revision,
          retryable: false,
        };
      }
      const target = stored.syllabus.topics
        .flatMap((topic) => topic.lessons)
        .find(
          (lesson) => lesson.stepId === request.operation.target.remoteStepId,
        );
      if (!target) {
        return {
          outcome: 'conflict',
          requestId: request.requestId,
          message: MESSAGES.conflict,
          retryable: false,
        };
      }
      const generated = await generateLesson(
        account,
        request,
        signal,
        selected,
        target,
        learnerContext,
      );
      if ('outcome' in generated) return generated;
      const listed = bibliographyFor(stored.syllabus, selected.sources);
      return {
        outcome: 'success',
        requestId: request.requestId,
        scope: 'selected-existing-lesson',
        lesson: generated.lesson,
        sources: selected.sources,
        bibliography: listed,
        evidence,
        gaps: [],
        provenance: [stripCanonical(generated.provenance)],
        quota: generated.quota,
      };
    }
    let prior: OnboardingSyllabus | null = null;
    let revision = 1;
    let proposalId = request.requestId;
    if (request.operation.kind === 'revise-course') {
      const ref = request.operation.model.priorProposal;
      proposalId = ref.id;
      const stored = await options.proposals.get(account.id, ref.id);
      if (!stored) {
        return {
          outcome: 'conflict',
          requestId: request.requestId,
          message: MESSAGES.conflict,
          retryable: false,
        };
      }
      if (stored.revision !== ref.revision) {
        return {
          outcome: 'stale-revision',
          requestId: request.requestId,
          message: MESSAGES.staleRevision,
          expectedRevision: ref.revision,
          currentRevision: stored.revision,
          retryable: false,
        };
      }
      prior = stored.syllabus;
      revision = stored.revision + 1;
    }
    const { focus, depth } = courseFocus(request);
    const pathRequest: LearningRequest = {
      apiVersion: LEARNING_API_VERSION,
      requestId: phaseRequestId(request.requestId, 'path'),
      model: request.model,
      operation: {
        kind: 'generate-learning-path',
        goal: `${request.operation.human.goal} Focus: ${focus}. Depth: ${depth}. Produce a detailed source-backed syllabus with ordered topics, outcomes, prerequisites, and practice.`.slice(
          0,
          2_000,
        ),
        sources,
        learnerContext,
      },
    };
    const pathResponse = await completeLearning(account, pathRequest, signal);
    const pathFailure = mapLearningOutcome(request, pathResponse);
    if (pathFailure) return pathFailure;
    if (pathResponse.outcome !== 'success')
      return unavailable(request.requestId, 'none');
    if (pathResponse.contribution.kind !== 'learning-path') {
      return unavailable(request.requestId, 'charged');
    }
    const syllabus = assembleOnboardingSyllabus({
      path: pathResponse.contribution,
      acquired: selected.sources,
      prior,
    });
    const first = syllabus.topics[0]?.lessons[0];
    if (!first) {
      return coveragePending(
        request,
        [
          {
            kind: 'generation',
            message: 'A detailed syllabus could not be assembled.',
          },
        ],
        pathResponse.quota,
      );
    }
    const generated = await generateLesson(
      account,
      request,
      signal,
      selected,
      first,
      learnerContext,
    );
    if ('outcome' in generated) return generated;
    const personalization = diagnosticPersonalization({
      goal: request.operation.human.goal,
      focus,
      answers: request.operation.human.answers,
    });
    const listed = bibliographyFor(syllabus, selected.sources);
    const gaps: OnboardingCoverageGap[] =
      selected.retrieval.outcome === 'partial'
        ? [
            {
              kind: 'retrieval',
              message:
                'Retrieval returned partial coverage. Some source evidence is unavailable.',
            },
          ]
        : [];
    const envelope: LearningOnboardingResponse = {
      outcome: 'success',
      requestId: request.requestId,
      scope: 'complete-syllabus-and-first-lesson',
      syllabus,
      firstLesson: generated.lesson,
      sources: selected.sources,
      bibliography: listed,
      evidence,
      gaps,
      sourceCoverage: sourceCoverage(syllabus, listed.length, gaps.length),
      personalization,
      provenance: [
        stripCanonical(pathResponse.provenance),
        stripCanonical(generated.provenance),
      ],
      quota: generated.quota,
    };
    await options.proposals.save(
      account.id,
      {
        proposalId,
        revision,
        syllabus,
        diagnostic: personalization,
      },
      clock(),
    );
    return envelope;
  }

  async function generateLesson(
    account: PublicAccount,
    request: LearningOnboardingRequest,
    signal: AbortSignal,
    selected: SelectedLearningEvidence,
    step: OnboardingSyllabus['topics'][number]['lessons'][number],
    learnerContext: ReturnType<typeof humanContext>,
  ): Promise<
    | {
        readonly lesson: OnboardingGeneratedLesson;
        readonly quota: MonthlyQuota;
        readonly provenance: AiProvenance;
      }
    | LearningOnboardingResponse
  > {
    const inner: LearningRequest = {
      apiVersion: LEARNING_API_VERSION,
      requestId: phaseRequestId(request.requestId, 'lesson'),
      model: request.model,
      operation: {
        kind: 'source-grounded-tutor',
        question: SOURCED_LESSON_QUESTION,
        sources: generationSources(selected),
        learnerContext: [
          ...learnerContext,
          {
            id: 'steptitle',
            kind: 'human-note',
            text: `${step.title}: ${step.objective}`.slice(0, 4_000),
          },
        ],
      },
    };
    const response = await completeLearning(account, inner, signal);
    const mapped = mapLearningOutcome(request, response);
    if (mapped) return mapped;
    if (response.outcome !== 'success')
      return unavailable(request.requestId, 'none');
    if (response.contribution.kind !== 'source-grounded-tutor') {
      return unavailable(request.requestId, 'charged');
    }
    return {
      lesson: generatedLessonFromTutor({
        step,
        contribution: response.contribution,
        requestId: inner.requestId,
        generatedAt: response.provenance.createdAt,
      }),
      quota: response.quota,
      provenance: response.provenance,
    };
  }

  return {
    async handle(account, request, signal) {
      const now = clock();
      const decision = await options.runEffect(
        options.operations.begin({
          accountId: account.id,
          requestId: request.requestId,
          kind: 'onboarding',
          inputHash: clientVisibleInputHash({
            apiVersion: LEARNING_ONBOARDING_API_VERSION,
            requestId: request.requestId,
            model: request.model,
            operation: request.operation,
          }),
          now,
        }),
      );
      if (decision.kind === 'conflict') {
        return {
          outcome: 'conflict',
          requestId: request.requestId,
          message: MESSAGES.conflict,
          retryable: false,
        };
      }
      if (decision.kind === 'in-progress') {
        return unavailable(request.requestId, 'reservation-retained');
      }
      if (decision.kind === 'duplicate' || decision.kind === 'uncertain') {
        return (decision.record.publicResponse ??
          unavailable(
            request.requestId,
            'reservation-retained',
          )) as LearningOnboardingResponse;
      }
      try {
        const result = await execute(account, request, signal);
        const retain =
          result.outcome === 'unavailable' &&
          result.accounting === 'reservation-retained';
        await options.runEffect(
          retain
            ? options.operations.retain({
                accountId: account.id,
                requestId: request.requestId,
                publicResponse: result,
                now: clock(),
              })
            : options.operations.complete({
                accountId: account.id,
                requestId: request.requestId,
                publicResponse: result,
                now: clock(),
              }),
        );
        return result;
      } catch (cause) {
        if (signal.aborted) {
          const aborted = cancelled(request.requestId, 'released');
          await options.runEffect(
            options.operations.complete({
              accountId: account.id,
              requestId: request.requestId,
              publicResponse: aborted,
              now: clock(),
            }),
          );
          return aborted;
        }
        diagnostics.report('onboarding.execution-failed', cause);
        const failure = unavailable(request.requestId, 'reservation-retained');
        await options.runEffect(
          options.operations.retain({
            accountId: account.id,
            requestId: request.requestId,
            publicResponse: failure,
            now: clock(),
          }),
        );
        return failure;
      }
    },
  };
}
