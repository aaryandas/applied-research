import type { ReactElement } from 'react';
import type {
  EntryRevisionReference,
  LearningEntryRevision,
  LearningOrigin,
  LearningWorkspace,
} from '../../contracts/learning-records';

export function EntryOrigin({
  revision,
  workspace,
  onOpen,
  onRevealEntry,
}: Readonly<{
  revision: LearningEntryRevision;
  workspace: LearningWorkspace;
  onOpen: (origin: LearningOrigin) => void;
  onRevealEntry?: (reference: EntryRevisionReference) => void;
}>): ReactElement {
  const origin = revision.origin;
  const highlight = workspace.highlights.find(
    (item) => item.id === origin?.highlightId,
  );
  const parent = origin?.entry
    ? workspace.entries.find((item) => item.id === origin.entry?.entryId)
    : undefined;
  const parentRevision = parent?.revisions.find(
    (item) => item.revision === origin?.entry?.revision,
  );
  const hasSourceOrigin = Boolean(
    origin?.sourceRevisionId || origin?.highlightId || origin?.path,
  );
  return (
    <div>
      {highlight && (
        <blockquote>
          {highlight.quote}
          <cite>
            Quoted source · version {highlight.revisionId} · {highlight.start}–
            {highlight.end}
          </cite>
        </blockquote>
      )}
      {origin?.path && (
        <p className="reader-muted">
          Lesson {origin.path.lessonId ?? origin.path.topicId} · path revision{' '}
          {origin.path.pathRevision}
        </p>
      )}
      {origin?.entry &&
        (parentRevision && origin.entry ? (
          <button
            className="ui-button ui-button--text"
            onClick={() => onRevealEntry?.(origin.entry!)}
          >
            Open parent entry
          </button>
        ) : (
          <p className="ui-alert ui-alert--error" role="alert">
            The retained parent entry is unavailable.
          </p>
        ))}
      {hasSourceOrigin ? (
        <button
          className="ui-button ui-button--text"
          onClick={() => onOpen(origin!)}
        >
          Open origin
        </button>
      ) : origin?.entry ? null : (
        <p className="reader-muted">No source or lesson origin</p>
      )}
    </div>
  );
}

export function InsightSupports({
  revision,
  workspace,
  onOpen,
  onRevealEntry,
}: Readonly<{
  revision: LearningEntryRevision;
  workspace: LearningWorkspace;
  onOpen: (origin: LearningOrigin) => void;
  onRevealEntry?: (reference: EntryRevisionReference) => void;
}>): ReactElement {
  return (
    <div>
      {revision.supports.map((reference) => {
        const entry = workspace.entries.find(
          (item) => item.id === reference.entryId,
        );
        const support = entry?.revisions.find(
          (item) => item.revision === reference.revision,
        );
        return (
          <details key={reference.entryId}>
            <summary>
              Supporting {support?.kind ?? 'entry'} · revision{' '}
              {reference.revision}
            </summary>
            {support ? (
              <>
                <p
                  className={
                    support.authorKind === 'human' ? 'reader-human' : undefined
                  }
                >
                  {support.body}
                </p>
                <p className="reader-coordinate">
                  {support.authorKind} · {reference.entryId}
                </p>
                <EntryOrigin
                  revision={support}
                  workspace={workspace}
                  onOpen={onOpen}
                  onRevealEntry={onRevealEntry}
                />
              </>
            ) : (
              <p className="ui-alert ui-alert--error" role="alert">
                The retained supporting revision is unavailable.
              </p>
            )}
          </details>
        );
      })}
    </div>
  );
}
