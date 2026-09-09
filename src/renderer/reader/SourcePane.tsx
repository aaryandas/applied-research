import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type {
  SourceRecord,
  SourceVersion,
} from '../../contracts/learning-records';
import { readSelection, type TextSpan } from './reading-location';
import {
  positionSelectionActions,
  selectionFocusPoint,
  type SelectionPoint,
} from './selection-position';

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
  onExplainText?: () => void;
  onExplainVisual?: () => void;
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
  onExplainText,
  onExplainVisual,
}: Readonly<SourcePaneProps>): ReactElement {
  const prose = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<SelectionPoint | null>(null);
  const [position, setPosition] = useState<
    { left: number; top: number } | undefined
  >();
  useEffect(() => {
    const capture = (event?: PointerEvent): void => {
      if (
        event?.target instanceof Node &&
        actions.current?.contains(event.target)
      )
        return;
      const selection = document.getSelection();
      const next = prose.current
        ? readSelection(prose.current, version.canonicalText, selection)
        : null;
      onSelection(next);
      setAnchor(
        next && selection
          ? event
            ? { x: event.clientX, y: event.clientY }
            : selectionFocusPoint(selection)
          : null,
      );
    };
    const selectionChanged = (): void => capture();
    document.addEventListener('selectionchange', selectionChanged);
    document.addEventListener('pointerup', capture);
    window.addEventListener('scroll', selectionChanged, true);
    window.addEventListener('resize', selectionChanged);
    return () => {
      document.removeEventListener('selectionchange', selectionChanged);
      document.removeEventListener('pointerup', capture);
      window.removeEventListener('scroll', selectionChanged, true);
      window.removeEventListener('resize', selectionChanged);
    };
  }, [version.canonicalText, onSelection]);
  useLayoutEffect(() => {
    if (!anchor || !span || !actions.current) return;
    setPosition(
      positionSelectionActions({
        anchor,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        toolbar: actions.current.getBoundingClientRect(),
      }),
    );
  }, [anchor, span, busy, onExplainText, onExplainVisual]);
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
      <div className="ui-action-row reader-source-meta">
        <label className="ui-field">
          <span className="ui-field__label">Source version</span>
          <select
            className="ui-input"
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
          className="ui-button ui-button--small"
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
      <div
        ref={actions}
        role="group"
        aria-label={span ? 'Selected passage actions' : 'Reading actions'}
        className={`ui-action-row reader-selection-actions${span && anchor ? ' reader-selection-actions--floating' : ''}`}
        style={span && anchor ? position : undefined}
        onPointerDown={(event) => event.preventDefault()}
      >
        {onExplainText && (
          <button
            className="ui-button"
            disabled={!span || busy}
            onClick={onExplainText}
          >
            Ask about this
          </button>
        )}
        {onExplainVisual && (
          <button
            className="ui-button"
            disabled={!span || busy}
            onClick={onExplainVisual}
          >
            Visual explanation
          </button>
        )}
        <button className="ui-button" disabled={!span || busy} onClick={onNote}>
          {busy ? 'Retaining selection…' : 'Note'}
        </button>
        <button className="ui-button" disabled={busy} onClick={onQuestion}>
          Save a question
        </button>
      </div>
    </>
  );
}
