import type { ReactElement } from 'react';
import type {
  LearningEntryRevision,
  LearningOrigin,
  LearningWorkspace,
} from '../../contracts/learning-records';

export function EntryOrigin({
  revision,
  workspace,
  onOpen,
}: {
  revision: LearningEntryRevision;
  workspace: LearningWorkspace;
  onOpen: (origin: LearningOrigin) => void;
}): ReactElement {
  const origin = revision.origin;
  const highlight = workspace.highlights.find(
    (item) => item.id === origin?.highlightId,
  );
  return (
    <div className="reader-origin">
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
      {origin ? (
        <button onClick={() => onOpen(origin)}>Open origin</button>
      ) : (
        <p className="reader-muted">No source or lesson origin</p>
      )}
    </div>
  );
}

export function InsightSupports({
  revision,
  workspace,
  onOpen,
}: {
  revision: LearningEntryRevision;
  workspace: LearningWorkspace;
  onOpen: (origin: LearningOrigin) => void;
}): ReactElement {
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
                />
              </>
            ) : (
              <p role="alert">
                The retained supporting revision is unavailable.
              </p>
            )}
          </details>
        );
      })}
    </div>
  );
}
