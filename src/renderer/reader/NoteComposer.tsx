import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type {
  LearningOrigin,
  LearningWorkspace,
} from '../../contracts/learning-records';
import { DraftSession } from './draft-session';

export function NoteComposer({
  session,
  workspace,
}: Readonly<{
  session: DraftSession;
  workspace: LearningWorkspace;
}>): ReactElement | null {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const body = useRef<HTMLTextAreaElement>(null);
  const draft = state.draft;
  const hasDraft = draft !== null;
  const status = useRef<HTMLOutputElement>(null);
  const hadDraft = useRef(false);
  useEffect(() => {
    if (hasDraft) body.current?.focus();
    else if (hadDraft.current) status.current?.focus({ preventScroll: true });
    hadDraft.current = hasDraft;
  }, [hasDraft]);
  const highlight =
    draft?.highlight ??
    workspace.highlights.find(
      (item) => item.id === draft?.input.origin?.highlightId,
    );
  return (
    <div>
      <output
        ref={status}
        tabIndex={-1}
        className="reader-status reader-save-status"
      >
        {state.notice}
      </output>
      {!draft && state.error && (
        <p role="alert">
          {state.error}
          <button onClick={() => void session.reloadConflict()}>
            Reload saved records
          </button>
        </p>
      )}
      {draft && (
        <section className="reader-composer" aria-label={`Your ${draft.kind}`}>
          <h2>Your {draft.kind}</h2>
          {highlight && (
            <blockquote>
              {highlight.quote}
              <cite>
                Source version {highlight.revisionId} · {highlight.start}–
                {highlight.end}
              </cite>
            </blockquote>
          )}
          <p className="reader-muted">{originLabel(draft.input.origin)}</p>
          {draft.supports.map((ref) => {
            const entry = workspace.entries.find(
              (item) => item.id === ref.entryId,
            );
            const revision = entry?.revisions.find(
              (item) => item.revision === ref.revision,
            );
            return (
              <blockquote key={ref.entryId}>
                {revision?.body ?? 'Supporting revision unavailable'}
                <cite>
                  Human {revision?.kind} · revision {ref.revision}
                </cite>
              </blockquote>
            );
          })}
          <label>
            <span>Title</span>
            <input
              value={draft.input.title}
              readOnly={state.saving}
              aria-busy={state.saving}
              onChange={(event) =>
                session.edit({
                  title: event.target.value,
                  body: draft.input.body,
                })
              }
            />
          </label>
          <label>
            <span>In your own words</span>
            <textarea
              ref={body}
              value={draft.input.body}
              readOnly={state.saving}
              aria-busy={state.saving}
              onChange={(event) =>
                session.edit({
                  title: draft.input.title,
                  body: event.target.value,
                })
              }
            />
          </label>
          {state.error && <p role="alert">{state.error}</p>}
          {state.conflict && (
            <div>
              <p>
                Saved revision {state.conflict.currentRevision}:{' '}
                {workspace.entries.find(
                  (entry) => entry.id === state.conflict?.recordId,
                )?.current.body ?? 'Saved text could not be loaded.'}
              </p>
              {state.conflictLoaded ? (
                <button onClick={() => void session.retryWithCurrentRevision()}>
                  Retry my draft against revision{' '}
                  {state.conflict.currentRevision}
                </button>
              ) : (
                <button onClick={() => void session.reloadConflict()}>
                  Reload saved records
                </button>
              )}
            </div>
          )}
          <div className="reader-actions">
            <button
              disabled={Boolean(state.conflict)}
              aria-disabled={state.saving}
              onClick={() => {
                if (!state.saving) void session.flush();
              }}
            >
              {state.saving ? 'Saving…' : `Save ${draft.kind}`}
            </button>
            <button
              aria-disabled={state.saving}
              onClick={() => session.discard()}
            >
              Discard draft
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function originLabel(origin: LearningOrigin | null): string {
  if (origin?.path)
    return `From lesson ${origin.path.lessonId ?? origin.path.topicId}, path revision ${origin.path.pathRevision}`;
  if (origin?.sourceRevisionId)
    return `Source version ${origin.sourceRevisionId}`;
  return 'No source or lesson origin';
}
