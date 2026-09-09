import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import type { useReactFlow } from '@xyflow/react';
import type {
  EntryRevisionReference,
  LearningEntryRecord,
  LearningOrigin,
  LearningWorkspace,
} from '../../contracts/learning-records';
import {
  canvasEditKind,
  currentHumanSupports,
  defaultInsightSupports,
  insightNoticeIfUneditable,
  isHumanNoteOrQuestion,
  pathOriginChoices,
  relinkDraftInput,
  supportReference,
  type HumanWritingKind,
} from './authoring';
import { canvasMenuModel, parseCanvasMenuAction } from './authoring-menu';
import { AuthoringSession } from './authoring-session';
import { CanvasComposer } from './CanvasComposer';
import { CanvasMenu, type CanvasMenuItem } from './CanvasMenu';
import type { CanvasContent, CanvasNode } from './graph';
import type { PlacementSession } from './placement-session';
import type { CanvasRecordsWriter } from './types';
import type { CanvasView } from '../../contracts/learning-records';

interface AuthoringHookOptions {
  workspace: LearningWorkspace;
  view: CanvasView;
  records?: CanvasRecordsWriter | undefined;
  onWorkspace?: ((workspace: LearningWorkspace) => void) | undefined;
  onEditEntry: (entry: EntryRevisionReference) => void;
  flow: ReturnType<typeof useReactFlow<CanvasNode>>;
  placement: PlacementSession;
  setNotice: (notice: string) => void;
  selectedIds: readonly string[];
}

function paneCenter(flow: ReturnType<typeof useReactFlow<CanvasNode>>): {
  client: { x: number; y: number };
  flow: { x: number; y: number };
} {
  const pane =
    document.querySelector<HTMLElement>('.workspace-canvas .react-flow') ??
    document.querySelector<HTMLElement>('.react-flow');
  const rect = pane?.getBoundingClientRect();
  const client = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { client, flow: flow.screenToFlowPosition(client) };
}

export function useCanvasAuthoring({
  workspace,
  view,
  records,
  onWorkspace,
  onEditEntry,
  flow,
  placement,
  setNotice,
  selectedIds,
}: AuthoringHookOptions): {
  enabled: boolean;
  flush: () => Promise<boolean>;
  requestEdit: (content: CanvasContent) => void;
  editReference: (entry: EntryRevisionReference) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
  onNodeContextMenu: (
    event: MouseEvent | React.MouseEvent,
    node: CanvasNode,
  ) => void;
  dismissMenu: () => void;
  handleAuthoringKeyDown: (event: React.KeyboardEvent) => boolean;
  toolbar: ReactElement | null;
  overlays: ReactElement | null;
  initialPlacement: ReadonlyMap<string, HumanWritingKind>;
  blockedNotice: string;
} {
  const enabled = Boolean(records && onWorkspace);
  const [session] = useState(
    () =>
      new AuthoringSession({
        projectId: workspace.project.id,
        records: records ?? null,
        onWorkspace: onWorkspace ?? null,
      }),
  );
  const authoring = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: CanvasMenuItem[];
    origin: LearningOrigin | null;
    flow: { x: number; y: number };
  } | null>(null);
  const [initialPlacement, setInitialPlacement] = useState(
    () => new Map<string, HumanWritingKind>(),
  );
  useEffect(() => {
    session.setRecords(records ?? null);
    session.setWorkspaceHandler(onWorkspace ?? null);
  }, [session, records, onWorkspace]);

  const selected = selectedIds
    .map((id) => workspace.entries.find((entry) => entry.id === id))
    .filter((entry): entry is LearningEntryRecord =>
      Boolean(entry && isHumanNoteOrQuestion(entry)),
    );

  const placeCommitted = useCallback((): void => {
    const pending = session.takePendingPlacement();
    if (!pending) return;
    setInitialPlacement((current) =>
      new Map(current).set(pending.recordId, pending.kind),
    );
    placement.move({
      nodeId: pending.recordId,
      input: {
        projectId: workspace.project.id,
        recordId: pending.recordId,
        view,
        x: pending.x,
        y: pending.y,
      },
      savedPosition: { x: pending.x, y: pending.y },
    });
  }, [placement, session, view, workspace.project.id]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!(await session.flush())) return false;
    placeCommitted();
    return placement.flush();
  }, [placement, placeCommitted, session]);

  const openComposer = useCallback(
    (
      kind: HumanWritingKind,
      origin: LearningOrigin | null,
      point: {
        x: number;
        y: number;
      } | null,
      supports = selected,
    ) => {
      if (!enabled) return;
      void session.flush().then((ready) => {
        if (!ready || session.getSnapshot().draft) return;
        try {
          session.begin({
            kind,
            input: {
              projectId: workspace.project.id,
              expectedRevision: 0,
              title: '',
              body: '',
              origin,
            },
            placement: point,
            ...(kind === 'insight'
              ? { supports: supports.map(supportReference) }
              : {}),
          });
          setMenu(null);
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : 'Could not start Canvas writing.',
          );
        }
      });
    },
    [enabled, selected, session, setNotice, workspace.project.id],
  );

  const beginEdit = useCallback(
    (entry: LearningEntryRecord) => {
      if (!enabled) {
        onEditEntry({ entryId: entry.id, revision: entry.currentRevision });
        return;
      }
      const kind = entry.current.kind;
      if (kind !== 'note' && kind !== 'question' && kind !== 'insight') return;
      void session.flush().then((ready) => {
        if (!ready || session.getSnapshot().draft) return;
        try {
          session.begin({
            kind,
            input: {
              projectId: workspace.project.id,
              entryId: entry.id,
              expectedRevision: entry.currentRevision,
              title: entry.current.title,
              body: entry.current.body,
              origin: entry.current.origin,
            },
            supports: entry.current.supports,
          });
          setMenu(null);
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : 'Could not start Canvas writing.',
          );
        }
      });
    },
    [enabled, onEditEntry, session, setNotice, workspace.project.id],
  );

  const requestEdit = useCallback(
    (content: CanvasContent) => {
      const kind = canvasEditKind(content, enabled);
      if (!kind || !content.entry) {
        const notice = insightNoticeIfUneditable(content, enabled);
        if (notice) setNotice(notice);
        else if (
          content.entry &&
          (content.kind === 'note' || content.kind === 'question') &&
          content.editable
        )
          onEditEntry(content.entry);
        return;
      }
      const entry = workspace.entries.find(
        (item) => item.id === content.entry?.entryId,
      );
      if (!entry || entry.currentRevision !== content.entry.revision) {
        setNotice(
          entry
            ? `This link refers to revision ${content.entry.revision}; the entry is now revision ${entry.currentRevision}.`
            : 'The referenced entry is unavailable.',
        );
        return;
      }
      beginEdit(entry);
    },
    [beginEdit, enabled, onEditEntry, setNotice, workspace.entries],
  );

  const editReference = useCallback(
    (entry: EntryRevisionReference) => {
      const record = workspace.entries.find(
        (item) => item.id === entry.entryId,
      );
      if (!record) {
        setNotice('The referenced entry is unavailable.');
        return;
      }
      requestEdit({
        identity: record.id,
        authorKind: record.current.authorKind,
        kind: record.current.kind,
        label: '',
        title: record.current.title,
        body: record.current.body,
        origin: record.current.origin,
        entry,
        editable: record.current.authorKind === 'human',
        diagnostics: [],
        supports: [],
      });
    },
    [requestEdit, setNotice, workspace.entries],
  );

  const openMenuAt = useCallback(
    (event: MouseEvent | React.MouseEvent, content: CanvasContent | null) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
      const model = canvasMenuModel(content, workspace, selected);
      if (model.items.length === 0) return;
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: model.items,
        origin: model.createOrigin,
        flow: flow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
      });
    },
    [enabled, flow, selected, workspace],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          'button,input,textarea,select,a,[contenteditable="true"],.workspace-canvas-composer,.workspace-canvas-menu',
        )
      )
        return;
      openMenuAt(event, null);
    },
    [openMenuAt],
  );

  const onNodeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, node: CanvasNode) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      openMenuAt(event, node.data.content);
    },
    [openMenuAt],
  );

  const dismissMenu = useCallback(() => setMenu(null), []);

  const beginRelink = useCallback(
    (entry: LearningEntryRecord, path: NonNullable<LearningOrigin['path']>) => {
      void session.flush().then((ready) => {
        if (!ready) return;
        session.begin(relinkDraftInput(workspace.project.id, entry, path));
        setMenu(null);
      });
    },
    [session, workspace.project.id],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (!menu) return;
      const action = parseCanvasMenuAction(id);
      if (!action) {
        setMenu(null);
        return;
      }
      if (action.type === 'create') {
        openComposer(action.kind, menu.origin, menu.flow);
        return;
      }
      if (action.type === 'insight') {
        openComposer(
          'insight',
          null,
          menu.flow,
          defaultInsightSupports(selected, workspace),
        );
        return;
      }
      if (action.type === 'edit') {
        const entry = workspace.entries.find(
          (item) => item.id === action.entryId,
        );
        if (entry) beginEdit(entry);
        else setMenu(null);
        return;
      }
      if (action.type === 'relink-selected') {
        const entry = selected[0];
        const originPath = menu.origin?.path;
        if (!entry || !originPath) {
          setMenu(null);
          return;
        }
        beginRelink(entry, originPath);
        return;
      }
      const entry = workspace.entries.find(
        (item) => item.id === action.entryId,
      );
      const choice = pathOriginChoices(workspace).find(
        (item) => item.id === action.choiceId,
      );
      if (!entry || !choice || !isHumanNoteOrQuestion(entry)) {
        setMenu(null);
        return;
      }
      beginRelink(entry, choice.path);
    },
    [beginEdit, beginRelink, menu, openComposer, selected, workspace],
  );

  const handleAuthoringKeyDown = useCallback(
    (event: React.KeyboardEvent): boolean => {
      if (!enabled || authoring.draft) return false;
      if (
        event.key === 'n' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const point = paneCenter(flow);
        openComposer('note', null, point.flow);
        return true;
      }
      if (
        event.key === 'q' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const point = paneCenter(flow);
        openComposer('question', null, point.flow);
        return true;
      }
      if (
        event.key === 'ContextMenu' ||
        (event.key === 'F10' && event.shiftKey)
      ) {
        event.preventDefault();
        const nodeElement =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('.react-flow__node')
            : null;
        const node = nodeElement
          ? flow.getNode(nodeElement.dataset.id ?? '')
          : undefined;
        const fake = {
          preventDefault() {},
          stopPropagation() {},
          clientX: 24,
          clientY: 24,
          target: event.target,
        } as unknown as MouseEvent;
        const rect = (
          (nodeElement ??
            document.querySelector<HTMLElement>(
              '.workspace-canvas .react-flow',
            )) as HTMLElement | null
        )?.getBoundingClientRect();
        const at = {
          ...fake,
          clientX: rect ? rect.left + 24 : 24,
          clientY: rect ? rect.top + 24 : 24,
        };
        openMenuAt(at, node?.data.content ?? null);
        return true;
      }
      return false;
    },
    [authoring.draft, enabled, flow, openComposer, openMenuAt],
  );

  const toolbar = enabled ? (
    <div
      className="workspace-canvas-authoring"
      role="toolbar"
      aria-label="Canvas writing"
    >
      <button
        type="button"
        className="ui-button"
        title="New note (N)"
        aria-keyshortcuts="n"
        onClick={() => {
          const point = paneCenter(flow);
          openComposer('note', null, point.flow);
        }}
      >
        New note
      </button>
      <button
        type="button"
        className="ui-button"
        title="Ask a question (Q)"
        aria-keyshortcuts="q"
        onClick={() => {
          const point = paneCenter(flow);
          openComposer('question', null, point.flow);
        }}
      >
        Ask a question
      </button>
      {currentHumanSupports(workspace).length >= 2 && (
        <button
          type="button"
          className="ui-button"
          onClick={() => {
            const point = paneCenter(flow);
            openComposer(
              'insight',
              null,
              point.flow,
              defaultInsightSupports(selected, workspace),
            );
          }}
        >
          Connect into insight
        </button>
      )}
    </div>
  ) : null;

  const overlays = enabled ? (
    <>
      {menu && (
        <CanvasMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onSelect={handleSelect}
          onDismiss={dismissMenu}
        />
      )}
      <CanvasComposer session={session} workspace={workspace} onFlush={flush} />
      {authoring.notice && !authoring.draft && (
        <output className="workspace-canvas-authoring-notice">
          {authoring.notice}
        </output>
      )}
    </>
  ) : null;

  return {
    enabled,
    flush,
    requestEdit,
    editReference,
    onPaneContextMenu,
    onNodeContextMenu,
    dismissMenu,
    handleAuthoringKeyDown,
    toolbar,
    overlays,
    initialPlacement,
    blockedNotice: session.blockedNavigationNotice(),
  };
}
