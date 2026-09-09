import type { ContextualHelpIntent } from '../../contracts/contextual-help';
import type { LearningOrigin } from '../../contracts/learning-records';
import type { RetainedExplanation } from '../../contracts/explanation-artifacts';

export function originIdentity(
  projectId: string,
  origin: LearningOrigin | null,
): string {
  if (!origin) return `${projectId}:none`;
  if (origin.highlightId) return `${projectId}:h:${origin.highlightId}`;
  if (origin.entry) {
    return `${projectId}:q:${origin.entry.entryId}:${origin.entry.revision}`;
  }
  return `${projectId}:empty`;
}

export function originMatches(
  record: LearningOrigin,
  origin: LearningOrigin,
): boolean {
  if (origin.highlightId) {
    return (
      record.highlightId === origin.highlightId &&
      record.sourceRevisionId === origin.sourceRevisionId
    );
  }
  return Boolean(
    origin.entry &&
    record.entry?.entryId === origin.entry.entryId &&
    record.entry.revision === origin.entry.revision,
  );
}

export function recordMatchesRequestedIntent(
  record: RetainedExplanation,
  origin: LearningOrigin,
  intent: ContextualHelpIntent,
): boolean {
  return record.intent === intent && originMatches(record.origin, origin);
}
