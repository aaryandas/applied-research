import { useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CanvasContent, CanvasNode } from './graph';
import { CanvasActions } from './actions';
import { CanvasGlyph } from './CanvasGlyph';

function Content({ content }: { content: CanvasContent }): React.JSX.Element {
  const actions = useContext(CanvasActions);
  return (
    <>
      <span className="workspace-canvas-kind">
        <CanvasGlyph kind={content.kind} />
        {content.label}
        {content.entry ? ` · r${content.entry.revision}` : ''}
      </span>
      {content.title && (
        <p className="workspace-canvas-title">{content.title}</p>
      )}
      {content.body && <p className="workspace-canvas-body">{content.body}</p>}
      {content.diagnostics.map((diagnostic) => (
        <p className="workspace-canvas-diagnostic" key={diagnostic}>
          {diagnostic}
        </p>
      ))}
      {content.origin && content.diagnostics.length === 0 && (
        <button
          className="nodrag nopan workspace-canvas-origin"
          onClick={() => content.origin && actions.onOpenOrigin(content.origin)}
        >
          Open{' '}
          {content.origin.highlightId
            ? 'exact highlight'
            : content.origin.sourceRevisionId
              ? 'source revision'
              : 'learning origin'}
          {content.originLabel && (
            <span className="workspace-canvas-locator">
              {content.originLabel}
            </span>
          )}
        </button>
      )}
      {content.supports.map((support) => (
        <div
          className={`workspace-canvas-support workspace-canvas-${support.kind}`}
          key={`${support.identity}:${support.entry?.revision}`}
          tabIndex={0}
          role="group"
          aria-label={`${support.label}, revision ${support.entry?.revision}`}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (
              event.target instanceof HTMLElement &&
              event.target.closest('button')
            )
              return;
            if (support.editable && support.entry)
              actions.onEditEntry(support.entry);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'F2') return;
            event.stopPropagation();
            if (support.editable && support.entry) {
              event.preventDefault();
              actions.onEditEntry(support.entry);
            }
          }}
        >
          <Content content={support} />
        </div>
      ))}
    </>
  );
}

export function LearningNode({
  data,
  selected,
}: NodeProps<CanvasNode>): React.JSX.Element {
  const actions = useContext(CanvasActions);
  const content = data.content;
  return (
    <article
      className={`workspace-canvas-node workspace-canvas-${content.kind}`}
      data-selected={selected}
      data-author={content.authorKind}
      data-record-id={content.identity}
      onDoubleClick={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('button')
        )
          return;
        if (content.editable && content.entry)
          actions.onEditEntry(content.entry);
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Content content={content} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </article>
  );
}
