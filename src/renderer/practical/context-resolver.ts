import type { PracticalAttemptScope } from '../../contracts/practical-records';
import {
  MAX_PRACTICAL_FIELD_LENGTH,
  isPracticalActivity,
  isRecordPracticalResultInput,
  type PracticalDraft,
  type PracticalEvidenceReference,
  type PracticalGuidanceRequest,
} from '../../contracts/practical-work';
import type { PracticalSaveSnapshot } from './save-session';
import { selectionIsAvailable } from './evidence';
import { PRACTICAL_TOOLS } from '../../contracts/practical-tools';

/** App host metadata, never an observation of controls inside a guest page. */
export interface PracticalHostToolState {
  sessionId: string;
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  controls: readonly { name: string; description: string }[];
}

/** Output of an ownership-validating retained-evidence producer, not renderer-authored text. */
export interface PracticalResolvedEvidence {
  scope: PracticalAttemptScope;
  reference: PracticalEvidenceReference;
  text: string;
  provenanceId: string;
}

export interface PracticalContextOptions {
  identity: PracticalAttemptScope;
  getSnapshot(): PracticalSaveSnapshot;
  toolSessionId?: string;
  /** Live host session; prefer this over a construction snapshot so bind does not replace the producer. */
  getToolSessionId?(): string | undefined;
  getToolState?(): PracticalHostToolState | null;
  resolveEvidence?(
    scope: PracticalAttemptScope,
    reference: PracticalEvidenceReference,
    signal: AbortSignal,
  ): Promise<PracticalResolvedEvidence | null>;
}

export type PracticalContextResolver = ReturnType<
  typeof createPracticalContextResolver
>;
export interface PracticalContextRegistration extends Omit<
  PracticalContextOptions,
  'identity' | 'getSnapshot'
> {
  registerResolver(
    resolve: PracticalContextResolver['resolveTarget'],
  ): () => void;
}

function scopeKey(scope: PracticalAttemptScope): string {
  const { activity, attemptId } = scope;
  const { path, sourceRevisionId, highlightId } = activity.origin;
  return JSON.stringify([
    attemptId,
    activity.projectId,
    path.pathId,
    path.pathRevision,
    path.topicId,
    path.lessonId,
    sourceRevisionId,
    highlightId,
    activity.title,
    activity.instructions,
    activity.objective,
  ]);
}
const unavailable = () => ({
  status: 'unavailable' as const,
  message: 'The selected context is unavailable. Select it again when ready.',
});
const cancelled = () => ({
  status: 'cancelled' as const,
  message: 'Guidance stopped. Ask again when ready.',
});
const stale = () => ({
  status: 'stale' as const,
  message: 'The activity or selected context changed. Select it again.',
});
function sameDraft(left: PracticalDraft, right: PracticalDraft): boolean {
  return (
    left.prediction === right.prediction &&
    left.attempt === right.attempt &&
    left.reportedResult.text === right.reportedResult.text &&
    left.reflection.text === right.reflection.text &&
    sameReference(left.selectedEvidence, right.selectedEvidence)
  );
}
function sameReference(
  left: PracticalEvidenceReference | null,
  right: PracticalEvidenceReference | null,
): boolean {
  if (!left || !right) return left === right;
  return left.kind === 'app-measured' && right.kind === 'app-measured'
    ? left.captureId === right.captureId
    : left.kind === 'user-selected-file' &&
        right.kind === 'user-selected-file' &&
        left.selectionId === right.selectionId;
}
function boundedText(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length <= MAX_PRACTICAL_FIELD_LENGTH &&
    !!value.trim() &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value)
  );
}

/** Inferred output is checked against pending AR-25 CompanionResolution; no second contract. */
export function createPracticalContextResolver(
  options: PracticalContextOptions,
) {
  const identity = structuredClone({
    activity: options.identity.activity,
    attemptId: options.identity.attemptId,
  });
  const toolSessionId = () =>
    options.getToolSessionId?.() ?? options.toolSessionId;
  let disposed = false;
  const pending = new Set<AbortController>();
  async function resolveTarget(
    request: PracticalGuidanceRequest,
    signal: AbortSignal,
  ) {
    if (disposed || signal.aborted) return cancelled();
    if (
      request?.trigger !== 'explicit-action' ||
      request.target?.scope !== 'applied-research' ||
      request.target.surface !== 'practical-work' ||
      !isPracticalActivity(request.target.activity) ||
      scopeKey(request.target) !== scopeKey(identity) ||
      ![
        'activity-instructions',
        'reflection',
        'selected-result',
        'tool-controls',
      ].includes(request.target.target) ||
      Object.keys(request).length !== 2 ||
      Object.keys(request.target).some(
        (key) =>
          !['scope', 'surface', 'attemptId', 'activity', 'target'].includes(
            key,
          ),
      )
    )
      return stale();
    if (request.target.target === 'tool-controls' && !toolSessionId())
      return unavailable();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    pending.add(controller);
    let stopWaiting = () => {};
    try {
      const snapshot = structuredClone(options.getSnapshot());
      const toolBefore =
        request.target.target === 'tool-controls'
          ? JSON.stringify(options.getToolState?.())
          : null;
      const stopped = new Promise<ReturnType<typeof cancelled>>((resolve) => {
        stopWaiting = () => resolve(cancelled());
        controller.signal.addEventListener('abort', stopWaiting, {
          once: true,
        });
      });
      const result = await Promise.race([
        resolveContext(structuredClone(request), snapshot, controller.signal),
        stopped,
      ]);
      if (controller.signal.aborted) return cancelled();
      if (options.getSnapshot().generation !== snapshot.generation)
        return stale();
      if (
        toolBefore !== null &&
        JSON.stringify(options.getToolState?.()) !== toolBefore
      )
        return stale();
      if (
        result.status === 'available' &&
        JSON.stringify(result.context).length > MAX_PRACTICAL_FIELD_LENGTH
      )
        return unavailable();
      return result;
    } catch {
      return controller.signal.aborted ? cancelled() : unavailable();
    } finally {
      signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', stopWaiting);
      pending.delete(controller);
    }
  }
  async function resolveContext(
    request: PracticalGuidanceRequest,
    snapshot: PracticalSaveSnapshot,
    signal: AbortSignal,
  ) {
    if (signal.aborted) return cancelled();
    if (
      !isRecordPracticalResultInput({
        activity: identity.activity,
        attemptId: identity.attemptId,
        expectedRevision: snapshot.saved?.revision ?? 0,
        draft: snapshot.draft,
      })
    )
      return unavailable();
    const version =
      snapshot.saved && sameDraft(snapshot.saved.draft, snapshot.draft)
        ? { kind: 'saved' as const, revision: snapshot.saved.revision }
        : {
            kind: 'unsaved-draft' as const,
            lastAcknowledgedRevision: snapshot.saved?.revision ?? null,
          };
    const requestedTarget = structuredClone(request.target);
    switch (requestedTarget.target) {
      case 'activity-instructions':
        return {
          status: 'available' as const,
          requestedTarget,
          context: {
            target: 'activity-instructions' as const,
            title: identity.activity.title,
            objective: identity.activity.objective,
            instructions: identity.activity.instructions,
          },
        };
      case 'reflection':
        if (!snapshot.draft.reflection.text.trim()) return unavailable();
        return {
          status: 'available' as const,
          requestedTarget,
          context: {
            target: 'reflection' as const,
            authorKind: 'human' as const,
            text: snapshot.draft.reflection.text,
            version,
          },
        };
      case 'selected-result':
        if (snapshot.draft.selectedEvidence) {
          if (
            !selectionIsAvailable(
              snapshot.draft.selectedEvidence,
              snapshot.evidence,
            ) ||
            !options.resolveEvidence
          )
            return unavailable();
          const resolved = await options.resolveEvidence(
            structuredClone(identity),
            structuredClone(snapshot.draft.selectedEvidence),
            signal,
          );
          if (
            !resolved ||
            !isPracticalActivity(resolved.scope.activity) ||
            scopeKey(resolved.scope) !== scopeKey(identity) ||
            !sameReference(
              resolved.reference,
              snapshot.draft.selectedEvidence,
            ) ||
            !boundedText(resolved.text) ||
            !boundedText(resolved.provenanceId)
          )
            return unavailable();
          return {
            status: 'available' as const,
            requestedTarget,
            context: {
              target: 'selected-result' as const,
              result: {
                kind: 'trusted-selected-evidence' as const,
                reference: structuredClone(resolved.reference),
                text: resolved.text,
                provenanceId: resolved.provenanceId,
              },
            },
          };
        }
        if (!snapshot.draft.reportedResult.text.trim()) return unavailable();
        return {
          status: 'available' as const,
          requestedTarget,
          context: {
            target: 'selected-result' as const,
            result: {
              kind: 'user-reported-text' as const,
              text: snapshot.draft.reportedResult.text,
              version,
            },
          },
        };
      case 'tool-controls': {
        const tool = options.getToolState?.();
        const boundSessionId = toolSessionId();
        if (!tool || !boundSessionId) return unavailable();
        if (tool.sessionId !== boundSessionId) return stale();
        const url = new URL(tool.url);
        if (
          url.username ||
          url.password ||
          !PRACTICAL_TOOLS.some(
            (candidate) => new URL(candidate.url).origin === url.origin,
          )
        )
          return unavailable();
        return {
          status: 'available' as const,
          requestedTarget,
          context: {
            target: 'tool-controls' as const,
            controls: structuredClone(tool.controls),
            loading: tool.loading,
            error: tool.error === null ? null : 'The tool could not load.',
            guest: {
              sessionId: tool.sessionId,
              url: tool.url,
              title: tool.title,
            },
          },
        };
      }
      default:
        return unavailable();
    }
  }
  return {
    resolveTarget,
    dispose() {
      disposed = true;
      for (const controller of pending) controller.abort();
    },
  };
}
