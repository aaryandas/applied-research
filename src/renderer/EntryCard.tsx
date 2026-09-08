import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Citation, Entry, EntryDraft } from '../contracts/workspace';
import { MatrixLab } from './MatrixLab';
import { Icon } from './FieldAtlas';

function CitedText({
  body,
  citations,
  onOpen,
}: {
  body: string;
  citations: Citation[];
  onOpen: (url: string) => void;
}): ReactElement {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const [index, citation] of [...citations]
    .sort((a, b) => a.start - b.start)
    .entries()) {
    if (citation.start < cursor || citation.end <= citation.start) continue;
    pieces.push(body.slice(cursor, citation.start));
    pieces.push(
      <a
        key={`${citation.url}-${index}`}
        href={citation.url}
        onClick={(event) => {
          event.preventDefault();
          onOpen(citation.url);
        }}
        title={citation.title}
      >
        {body.slice(citation.start, citation.end) || `[${index + 1}]`}
      </a>,
    );
    cursor = citation.end;
  }
  pieces.push(body.slice(cursor));
  return <div className="answer-text">{pieces}</div>;
}
interface CardProps {
  entry: Entry;
  projectId: string;
  onSave: (draft: EntryDraft) => Promise<void>;
  onMove: (id: string, x: number, y: number) => void;
  onOpen: (url: string) => void;
  onCapture: (body: string) => void;
}
export function EntryCard({
  entry,
  projectId,
  onSave,
  onMove,
  onOpen,
  onCapture,
}: CardProps): ReactElement {
  const [draft, setDraft] = useState({
    title: entry.title,
    body: entry.body,
    url: entry.url,
  });
  const [position, setPosition] = useState({ x: entry.x, y: entry.y });
  const [saveState, setSaveState] = useState('Saved');
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const editable = entry.kind !== 'assistant' && entry.kind !== 'experiment';
  useEffect(() => {
    if (
      !editable ||
      (draft.title === entry.title &&
        draft.body === entry.body &&
        draft.url === entry.url)
    )
      return;
    const timer = setTimeout(() => {
      void onSave({
        projectId,
        id: entry.id,
        kind: entry.kind as EntryDraft['kind'],
        ...draft,
      })
        .then(() => setSaveState('Saved'))
        .catch(() => setSaveState('Not saved — edit to retry'));
    }, 350);
    return () => clearTimeout(timer);
  }, [
    draft,
    editable,
    entry.title,
    entry.body,
    entry.url,
    entry.id,
    entry.kind,
    onSave,
    projectId,
  ]);
  const update = (field: 'title' | 'body' | 'url', value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveState('Saving…');
  };
  const label =
    entry.kind === 'assistant'
      ? 'AI · source-led guidance'
      : entry.kind === 'experiment'
        ? 'Interactive · linear algebra'
        : `You · ${entry.kind}`;
  return (
    <article
      className={`entry-card entry-${entry.kind}`}
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="card-handle"
        aria-label={`Move ${entry.title || entry.kind}`}
        title="Drag to move, or use arrow keys"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: position.x,
            top: position.y,
          };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setPosition({
              x: Math.max(
                0,
                drag.current.left + event.clientX - drag.current.x,
              ),
              y: Math.max(0, drag.current.top + event.clientY - drag.current.y),
            });
        }}
        onPointerUp={() => {
          if (drag.current) {
            drag.current = null;
            onMove(entry.id, position.x, position.y);
          }
        }}
        onKeyDown={(event) => {
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-24, 0],
            ArrowRight: [24, 0],
            ArrowUp: [0, -24],
            ArrowDown: [0, 24],
          };
          const delta = moves[event.key];
          if (delta) {
            event.preventDefault();
            const next = {
              x: Math.max(0, position.x + delta[0]),
              y: Math.max(0, position.y + delta[1]),
            };
            setPosition(next);
            onMove(entry.id, next.x, next.y);
          }
        }}
      >
        <span className="entry-label">{label}</span>
        <Icon name="grip" />
      </button>
      {editable ? (
        <>
          <div className="human-entry">
            <input
              className="note-title"
              aria-label={`${entry.kind} title`}
              placeholder="Untitled note"
              value={draft.title}
              maxLength={200}
              onChange={(event) => update('title', event.target.value)}
            />
            {entry.kind === 'source' && (
              <input
                className="source-url"
                aria-label="Source URL"
                placeholder="https://…"
                value={draft.url}
                onChange={(event) => update('url', event.target.value)}
              />
            )}
            <textarea
              className="note-body"
              aria-label={`${entry.kind} text`}
              placeholder={
                entry.kind === 'result'
                  ? 'What did you try? What happened? What surprised you?'
                  : 'A question, a prediction, a connection…'
              }
              value={draft.body}
              maxLength={20000}
              onChange={(event) => update('body', event.target.value)}
            />
          </div>
          <footer>
            <span className={saveState.startsWith('Not') ? 'error' : ''}>
              {saveState}
            </span>
            {draft.url && (
              <button className="text-button" onClick={() => onOpen(draft.url)}>
                Open source <Icon name="arrow" />
              </button>
            )}
          </footer>
        </>
      ) : (
        <>
          <h2>{entry.title}</h2>
          {entry.kind === 'experiment' ? (
            <MatrixLab onCapture={onCapture} />
          ) : (
            <>
              <CitedText
                body={entry.body}
                citations={entry.citations}
                onOpen={onOpen}
              />
              {entry.citations.length > 0 && (
                <div className="citations" aria-label="Sources">
                  {[
                    ...new Map(
                      entry.citations.map((citation) => [
                        citation.url,
                        citation,
                      ]),
                    ).values(),
                  ].map((citation, index) => (
                    <button
                      key={citation.url}
                      onClick={() => onOpen(citation.url)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {citation.title}
                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
              )}
              <footer>
                <span>AI contribution · review with its sources</span>
              </footer>
            </>
          )}
        </>
      )}
    </article>
  );
}
