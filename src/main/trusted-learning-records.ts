import type { SourceCitation } from '../contracts/learning-records';
import { decodeText, decodeUuid } from './workspace-decoder';

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

function record(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid ${description}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, description: string): string {
  const decoded = decodeText(value, description, 4_000);
  if (!decoded.trim()) throw new Error(`Invalid ${description}: enter text.`);
  return decoded;
}

function citation(value: unknown, index: number): SourceCitation {
  const input = record(value, `backend citation ${index}`);
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
      5_000_000,
    ),
  };
}

export function decodeTrustedLearningPath(
  value: unknown,
): TrustedLearningPathAcceptance {
  const input = record(value, 'trusted learning path result');
  if (
    !Number.isInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0
  ) {
    throw new Error('Invalid expected path revision.');
  }
  const contribution = record(input.contribution, 'learning path contribution');
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
      title: requiredText(contribution.title, 'learning path title'),
      steps: contribution.steps.map((value_, stepIndex) => {
        const step = record(value_, `learning path step ${stepIndex}`);
        if (!Array.isArray(step.citations)) {
          throw new Error(
            `Invalid learning path step ${stepIndex}: citations must be a list.`,
          );
        }
        return {
          title: requiredText(
            step.title,
            `learning path step ${stepIndex} title`,
          ),
          objective: requiredText(
            step.objective,
            `learning path step ${stepIndex} objective`,
          ),
          activity: requiredText(
            step.activity,
            `learning path step ${stepIndex} activity`,
          ),
          citations: step.citations.map(citation),
        };
      }),
    },
  };
}
