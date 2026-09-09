import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import {
  CONTEXTUAL_HELP_CONTRACT_VERSION,
  CONTEXTUAL_HELP_QUESTION_LIMIT,
  decodeContextualHelpResponse,
  UNTRUSTED_DISPLAY_COPY_ROLE,
  type ContextualHelpIntent,
  type ContextualHelpRequest,
} from '../../contracts/contextual-help';
import type { LearningOrigin } from '../../contracts/learning-records';
import type {
  RetainedExplanation,
  SceneCaptureRequest,
  SceneLocalState,
} from '../../contracts/explanation-artifacts';
import type { ContextualHelpBridge } from './contextual-help-bridge';
import { RetainedScene } from './RetainedScene';
import './explanations.css';

export interface ContextualSelection {
  kind: ContextualHelpIntent;
  origin: LearningOrigin;
  quote: string;
}

type PanelStatus = 'idle' | 'loading' | 'ready' | 'failed';

function selectionIdentity(
  projectId: string,
  selection: ContextualSelection | null,
): string {
  if (!selection) return `${projectId}:none`;
  if (selection.origin.highlightId) {
    return `${projectId}:${selection.kind}:h:${selection.origin.highlightId}`;
  }
  if (selection.origin.entry) {
    return `${projectId}:${selection.kind}:q:${selection.origin.entry.entryId}:${selection.origin.entry.revision}`;
  }
  return `${projectId}:${selection.kind}:empty`;
}

function selectionMatches(
  record: RetainedExplanation,
  selection: ContextualSelection,
): boolean {
  if (record.intent !== selection.kind) return false;
  if (selection.origin.highlightId) {
    return record.origin.highlightId === selection.origin.highlightId;
  }
  const entry = selection.origin.entry;
  return (
    entry !== undefined &&
    record.origin.entry?.entryId === entry.entryId &&
    record.origin.entry.revision === entry.revision
  );
}

export function ContextualHelpPanel({
  projectId,
  projectGeneration,
  requestGeneration,
  bridge,
  selection,
  active,
  onReturnToOrigin,
}: {
  readonly projectId: string;
  readonly projectGeneration: number;
  readonly requestGeneration: number;
  readonly bridge: ContextualHelpBridge;
  readonly selection: ContextualSelection | null;
  readonly active: boolean;
  readonly onReturnToOrigin?: (origin: LearningOrigin) => void;
}): ReactElement {
  const questionId = useId();
  const identity = selectionIdentity(projectId, selection);
  const [draft, setDraft] = useState('');
  const [request, setRequest] = useState<{
    identity: string;
    status: PanelStatus;
    message: string | null;
    retryable: boolean;
  }>({ identity: '', status: 'idle', message: null, retryable: false });
  const [explanation, setExplanation] = useState<RetainedExplanation | null>(
    null,
  );
  const [scene, setScene] = useState<SceneLocalState | null>(null);
  const inFlight = useRef<string | null>(null);
  const quote = selection?.quote ?? '';
  const origin = selection?.origin ?? null;
  const status = request.identity === identity ? request.status : 'idle';
  const message = request.identity === identity ? request.message : null;
  const retryable = request.identity === identity ? request.retryable : false;
  const retained =
    explanation && selection && selectionMatches(explanation, selection)
      ? explanation
      : null;
  const visibleScene =
    retained && scene?.explanationId === retained.explanationId ? scene : null;

  useEffect(() => {
    inFlight.current = null;
    if (!selection) return;
    let cancelled = false;
    void bridge
      .listRetainedExplanations({ projectId })
      .then(async (listed) => {
        if (cancelled || inFlight.current) return;
        const match = listed.find((item) => selectionMatches(item, selection));
        if (!match) return;
        const sceneState =
          match.intent === 'visual'
            ? await bridge.loadExplanationSceneState({
                projectId,
                explanationId: match.explanationId,
              })
            : null;
        if (cancelled || inFlight.current) return;
        setExplanation(match);
        setScene(sceneState);
        setRequest((current) =>
          current.identity === identity &&
          (current.status === 'loading' || current.status === 'failed')
            ? current
            : {
                identity,
                status: 'ready',
                message: null,
                retryable: false,
              },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, selection, bridge, identity]);

  async function submit(
    intent: ContextualHelpIntent,
    human: boolean,
  ): Promise<void> {
    if (!selection || !origin) return;
    if (
      human &&
      (draft.trim().length < 1 || draft.length > CONTEXTUAL_HELP_QUESTION_LIMIT)
    ) {
      setRequest({
        identity,
        status: 'failed',
        message: 'Enter a question of at most 2,000 characters.',
        retryable: false,
      });
      return;
    }
    const requestId = crypto.randomUUID();
    inFlight.current = requestId;
    setRequest({
      identity,
      status: 'loading',
      message: null,
      retryable: false,
    });
    const locator =
      origin.highlightId && origin.sourceRevisionId
        ? {
            kind: 'source-highlight' as const,
            sourceRevisionId: origin.sourceRevisionId,
            highlightId: origin.highlightId,
          }
        : origin.entry
          ? { kind: 'saved-question' as const, entry: origin.entry }
          : null;
    if (!locator) {
      setRequest({
        identity,
        status: 'failed',
        message: 'This selection has no retained highlight or saved question.',
        retryable: false,
      });
      return;
    }
    const envelope: ContextualHelpRequest = {
      contractVersion: CONTEXTUAL_HELP_CONTRACT_VERSION,
      projectId,
      requestId,
      expectedProjectGeneration: projectGeneration,
      expectedRequestGeneration: requestGeneration,
      origin: locator,
      intent,
      question: human
        ? { kind: 'human', text: draft }
        : {
            kind: 'app-authored',
            intent:
              intent === 'visual'
                ? 'explain-this-visually'
                : 'explain-this-passage',
          },
      untrustedSelection: {
        role: UNTRUSTED_DISPLAY_COPY_ROLE,
        quote: selection.quote,
      },
    };
    try {
      const raw = await bridge.requestContextualHelp(envelope);
      if (inFlight.current !== requestId) return;
      const decoded = decodeContextualHelpResponse(raw);
      if (!decoded.ok) {
        setRequest({
          identity,
          status: 'failed',
          message:
            'The explanation response was invalid. Your draft is unchanged.',
          retryable: true,
        });
        return;
      }
      if (decoded.value.outcome === 'success') {
        const loaded = await bridge.loadRetainedExplanation({
          projectId,
          explanationId: decoded.value.explanationId,
        });
        const sceneState =
          loaded?.intent === 'visual'
            ? await bridge.loadExplanationSceneState({
                projectId,
                explanationId: loaded.explanationId,
              })
            : null;
        if (inFlight.current !== requestId) return;
        setExplanation(loaded);
        setScene(sceneState);
        setRequest({
          identity,
          status: 'ready',
          message: null,
          retryable: false,
        });
        return;
      }
      if (decoded.value.outcome === 'cancelled') {
        setRequest({
          identity,
          status: 'idle',
          message: 'Cancelled. Your selection and draft are unchanged.',
          retryable: true,
        });
        return;
      }
      setRequest({
        identity,
        status: 'failed',
        retryable:
          decoded.value.outcome === 'unavailable' && decoded.value.retryable,
        message:
          decoded.value.outcome === 'conflict'
            ? 'This learning space changed. Retry from the current selection.'
            : decoded.value.message,
      });
      if (decoded.value.outcome === 'unsupported') {
        const listed = await bridge.listRetainedExplanations({ projectId });
        const match = listed.find((item) =>
          selectionMatches(item, { ...selection, kind: intent }),
        );
        if (match) setExplanation(match);
      }
    } catch {
      if (inFlight.current !== requestId) return;
      setRequest({
        identity,
        status: 'failed',
        retryable: true,
        message: 'Could not reach remote learning. Your draft is unchanged.',
      });
    }
  }

  async function cancel(): Promise<void> {
    const requestId = inFlight.current;
    if (!requestId) return;
    await bridge.cancelContextualHelp({
      requestId,
      expectedProjectGeneration: projectGeneration,
      expectedRequestGeneration: requestGeneration,
    });
  }

  const useful = retained?.attempts.find(
    (attempt) => attempt.attemptId === retained.usefulAttemptId,
  );
  const latest = retained?.attempts.at(-1);
  const plan = latest?.plan ?? useful?.plan ?? null;

  return (
    <section className="contextual-help" aria-label="Contextual explanation">
      <h2>Ask about this passage</h2>
      {quote ? (
        <blockquote className="contextual-help-quote">{quote}</blockquote>
      ) : (
        <p className="reader-muted">
          Select a passage, then ask or request a visual explanation.
        </p>
      )}
      <label htmlFor={questionId}>Your question</label>
      <textarea
        id={questionId}
        maxLength={CONTEXTUAL_HELP_QUESTION_LIMIT}
        value={draft}
        disabled={status === 'loading'}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="reader-actions">
        <button
          disabled={!selection || status === 'loading'}
          onClick={() => void submit('text', draft.trim().length > 0)}
        >
          {draft.trim() ? 'Ask this question' : 'Explain this passage'}
        </button>
        <button
          disabled={!selection || status === 'loading'}
          onClick={() => void submit('visual', draft.trim().length > 0)}
        >
          Visual explanation
        </button>
        {status === 'loading' && (
          <button onClick={() => void cancel()}>Cancel</button>
        )}
        {status === 'failed' && retryable && (
          <button
            onClick={() =>
              void submit(selection?.kind ?? 'text', draft.trim().length > 0)
            }
          >
            Retry
          </button>
        )}
        {origin && onReturnToOrigin && (
          <button onClick={() => onReturnToOrigin(origin)}>
            Return to passage
          </button>
        )}
      </div>
      {status === 'loading' && (
        <output>
          Working from the retained selection. Your draft stays visible.
        </output>
      )}
      {message && <p role="status">{message}</p>}
      {useful?.result?.kind === 'text-answer' && (
        <article className="contextual-help-answer" aria-label="AI answer">
          <p>{useful.result.body}</p>
          <p className="reader-muted">{useful.result.nextAction}</p>
          <p className="reader-muted">
            AI-authored. Add a Note in your own words.
          </p>
        </article>
      )}
      {plan?.status === 'unsupported' && (
        <article aria-label="Unsupported visual explanation">
          <p>{plan.textualContinuation}</p>
          <p className="reader-muted">{plan.practicalContinuation}</p>
        </article>
      )}
      {plan?.status === 'supported' &&
        (plan.family === 'linear-transform' ||
          plan.family === 'weighted-combination') &&
        useful?.result?.kind !== 'clip' && (
          <article aria-label="Visual plan without clip playback">
            <p>{plan.caption}</p>
            <p className="reader-muted">{plan.rationale.text}</p>
            <p role="status">
              Manim playback is not mounted in this revision. Continue with the
              textual explanation.
            </p>
          </article>
        )}
      {retained && useful?.result?.kind === 'scene' && (
        <RetainedScene
          explanation={retained}
          scene={visibleScene}
          active={active}
          onParameters={(next) => {
            setScene(next);
            void bridge.saveExplanationSceneState({
              projectId,
              state: next,
            });
          }}
          onCaptureRequest={(request: SceneCaptureRequest) => {
            void bridge.acceptSceneCapture({ projectId, request });
          }}
        />
      )}
    </section>
  );
}
