import { useEffect, useRef, type ReactElement } from 'react';
import type {
  SourceRecord,
  SourceVersion,
} from '../../contracts/learning-records';
import { readSelection, type TextSpan } from './reading-location';

interface SourcePaneProps {
  version: SourceVersion;
  source: SourceRecord | undefined;
  span: TextSpan | null;
  reveal: { span: TextSpan | null } | null;
  busy: boolean;
  onSelection: (span: TextSpan | null) => void;
  onVersion: (version: SourceVersion) => void;
  onUpdate: (source: SourceRecord) => void;
  onNote: () => void;
  onQuestion: () => void;
}

export function SourcePane({
  version,
  source,
  span,
  reveal,
  busy,
  onSelection,
  onVersion,
  onUpdate,
  onNote,
  onQuestion,
}: Readonly<SourcePaneProps>): ReactElement {
  const prose = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const capture = () =>
      onSelection(
        prose.current
          ? readSelection(
              prose.current,
              version.canonicalText,
              document.getSelection(),
            )
          : null,
      );
    document.addEventListener('selectionchange', capture);
    return () => document.removeEventListener('selectionchange', capture);
  }, [version.canonicalText, onSelection]);
  useEffect(() => {
    if (!reveal) return;
    prose.current?.focus({ preventScroll: true });
    (prose.current?.querySelector('mark') ?? prose.current)?.scrollIntoView?.({
      block: 'center',
    });
  }, [reveal]);
  const marked = reveal?.span;
  return (
    <>
      <h2>{version.title}</h2>
      <div className="reader-actions reader-source-meta">
        <label>
          <span>Source version</span>
          <select
            value={version.revisionId}
            onChange={(event) => {
              const next = source?.versions.find(
                (item) => item.revisionId === event.target.value,
              );
              if (next) onVersion(next);
            }}
          >
            {source?.versions.map((item) => (
              <option key={item.revisionId} value={item.revisionId}>
                Revision {item.revision}
                {source.currentVersionId === item.revisionId
                  ? ' · current'
                  : ' · retained'}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!source}
          onClick={() => {
            if (source) onUpdate(source);
          }}
        >
          Update source
        </button>
      </div>
      {version.provenance.locator && (
        <p className="reader-muted">{version.provenance.locator}</p>
      )}
      <div
        ref={prose}
        className="reader-prose"
        tabIndex={0}
        aria-label="Source text"
      >
        {marked ? (
          <>
            {version.canonicalText.slice(0, marked.start)}
            <mark>{version.canonicalText.slice(marked.start, marked.end)}</mark>
            {version.canonicalText.slice(marked.end)}
          </>
        ) : (
          version.canonicalText
        )}
      </div>
      <div className="reader-actions reader-selection-actions">
        <button disabled={!span || busy} onClick={onNote}>
          {busy ? 'Retaining selection…' : 'Note'}
        </button>
        <button disabled={busy} onClick={onQuestion}>
          Save a question
        </button>
      </div>
    </>
  );
}
