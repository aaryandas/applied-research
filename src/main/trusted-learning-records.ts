import { randomUUID } from 'node:crypto';
import type { SourceCitation } from '../contracts/learning-records';
import { SOURCE_TEXT_LIMIT } from './learning-record-validation';
import {
  decodeRecord,
  decodeRequiredText,
  decodeText,
  decodeUuid,
} from './workspace-decoder';

export interface TrustedLearningPathAcceptance {
  projectId: string;
  pathId?: string;
  expectedRevision: number;
  contribution: {
    kind: 'learning-path';
    title: string;
    steps: Array<{
      title: string;
      objective: string;
      activity: string;
      citations: SourceCitation[];
    }>;
  };
}

export interface PriorTrustedLesson {
  id: string;
  title: string;
  objective: string;
  activity: string;
}

type TrustedStep =
  TrustedLearningPathAcceptance['contribution']['steps'][number];

function sameLessonMeaning(
  left: Pick<PriorTrustedLesson, 'title' | 'objective' | 'activity'>,
  right: Pick<TrustedStep, 'title' | 'objective' | 'activity'>,
): boolean {
  return (
    left.title === right.title &&
    left.objective === right.objective &&
    left.activity === right.activity
  );
}

export function allocateTrustedLessonIds(
  previous: readonly PriorTrustedLesson[],
  next: readonly TrustedStep[],
): string[] {
  return next.map((step) => {
    const priorMatches = previous.filter((lesson) =>
      sameLessonMeaning(lesson, step),
    );
    const nextMatchCount = next.filter((candidate) =>
      sameLessonMeaning(candidate, step),
    ).length;
    return priorMatches.length === 1 && nextMatchCount === 1
      ? priorMatches[0]!.id
      : randomUUID();
  });
}

function citation(value: unknown, index: number): SourceCitation {
  const input = decodeRecord(value, `backend citation ${index}`);
  if (
    !Number.isInteger(input.start) ||
    !Number.isInteger(input.end) ||
    Number(input.start) < 0 ||
    Number(input.end) <= Number(input.start)
  ) {
    throw new Error(`Invalid backend citation ${index} range.`);
  }
  return {
    sourceId: decodeUuid(input.sourceId, `backend citation ${index} source id`),
    revisionId: decodeUuid(
      input.revisionId,
      `backend citation ${index} revision id`,
    ),
    start: Number(input.start),
    end: Number(input.end),
    quote: decodeText(
      input.quote,
      `backend citation ${index} quote`,
      SOURCE_TEXT_LIMIT,
    ),
  };
}

export function decodeTrustedLearningPath(
  value: unknown,
): TrustedLearningPathAcceptance {
  const input = decodeRecord(value, 'trusted learning path result');
  if (
    !Number.isInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0
  ) {
    throw new Error('Invalid expected path revision.');
  }
  const contribution = decodeRecord(
    input.contribution,
    'learning path contribution',
  );
  if (
    contribution.kind !== 'learning-path' ||
    !Array.isArray(contribution.steps)
  ) {
    throw new Error('Invalid learning path contribution.');
  }
  if (contribution.steps.length === 0) {
    throw new Error('A backend learning path needs at least one step.');
  }
  return {
    projectId: decodeUuid(input.projectId, 'project id'),
    ...(input.pathId === undefined
      ? {}
      : { pathId: decodeUuid(input.pathId, 'path id') }),
    expectedRevision: Number(input.expectedRevision),
    contribution: {
      kind: 'learning-path',
      title: decodeRequiredText(
        contribution.title,
        'learning path title',
        4_000,
      ),
      steps: contribution.steps.map((value_, stepIndex) => {
        const step = decodeRecord(value_, `learning path step ${stepIndex}`);
        if (!Array.isArray(step.citations)) {
          throw new Error(
            `Invalid learning path step ${stepIndex}: citations must be a list.`,
          );
        }
        return {
          title: decodeRequiredText(
            step.title,
            `learning path step ${stepIndex} title`,
            4_000,
          ),
          objective: decodeRequiredText(
            step.objective,
            `learning path step ${stepIndex} objective`,
            4_000,
          ),
          activity: decodeRequiredText(
            step.activity,
            `learning path step ${stepIndex} activity`,
            4_000,
          ),
          citations: step.citations.map(citation),
        };
      }),
    },
  };
}
