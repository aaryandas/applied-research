import type { ReactElement } from 'react';
import type {
  SourceCitation,
  SourceRecord,
} from '../../contracts/learning-records';
import { citedSourceVersion } from './generated-citations';

export function GeneratedCitations({
  citations,
  sources,
  onOpen,
}: Readonly<{
  citations: readonly SourceCitation[];
  sources: readonly SourceRecord[];
  onOpen: (citation: SourceCitation) => void;
}>): ReactElement | null {
  if (citations.length === 0) return null;
  return (
    <aside
      className="reader-generated-citations"
      aria-label="Generated lesson citations"
    >
      <p className="reader-muted">
        AI-generated lesson. Cited evidence is the retained original revision
        and span, not this teaching text or a later current source.
      </p>
      <ul className="reader-generated-citations__list">
        {citations.map((citation) => {
          const cited = citedSourceVersion(sources, citation);
          const key = `${citation.sourceId}:${citation.revisionId}:${citation.start}:${citation.end}`;
          if (!cited) {
            return (
              <li key={key}>
                <p className="ui-alert ui-alert--error" role="alert">
                  The retained cited revision is unavailable.
                </p>
              </li>
            );
          }
          const current = sources.find(
            (source) => source.id === cited.sourceId,
          );
          const retained =
            current?.currentVersionId !== cited.revisionId
              ? `retained revision ${cited.revision}`
              : `revision ${cited.revision}`;
          return (
            <li key={key}>
              <button
                type="button"
                className="ui-button ui-button--text"
                onClick={() => onOpen(citation)}
              >
                {citation.quote} · {cited.title} · {retained}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
