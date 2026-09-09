import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type {
  EntryRevisionReference,
  LearningWorkspace,
} from '../../contracts/learning-records';
import {
  currentHumanSupports,
  describeOrigin,
  distinctSupportIds,
  supportReference,
} from './authoring';
import type { AuthoringSession } from './authoring-session';

function InsightSupports({
  session,
  workspace,
  supports,
  saving,
}: Readonly<{
  session: AuthoringSession;
  workspace: LearningWorkspace;
  supports: readonly EntryRevisionReference[];
  saving: boolean;
}>): ReactElement {
  const available = currentHumanSupports(workspace).filter(
    (entry) => !supports.some((support) => support.entryId === entry.id),
  );
  return (
    <>
      {supports.map((ref) => {
        const entry = workspace.entries.find((item) => item.id === ref.entryId);
        const revision = entry?.revisions.find(
          (item) => item.revision === ref.revision,
        );
        return (
          <blockquote key={`${ref.entryId}:${ref.revision}`}>
            {revision?.body ?? 'Supporting revision unavailable'}
            <cite>
              Human {revision?.kind ?? 'entry'} · revision {ref.revision}
            </cite>
            {distinctSupportIds(supports) > 2 && (
              <button
                type="button"
                className="ui-button ui-button--text"
                onClick={() =>
                  session.setSupports(
                    supports.filter(
                      (item) =>
                        !(
                          item.entryId === ref.entryId &&
                          item.revision === ref.revision
                        ),
                    ),
                  )
                }
              >
                Remove support
              </button>
            )}
          </blockquote>
        );
      })}
      {available.length > 0 && (
        <label className="ui-field">
          <span className="ui-field__label">Add a saved note or question</span>
          <select
            className="ui-input"
            aria-label="Add a saved note or question"
            value=""
            disabled={saving}
            onChange={(event) => {
              const entry = available.find(
                (item) => item.id === event.target.value,
              );
              if (entry)
                session.setSupports([...supports, supportReference(entry)]);
            }}
          >
            <option value="">Choose a support</option>
            {available.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.current.kind}:{' '}
                {entry.current.title || entry.current.body}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

export function CanvasComposer({
  session,
  workspace,
  onFlush,
}: Readonly<{
  session: AuthoringSession;
  workspace: LearningWorkspace;
  onFlush?: () => Promise<boolean>;
}>): ReactElement | null {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const body = useRef<HTMLTextAreaElement>(null);
  const draft = state.draft;
  useEffect(() => {
    if (draft) body.current?.focus();
  }, [draft]);
  if (!draft) return null;
  const highlight = workspace.highlights.find(
    (item) => item.id === draft.input.origin?.highlightId,
  );
  return (
    <section
      className="workspace-canvas-composer"
      aria-label={`Your ${draft.kind}`}
    >
      <h2>
        {draft.mode === 'relink'
          ? 'Change learning origin'
          : `Your ${draft.kind}`}
      </h2>
      {highlight && (
        <blockquote>
          {highlight.quote}
          <cite>
            Source version {highlight.revisionId} · {highlight.start}–
            {highlight.end}
          </cite>
        </blockquote>
      )}
      <p className="workspace-canvas-composer-origin">
        {describeOrigin(draft.input.origin, workspace)}
      </p>
      {draft.kind === 'insight' && (
        <InsightSupports
          session={session}
          workspace={workspace}
          supports={draft.supports}
          saving={state.saving}
        />
      )}
      <label className="ui-field">
        <span className="ui-field__label">Title</span>
        <input
          className="ui-input"
          value={draft.input.title}
          readOnly={state.saving || draft.mode === 'relink'}
          aria-busy={state.saving}
          onChange={(event) =>
            session.edit({ title: event.target.value, body: draft.input.body })
          }
        />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">In your own words</span>
        <textarea
          className="ui-textarea ui-textarea--reading"
          ref={body}
          value={draft.input.body}
          readOnly={state.saving || draft.mode === 'relink'}
          aria-busy={state.saving}
          onChange={(event) =>
            session.edit({ title: draft.input.title, body: event.target.value })
          }
        />
      </label>
      {state.error && (
        <p role="alert" className="ui-alert ui-alert--error">
          {state.error}
        </p>
      )}
      {state.conflict && (
        <div>
          <p>
            Saved revision {state.conflict.currentRevision}:{' '}
            {workspace.entries.find(
              (entry) => entry.id === state.conflict?.recordId,
            )?.current.body ?? 'Saved text could not be loaded.'}
          </p>
          {state.conflictLoaded ? (
            <button
              type="button"
              className="ui-button"
              onClick={() => void session.retryWithCurrentRevision()}
            >
              Retry my draft against revision {state.conflict.currentRevision}
            </button>
          ) : (
            <button
              type="button"
              className="ui-button"
              onClick={() => void session.reloadConflict()}
            >
              Reload saved records
            </button>
          )}
        </div>
      )}
      <div className="ui-action-row">
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={Boolean(state.conflict)}
          aria-disabled={state.saving}
          onClick={() => {
            if (!state.saving) void (onFlush ?? session.flush)();
          }}
        >
          {state.saving
            ? 'Saving…'
            : draft.mode === 'relink'
              ? 'Save origin change'
              : `Save ${draft.kind}`}
        </button>
        <button
          type="button"
          className="ui-button ui-button--text"
          aria-disabled={state.saving}
          onClick={() => session.discard()}
        >
          Discard draft
        </button>
      </div>
    </section>
  );
}
