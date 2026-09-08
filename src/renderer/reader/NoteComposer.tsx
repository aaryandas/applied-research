import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type { LearningWorkspace } from '../../contracts/learning-records';
import { DraftSession } from './draft-session';

export function NoteComposer({
  session,
  workspace,
}: {
  session: DraftSession;
  workspace: LearningWorkspace;
}): ReactElement | null {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const body = useRef<HTMLTextAreaElement>(null);
  const draft = state.draft;
  const hasDraft = draft !== null;
  useEffect(() => {
    if (hasDraft) body.current?.focus();
  }, [hasDraft]);
  if (!draft)
    return (
      <div>
        <p role="status">
          {state.acknowledgement
            ? `Saved revision ${state.acknowledgement.revision} · ${state.acknowledgement.revisionId ?? state.acknowledgement.recordId}`
            : null}
        </p>
        {state.error && (
          <p role="alert">
            {state.error}
            <button onClick={() => void session.reloadConflict()}>
              Reload saved records
            </button>
          </p>
        )}
      </div>
    );
  const highlight = workspace.highlights.find(
    (item) => item.id === draft.input.origin?.highlightId,
  );
  return (
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
      <p className="reader-muted">
        {draft.input.origin?.path
          ? `From lesson ${draft.input.origin.path.lessonId ?? draft.input.origin.path.topicId}, path revision ${draft.input.origin.path.pathRevision}`
          : draft.input.origin?.sourceRevisionId
            ? `Source version ${draft.input.origin.sourceRevisionId}`
            : 'No source or lesson origin'}
      </p>
      {draft.supports.map((ref) => {
        const entry = workspace.entries.find((item) => item.id === ref.entryId);
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
        Title
        <input
          value={draft.input.title}
          disabled={state.saving}
          onChange={(event) =>
            session.edit({ title: event.target.value, body: draft.input.body })
          }
        />
      </label>
      <label>
        In your own words
        <textarea
          ref={body}
          value={draft.input.body}
          disabled={state.saving}
          onChange={(event) =>
            session.edit({ title: draft.input.title, body: event.target.value })
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
              Retry my draft against revision {state.conflict.currentRevision}
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
          disabled={state.saving || Boolean(state.conflict)}
          onClick={() => void session.flush()}
        >
          {state.saving ? 'Saving…' : `Save ${draft.kind}`}
        </button>
        <button disabled={state.saving} onClick={() => session.discard()}>
          Discard draft
        </button>
      </div>
    </section>
  );
}
