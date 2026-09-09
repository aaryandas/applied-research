import { createHash } from 'node:crypto';
import type {
  CommitResult,
  LearningPathRecord,
  SourceCitation,
} from '../contracts/learning-records';
import { SOURCING_API_VERSION } from '../contracts/sourcing';
import {
  decodeRecord,
  decodeRequiredText,
  decodeUuid,
  WorkspaceValidationError,
} from './workspace-decoder';
import type { WorkspaceStore } from './workspace-store';

function boundedList(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > limit)
    throw new WorkspaceValidationError('Invalid sourced learning list.');
  return value;
}
function localPathId(projectId: string, requestId: string): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([projectId, requestId]))
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
/** Called inside the store's outer transaction. AR-36 objects remain untrusted data. */
export function adoptSourcedLearning(
  store: WorkspaceStore,
  value: unknown,
): CommitResult<LearningPathRecord> {
  const input = decodeRecord(value, 'sourced learning acceptance');
  const projectId = decodeUuid(input.projectId, 'project id');
  const requestId = decodeRequiredText(input.requestId, 'request id', 100);
  const response = decodeRecord(input.response, 'sourced learning response');
  if (
    response.requestId !== requestId ||
    response.author !== 'ai' ||
    response.scope !== 'first-useful-step' ||
    (response.outcome !== 'sourced' && response.outcome !== 'partial')
  )
    throw new WorkspaceValidationError(
      'Sourced learning response does not match its request.',
    );
  const path = decodeRecord(response.path, 'supported path');
  const steps = boundedList(path.steps, 12).map((value) =>
    decodeRecord(value, 'supported step'),
  );
  const seenSteps = new Set<string>();
  for (const step of steps) {
    const id = decodeRequiredText(step.id, 'step id', 100);
    if (seenSteps.has(id))
      throw new WorkspaceValidationError('Duplicate sourced step.');
    seenSteps.add(id);
  }
  for (const value_ of boundedList(response.sources, 4)) {
    const source = decodeRecord(value_, 'acquired evidence');
    const revision = decodeRecord(
      decodeRecord(source.content, 'source content').revision,
      'source edition',
    );
    const provenance = decodeRecord(
      revision.provenance,
      'acquisition provenance',
    );
    store.acceptAcquiredSource({
      projectId,
      request: {
        apiVersion: SOURCING_API_VERSION,
        requestId,
        sourceId: source.sourceId,
        providerIdentity: provenance.providerIdentity,
      },
      response: { outcome: 'success', requestId, source: value_ },
    });
  }
  const originals = store
    .getLearningWorkspace(projectId)
    .sources.flatMap((source) => source.versions);
  const citations = (value_: unknown): SourceCitation[] =>
    boundedList(value_, 12).map((value) => {
      const citation = decodeRecord(value, 'supported citation');
      if (
        typeof citation.start !== 'number' ||
        typeof citation.end !== 'number'
      )
        throw new WorkspaceValidationError('Citation offsets must be numbers.');
      const original = originals.find(
        (version) =>
          version.provenance.kind === 'discovered' &&
          version.provenance.remoteSourceId === citation.sourceId &&
          version.provenance.remoteRevisionId === citation.revisionId,
      );
      if (!original)
        throw new WorkspaceValidationError(
          'Original evidence edition is missing.',
        );
      return {
        sourceId: original.sourceId,
        revisionId: original.revisionId,
        start: Number(citation.start),
        end: Number(citation.end),
        quote: decodeRequiredText(citation.quote, 'citation quote', 12000),
      };
    });
  let teaching: { stepId: string; revisionId: string } | null = null;
  if (response.lesson !== null) {
    const lesson = decodeRecord(response.lesson, 'supported lesson');
    const source = decodeRecord(lesson.source, 'teaching source');
    const paragraphs = boundedList(lesson.paragraphs, 12).map((value) =>
      decodeRecord(value, 'supported paragraph'),
    );
    if (
      paragraphs.some((paragraph) => paragraph.kind !== 'ai-explanation') ||
      paragraphs.map((paragraph) => paragraph.text).join('\n\n') !==
        source.canonicalText ||
      lesson.stepId !== steps[0]!.id ||
      source.title !== steps[0]!.title
    )
      throw new WorkspaceValidationError(
        'Teaching text does not match its supported lesson.',
      );
    const activity = decodeRecord(lesson.activity, 'generated activity');
    if (
      activity.kind !== 'ai-proposed-activity' ||
      activity.masteryEstablished !== false ||
      activity.text !== steps[0]!.activity
    )
      throw new WorkspaceValidationError(
        'Generated activity does not match its step.',
      );
    const generation = boundedList(response.provenance, 4)
      .map((value) => decodeRecord(value, 'AI provenance'))
      .findLast((item) => item.createdAt === source.acquiredAt);
    if (!generation)
      throw new WorkspaceValidationError('Teaching provenance is missing.');
    const lessonCitations = new Map<string, SourceCitation>();
    for (const paragraph of paragraphs)
      for (const citation of citations(paragraph.citations)) {
        lessonCitations.set(JSON.stringify(citation), citation);
      }
    const saved = store.acceptGeneratedLesson({
      projectId,
      requestId,
      source,
      generation,
      citations: [...lessonCitations.values()],
    });
    teaching = {
      stepId: String(lesson.stepId),
      revisionId: saved.acknowledgement.revisionId!,
    };
  }
  const result = store.acceptBackendLearningPath({
    projectId,
    pathId: localPathId(projectId, requestId),
    expectedRevision: 0,
    contribution: {
      kind: 'learning-path',
      title: path.title,
      steps: steps.map((step) => ({
        title: step.title,
        objective: step.objective,
        activity: step.activity,
        citations: citations(step.citations),
        ...(teaching && teaching.stepId === step.id
          ? { sourceRevisionId: teaching.revisionId }
          : { sourceState: 'pending' }),
      })),
    },
  });
  if (result.status !== 'committed')
    throw new WorkspaceValidationError(
      'The generated path conflicts with a retained edition.',
    );
  return result;
}
