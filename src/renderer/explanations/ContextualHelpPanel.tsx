import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
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
import {
  originIdentity,
  recordMatchesRequestedIntent,
} from './contextual-help-selection';
import { projectRetainedClipView } from './explanation-clip-projection';
import { RetainedClipPlayer } from './RetainedClipPlayer';
import type { RetainedClipMediaAccess } from './retained-clip';
import { RetainedScene } from './RetainedScene';
import './explanations.css';

export interface ContextualSelection {
  kind: ContextualHelpIntent;
  origin: LearningOrigin;
  quote: string;
}

type PanelStatus = 'idle' | 'loading' | 'ready' | 'failed';

export function ContextualHelpPanel({
  projectId,
  projectGeneration,
  requestGeneration,
  bridge,
  selection,
  openExplanationId = null,
  active,
  onReturnToOrigin,
}: {
  readonly projectId: string;
  readonly projectGeneration: number;
  readonly requestGeneration: number;
  readonly bridge: ContextualHelpBridge;
  readonly selection: ContextualSelection | null;
  readonly openExplanationId?: string | null;
  readonly active: boolean;
  readonly onReturnToOrigin?: (origin: LearningOrigin) => void;
}): ReactElement {
  const questionId = useId();
  const originKey = originIdentity(projectId, selection?.origin ?? null);
  const sessionKey = `${originKey}|${projectGeneration}|${requestGeneration}`;
  const [draft, setDraft] = useState('');
  const [intentOverride, setIntentOverride] = useState<{
    originKey: string;
    intent: ContextualHelpIntent;
  } | null>(null);
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
  const lastSubmittedIntent = useRef<{
    originKey: string;
    intent: ContextualHelpIntent;
  } | null>(null);
  const cancelOwned = useRef(Promise.resolve());
  const quote = selection?.quote ?? '';
  const origin = selection?.origin ?? null;
  const activeIntent =
    intentOverride?.originKey === originKey
      ? intentOverride.intent
      : (selection?.kind ?? 'text');
  const status = request.identity === originKey ? request.status : 'idle';
  const message = request.identity === originKey ? request.message : null;
  const retryable = request.identity === originKey ? request.retryable : false;
  const retained =
    explanation &&
    origin &&
    (openExplanationId
      ? explanation.explanationId === openExplanationId
      : recordMatchesRequestedIntent(explanation, origin, activeIntent))
      ? explanation
      : null;
  const visibleScene =
    retained && scene?.explanationId === retained.explanationId ? scene : null;
  const clipView = retained ? projectRetainedClipView(retained) : null;
  const clipAccess = useMemo<RetainedClipMediaAccess>(
    () => ({
      open: async (mediaId) => {
        const opened = await bridge.openRetainedClipMedia({
          projectId,
          artifactId: mediaId,
        });
        if (opened.status === 'ready') {
          return { status: 'ready', objectUrl: opened.objectUrl };
        }
        return { status: opened.status };
      },
      revoke: (objectUrl) => {
        if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
      },
    }),
    [bridge, projectId],
  );

  useEffect(() => {
    return () => {
      const requestId = inFlight.current;
      if (!requestId) return;
      inFlight.current = null;
      if (lastSubmittedIntent.current?.originKey === originKey) {
        lastSubmittedIntent.current = null;
      }
      setIntentOverride((current) =>
        current?.originKey === originKey ? null : current,
      );
      setRequest((current) =>
        current.identity === originKey && current.status === 'loading'
          ? {
              identity: originKey,
              status: 'idle',
              message: null,
              retryable: false,
            }
          : current,
      );
      cancelOwned.current = Promise.resolve(
        bridge.cancelContextualHelp({
          requestId,
          expectedProjectGeneration: projectGeneration,
          expectedRequestGeneration: requestGeneration,
        }),
      ).then(
        () => undefined,
        () => undefined,
      );
    };
  }, [sessionKey, bridge, projectGeneration, requestGeneration, originKey]);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    void bridge
      .listRetainedExplanations({ projectId })
      .then(async (listed) => {
        if (cancelled || inFlight.current) return;
        const match = openExplanationId
          ? listed.find((item) => item.explanationId === openExplanationId)
          : listed.find((item) =>
              recordMatchesRequestedIntent(
                item,
                selection.origin,
                activeIntent,
              ),
            );
        if (!match) return;
        const loaded =
          openExplanationId && match.explanationId === openExplanationId
            ? await bridge.loadRetainedExplanation({
                projectId,
                explanationId: match.explanationId,
              })
            : match;
        if (!loaded || cancelled || inFlight.current) return;
        const sceneState =
          loaded.intent === 'visual'
            ? await bridge.loadExplanationSceneState({
                projectId,
                explanationId: loaded.explanationId,
              })
            : null;
        if (cancelled || inFlight.current) return;
        setIntentOverride({ originKey, intent: loaded.intent });
        setExplanation(loaded);
        setScene(sceneState);
        setRequest((current) =>
          current.identity === originKey &&
          (current.status === 'loading' || current.status === 'failed')
            ? current
            : {
                identity: originKey,
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
  }, [
    projectId,
    selection,
    bridge,
    originKey,
    activeIntent,
    openExplanationId,
  ]);

  async function submit(
    intent: ContextualHelpIntent,
    human: boolean,
  ): Promise<void> {
    if (!selection || !origin) return;
    await cancelOwned.current;
    lastSubmittedIntent.current = { originKey, intent };
    setIntentOverride({ originKey, intent });
    if (
      human &&
      (draft.trim().length < 1 || draft.length > CONTEXTUAL_HELP_QUESTION_LIMIT)
    ) {
      setRequest({
        identity: originKey,
        status: 'failed',
        message: 'Enter a question of at most 2,000 characters.',
        retryable: false,
      });
      return;
    }
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
        identity: originKey,
        status: 'failed',
        message: 'This selection has no retained highlight or saved question.',
        retryable: false,
      });
      return;
    }
    const requestId = crypto.randomUUID();
    inFlight.current = requestId;
    setRequest({
      identity: originKey,
      status: 'loading',
      message: null,
      retryable: false,
    });
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
          identity: originKey,
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
        inFlight.current = null;
        if (loaded) setIntentOverride({ originKey, intent: loaded.intent });
        setExplanation(loaded);
        setScene(sceneState);
        setRequest({
          identity: originKey,
          status: 'ready',
          message: null,
          retryable: false,
        });
        return;
      }
      if (decoded.value.outcome === 'cancelled') {
        if (inFlight.current !== requestId) return;
        inFlight.current = null;
        setRequest({
          identity: originKey,
          status: 'idle',
          message: 'Cancelled. Your selection and draft are unchanged.',
          retryable: true,
        });
        return;
      }
      if (inFlight.current !== requestId) return;
      inFlight.current = null;
      setRequest({
        identity: originKey,
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
          recordMatchesRequestedIntent(item, selection.origin, intent),
        );
        if (match) setExplanation(match);
      }
    } catch {
      if (inFlight.current !== requestId) return;
      inFlight.current = null;
      setRequest({
        identity: originKey,
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
              void submit(
                lastSubmittedIntent.current?.originKey === originKey
                  ? lastSubmittedIntent.current.intent
                  : activeIntent,
                draft.trim().length > 0,
              )
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
      {clipView && useful?.result?.kind === 'clip' && (
        <RetainedClipPlayer
          clip={clipView}
          status="ready"
          access={clipAccess}
        />
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
          onCaptureRequest={(captureRequest: SceneCaptureRequest) => {
            void bridge.acceptSceneCapture({
              projectId,
              request: captureRequest,
            });
          }}
        />
      )}
    </section>
  );
}
