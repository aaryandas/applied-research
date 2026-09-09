import { useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  contentAccessibleName,
  type CanvasContent,
  type CanvasNode,
} from './graph';
import { CanvasActions } from './actions';
import { CanvasGlyph } from './CanvasGlyph';

function originAction(content: CanvasContent): string {
  if (content.kind === 'topic' || content.kind === 'lesson')
    return 'Open in Reader';
  if (content.origin?.highlightId) return 'Open exact highlight';
  if (content.origin?.sourceRevisionId) return 'Open source revision';
  return 'Open learning origin';
}

interface ContentProps {
  readonly content: CanvasContent;
  readonly nested?: boolean;
}

function Writing({
  content,
}: Readonly<{ content: CanvasContent }>): React.JSX.Element {
  return (
    <>
      <span className="workspace-canvas-kind">
        <CanvasGlyph kind={content.kind} />
        {content.label}
        {content.entry ? ` · r${content.entry.revision}` : ''}
      </span>
      {content.title && (
        <span className="workspace-canvas-title">{content.title}</span>
      )}
      {content.body && (
        <span className="workspace-canvas-body">{content.body}</span>
      )}
    </>
  );
}
function Content({ content, nested = false }: ContentProps): React.JSX.Element {
  const actions = useContext(CanvasActions);
  const originDescription = content.originLabel
    ? `: ${content.originLabel}`
    : '';
  const edit = () => {
    if (content.entry) actions.onEditEntry(content.entry);
  };
  return (
    <>
      {nested && content.editable ? (
        <button
          className="nodrag nopan workspace-canvas-edit"
          aria-label={`Edit ${contentAccessibleName(content)}`}
          onClick={edit}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault();
              event.stopPropagation();
              edit();
            }
          }}
        >
          <Writing content={content} />
        </button>
      ) : (
        <Writing content={content} />
      )}
      {content.diagnostics.map((diagnostic) => (
        <p className="workspace-canvas-diagnostic" key={diagnostic}>
          {diagnostic}
        </p>
      ))}
      {content.origin && content.diagnostics.length === 0 && (
        <button
          className="nodrag nopan workspace-canvas-origin"
          aria-label={`${originAction(content)}${originDescription}`}
          aria-description={content.originDetail}
          title={content.originDetail}
          onClick={() => {
            if (!content.origin) return;
            if (content.retainedExplanation && actions.onOpenRetainedExplanation) {
              actions.onOpenRetainedExplanation({
                ...content.retainedExplanation,
                origin: content.origin,
              });
              return;
            }
            actions.onOpenOrigin(content.origin);
          }}
        >
          {content.originLabel || originAction(content)}
        </button>
      )}
      {content.supports.map((support) => (
        <fieldset
          className={`workspace-canvas-support workspace-canvas-${support.kind}`}
          key={`${support.identity}:${support.entry?.revision}`}
          aria-label={contentAccessibleName(support)}
        >
          <Content content={support} nested />
        </fieldset>
      ))}
    </>
  );
}

export function LearningNode({
  data,
  selected,
}: Readonly<NodeProps<CanvasNode>>): React.JSX.Element {
  const content = data.content;
  return (
    <article
      className={`workspace-canvas-node workspace-canvas-${content.kind}`}
      data-selected={selected}
      data-author={content.authorKind}
      data-record-id={content.identity}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Content content={content} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </article>
  );
}
