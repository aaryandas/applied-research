import { Effect } from 'effect';
import type { PublicAccount } from '../../contracts/learning-api.js';
import { sha256Text } from '../validation-primitives.js';
import type { EvidenceGenerationRequest } from './evidence.js';
import { generatedLessonSource } from './lesson-source.js';
import { assessClaims } from './support.js';
import type { LearningTiming } from './timing.js';
import type {
  SourcedLearningOptions,
  SourcedLearningResponse,
} from './types.js';

export interface SourcedGenerationContext {
  options: SourcedLearningOptions;
  account: PublicAccount;
  request: EvidenceGenerationRequest;
  timing: LearningTiming;
}

export function generateSourcedPath(
  context: SourcedGenerationContext,
  progress: SourcedLearningResponse,
): Effect.Effect<SourcedLearningResponse> {
  const { options, account, request, timing } = context;
  return Effect.gen(function* () {
    const pathResult = yield* timing.measure(
      'generationMs',
      options.learning.request(account, request),
    );
    if (pathResult.outcome !== 'success')
      return {
        ...progress,
        failure: pathResult,
        quota:
          pathResult.outcome === 'quota-exceeded'
            ? pathResult.quota
            : progress.quota,
        gaps: [
          ...progress.gaps,
          {
            kind: 'generation',
            message:
              'A sourced path could not be generated. Retrieved sources remain available.',
          },
        ],
      } satisfies SourcedLearningResponse;
    progress.provenance.push(pathResult.provenance);
    progress.quota = pathResult.quota;
    if (pathResult.contribution.kind !== 'learning-path')
      return {
        ...progress,
        gaps: [
          ...progress.gaps,
          {
            kind: 'generation',
            message: 'The generated response was not a learning path.',
          },
        ],
      } satisfies SourcedLearningResponse;
    const path = pathResult.contribution;
    const proposedSteps = path.steps.map((step, index) => ({
      ...step,
      id: `step_${sha256Text(`${request.requestId}:${index}`)}`,
    }));
    const pathSupport = yield* timing.measure(
      'verificationMs',
      assessClaims(
        options,
        proposedSteps.map((step) => ({
          id: step.id,
          text: `${step.title}\n${step.objective}\n${step.activity}`,
          citations: step.citations,
        })),
        progress.evidence,
        {
          account,
          request,
          phase: 'path',
          generatedAt: pathResult.provenance.createdAt,
          sourceScopes: request.evidenceContext.sourceScopes,
        },
      ),
    );
    const supportedSteps = proposedSteps.filter((step) =>
      pathSupport.supported.has(step.id),
    );
    progress.gaps.push(...pathSupport.gaps);
    progress.supportReviews.push(pathSupport.review);
    progress.quota = pathSupport.review.quota ?? progress.quota;
    progress.failure = pathSupport.review.failure;
    if (supportedSteps.length > 0)
      progress.path = { title: path.title, steps: supportedSteps };
    return progress;
  });
}

export function generateSourcedLesson(
  context: SourcedGenerationContext,
  progress: SourcedLearningResponse,
): Effect.Effect<SourcedLearningResponse> {
  const { options, account, request, timing } = context;
  const first = progress.path?.steps[0];
  if (!first) return Effect.succeed(progress);
  return Effect.gen(function* () {
    const lessonResult = yield* timing.measure(
      'generationMs',
      options.learning.request(account, {
        ...request,
        requestId: `lesson_${sha256Text(request.requestId)}`,
        operation: {
          kind: 'source-grounded-tutor',
          question: `Teach the learning step “${first.title}”: ${first.objective}. Give a readable explanation in short paragraphs using only supplied source evidence. Separate explanation from exact quotes. Omit unsupported central claims and identify coverage gaps.`,
          sources: request.operation.sources,
          learnerContext: request.operation.learnerContext,
        },
      }),
    );
    if (lessonResult.outcome !== 'success')
      return {
        ...progress,
        outcome: 'partial',
        failure: lessonResult,
        quota:
          lessonResult.outcome === 'quota-exceeded'
            ? lessonResult.quota
            : progress.quota,
        gaps: [
          ...progress.gaps,
          {
            kind: 'generation',
            message:
              'The first lesson could not be generated. Supported path steps remain available.',
          },
        ],
      } satisfies SourcedLearningResponse;
    progress.provenance.push(lessonResult.provenance);
    progress.quota = lessonResult.quota;
    if (lessonResult.contribution.kind !== 'source-grounded-tutor')
      return {
        ...progress,
        outcome: 'partial',
        gaps: [
          ...progress.gaps,
          {
            kind: 'generation',
            message: 'The generated response was not a lesson.',
          },
        ],
      } satisfies SourcedLearningResponse;
    const lesson = lessonResult.contribution;
    const paragraphs = lesson.body.split(/\n\s*\n/).map((text, index) => ({
      id: `paragraph-${index + 1}`,
      text,
      citations: lesson.citations,
    }));
    const support = yield* timing.measure(
      'verificationMs',
      assessClaims(options, paragraphs, progress.evidence, {
        account,
        request,
        phase: 'lesson',
        generatedAt: lessonResult.provenance.createdAt,
        sourceScopes: request.evidenceContext.sourceScopes,
      }),
    );
    const supportedParagraphs = paragraphs.filter((paragraph) =>
      support.supported.has(paragraph.id),
    );
    progress.gaps.push(...support.gaps);
    progress.supportReviews.push(support.review);
    progress.quota = support.review.quota ?? progress.quota;
    progress.failure = support.review.failure;
    if (supportedParagraphs.length === 0)
      return {
        ...progress,
        outcome: 'partial',
      } satisfies SourcedLearningResponse;
    return {
      ...progress,
      outcome: progress.gaps.length > 0 ? 'partial' : 'sourced',
      lesson: {
        source: generatedLessonSource({
          requestId: request.requestId,
          title: first.title,
          paragraphs: supportedParagraphs,
          generatedAt: lessonResult.provenance.createdAt,
        }),
        stepId: first.id,
        paragraphs: supportedParagraphs.map(({ text, citations }) => ({
          text,
          kind: 'ai-explanation',
          citations,
        })),
        activity: {
          text: first.activity,
          kind: 'ai-proposed-activity',
          masteryEstablished: false,
        },
      },
    } satisfies SourcedLearningResponse;
  });
}
