import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import type {
  LearningEntryRecord,
  EntryRevisionReference,
  LearningOrigin,
  LearningRecordsBridge,
  LearningWorkspace,
  PathOrigin,
  PathSourceState,
  SourceRecord,
  SourceHighlight,
  SourceVersion,
} from '../../contracts/learning-records';
import { DraftSession } from './draft-session';
import { ReaderContext } from './ReaderContext';
import { isHumanSupport } from './human-support';
import { ReaderSidebar, type WorkspaceDestination } from './ReaderSidebar';
import { SourceImport, type SourceImportState } from './SourceImport';
import { SourcePane } from './SourcePane';
import { isExactSpan, resolveOrigin, type TextSpan } from './reading-location';
import './reader.css';

export interface ReaderProps {
  bridge: LearningRecordsBridge;
  workspace: LearningWorkspace;
  onNavigate: (destination: WorkspaceDestination) => void;
  onWorkspace: (workspace: LearningWorkspace) => void;
  registerFlush: (flush: (() => Promise<boolean>) | null) => void;
  navigationRef?: Ref<ReaderNavigationControls>;
  /** Optional shell-owned navigation and inline explanation slots. */
  sidebar?: ReactNode;
  explanation?: ReactNode;
  onPathChange?: (path: PathOrigin | undefined) => void;
  onExplainSelection?: (request: ReaderExplanationRequest) => Promise<void>;
}

export interface ReaderExplanationRequest {
  kind: 'text' | 'visual';
  origin: LearningOrigin;
  quote: string;
}

export interface ReaderNavigationControls {
  /** Use only while this project-keyed Reader remains mounted. Home/close use registerFlush. */
  flushViewNavigation: () => Promise<boolean>;
  openOrigin: (origin: LearningOrigin) => void;
  editEntry: (entry: EntryRevisionReference) => void;
  revealEntry: (entry: EntryRevisionReference) => void;
}

/** The shell must flush before replacing this project-keyed component. */
export function Reader(props: Readonly<ReaderProps>): ReactElement {
  return <ProjectReader key={props.workspace.project.id} {...props} />;
}

function ProjectReader({
  bridge,
  workspace: initial,
  onNavigate,
  onWorkspace,
  registerFlush,
  navigationRef,
  sidebar,
  explanation,
  onPathChange,
  onExplainSelection,
}: Readonly<ReaderProps>): ReactElement {
  const [workspace, setWorkspace] = useState(initial);
  const [receivedWorkspace, setReceivedWorkspace] = useState(initial);
  if (receivedWorkspace !== initial) {
    setReceivedWorkspace(initial);
    setWorkspace(initial);
  }
  const active = useRef(true);
  const currentWorkspace = useRef(workspace);
  const workspaceObserver = useRef(onWorkspace);
  useLayoutEffect(() => {
    currentWorkspace.current = workspace;
    workspaceObserver.current = onWorkspace;
  }, [workspace, onWorkspace]);
  function publishWorkspace(next: LearningWorkspace): void {
    currentWorkspace.current = next;
    setWorkspace(next);
    workspaceObserver.current(next);
  }
  const [session] = useState(
    () =>
      new DraftSession(bridge, initial.project.id, {
        onWorkspace: (next) => {
          if (active.current) publishWorkspace(next);
        },
        onCommitted: (kind) => {
          if (active.current && kind === 'insight') setSupports([]);
        },
      }),
  );
  const [version, setVersion] = useState<SourceVersion | null>(
    initial.sources[0]?.currentVersion ?? null,
  );
  const [span, setSpan] = useState<TextSpan | null>(null);
  const [path, setPath] = useState<PathOrigin | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<false | 'new' | SourceRecord>(
    false,
  );
  const [importVisible, setImportVisible] = useState(false);
  const [importState, setImportState] = useState<SourceImportState>({
    dirty: false,
    saving: false,
  });
  const [supports, setSupports] = useState<string[]>([]);
  const [reveal, setReveal] = useState<{ span: TextSpan | null } | null>(null);
  const [revealedEntry, setRevealedEntry] =
    useState<EntryRevisionReference | null>(null);
  const isOccupied = busy || importState.saving;
  function selectPath(next: PathOrigin | undefined): void {
    setPath(next);
    onPathChange?.(next);
  }
  useImperativeHandle(navigationRef, () => ({
    flushViewNavigation,
    openOrigin,
    editEntry: (reference) => {
      const entry = workspace.entries.find(
        (item) => item.id === reference.entryId,
      );
      if (!entry) {
        setMessage('The referenced entry is unavailable.');
        return;
      }
      if (entry.currentRevision !== reference.revision) {
        setMessage(
          `This link refers to revision ${reference.revision}; the entry is now revision ${entry.currentRevision}. Review its current wording in Notes and questions before choosing Edit.`,
        );
        return;
      }
      edit(entry);
    },
    revealEntry,
  }));
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    registerFlush(async () => {
      if (importState.dirty || importState.saving) {
        setImportVisible(true);
        setMessage(
          'Import or discard your source draft before closing this project.',
        );
        return false;
      }
      return flushViewNavigation();
    });
    return () => registerFlush(null);
  });

  async function flushViewNavigation(): Promise<boolean> {
    if (isOccupied) {
      setMessage('Finishing the current save. Try again in a moment.');
      return false;
    }
    const ready = await session.flush();
    if (ready && active.current) setMessage(null);
    return ready && active.current;
  }
  async function beforeNavigation(action: () => void): Promise<void> {
    if (await flushViewNavigation()) action();
  }
  function openImport(source: 'new' | SourceRecord): void {
    // Reopening resumes the exact draft instead of replacing it with another source.
    if (!importing) setImporting(source);
    setImportVisible(true);
  }
  function discardImport(): void {
    setImporting(false);
    setImportVisible(false);
    setImportState({ dirty: false, saving: false });
    setMessage(null);
  }
  async function explainSelection(
    kind: ReaderExplanationRequest['kind'],
  ): Promise<void> {
    if (!version || !span || !onExplainSelection || isOccupied) return;
    const selection = { version, span, path };
    if (!(await session.flush()) || !active.current) return;
    setBusy(true);
    setMessage(null);
    try {
      const retained = await captureDraftOrigin('question', selection);
      if (retained.origin && active.current)
        await onExplainSelection({
          kind,
          origin: retained.origin,
          quote: selection.span.quote,
        });
    } catch {
      if (active.current)
        setMessage(
          'Could not open this explanation. Your selection is preserved. Try again.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function openLesson(origin: PathOrigin): Promise<void> {
    await beforeNavigation(() => {
      const record = workspace.paths.find((item) => item.id === origin.pathId);
      const pathRevision =
        record?.currentRevision === origin.pathRevision
          ? record.current
          : record?.revisions.find(
              (item) => item.revision === origin.pathRevision,
            );
      const lesson = pathRevision?.topics
        .find((item) => item.id === origin.topicId)
        ?.lessons.find((item) => item.id === origin.lessonId);
      selectPath(origin);
      setSpan(null);
      setReveal(null);
      if (!lesson) {
        setVersion(null);
        setMessage(
          'The referenced lesson revision is unavailable. Existing notes and origins are preserved.',
        );
        return;
      }
      const next = workspace.sources
        .flatMap((source) => source.versions)
        .find((item) => item.revisionId === lesson?.sourceRevisionId);
      setVersion(next ?? null);
      setMessage(next ? null : unavailableSourceMessage(lesson.sourceState));
    });
  }
  async function retainSelectionAndBegin(
    kind: 'note' | 'question' | 'insight',
  ): Promise<void> {
    const selectedVersion = version;
    const selectedSpan = span;
    const selectedPath = path;
    const eligible = workspace.entries.filter(isHumanSupport);
    const selectedSupports = eligible
      .filter((entry) => supports.includes(entry.id))
      .map((entry) => ({ entryId: entry.id, revision: entry.currentRevision }));
    if (isOccupied || !(await session.flush()) || !active.current) return;
    if (kind === 'insight' && selectedSupports.length < 2) {
      setMessage(
        'Select at least two distinct saved human notes or questions.',
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const retained = await captureDraftOrigin(kind, {
        version: selectedVersion,
        span: selectedSpan,
        path: selectedPath,
      });
      if (active.current)
        session.begin({
          kind,
          input: {
            projectId: workspace.project.id,
            expectedRevision: 0,
            title: '',
            body: '',
            origin: retained.origin,
          },
          supports: selectedSupports,
          ...(retained.highlight ? { highlight: retained.highlight } : {}),
        });
    } catch {
      if (active.current)
        setMessage(
          'Could not retain the exact highlight. Your selection is preserved. Try Note again.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function captureDraftOrigin(
    kind: 'note' | 'question' | 'insight',
    selection: {
      version: SourceVersion | null;
      span: TextSpan | null;
      path: PathOrigin | undefined;
    },
  ): Promise<{ origin: LearningOrigin | null; highlight?: SourceHighlight }> {
    const { version, span, path } = selection;
    let origin: LearningOrigin | null = path ? { path } : null;
    if (kind === 'insight' || !version) return { origin };
    origin = { ...origin, sourceRevisionId: version.revisionId };
    if (!span) return { origin };
    if (!isExactSpan(version.canonicalText, span))
      throw new Error('Invalid exact selection');
    const result = await bridge.saveHighlight({
      projectId: initial.project.id,
      expectedRevision: 0,
      sourceId: version.sourceId,
      revisionId: version.revisionId,
      ...span,
    });
    if (result.status === 'conflict') throw new Error('Highlight conflict');
    if (active.current) {
      const current = currentWorkspace.current;
      publishWorkspace({
        ...current,
        highlights: [
          ...current.highlights.filter((item) => item.id !== result.record.id),
          result.record,
        ],
      });
    }
    return {
      origin: {
        ...origin,
        sourceRevisionId: result.record.revisionId,
        highlightId: result.record.id,
      },
      highlight: result.record,
    };
  }
  function revealEntry(reference: EntryRevisionReference): void {
    const entry = workspace.entries.find(
      (item) => item.id === reference.entryId,
    );
    if (!entry) {
      setRevealedEntry(null);
      setMessage('The referenced entry is unavailable.');
      return;
    }
    const revision = entry.revisions.find(
      (item) => item.revision === reference.revision,
    );
    if (!revision) {
      setRevealedEntry(null);
      setMessage(
        `This link refers to revision ${reference.revision}; that retained wording is unavailable.`,
      );
      return;
    }
    setMessage(null);
    setRevealedEntry(reference);
  }
  function openOrigin(origin: LearningOrigin): void {
    if (!origin.sourceRevisionId && origin.path) {
      void openLesson(origin.path);
      return;
    }
    void beforeNavigation(() => {
      try {
        const resolved = resolveOrigin(workspace, origin);
        setVersion(resolved.version);
        setSpan(resolved.span);
        selectPath(origin.path);
        setMessage(null);
        setReveal({ span: resolved.span });
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : 'Source origin unavailable.',
        );
      }
    });
  }
  function edit(entry: LearningEntryRecord): void {
    void beforeNavigation(() => {
      if (!isHumanSupport(entry)) return;
      const highlight = workspace.highlights.find(
        (item) => item.id === entry.current.origin?.highlightId,
      );
      session.begin({
        kind: entry.current.kind === 'question' ? 'question' : 'note',
        input: {
          projectId: workspace.project.id,
          entryId: entry.id,
          expectedRevision: entry.currentRevision,
          title: entry.current.title,
          body: entry.current.body,
          origin: entry.current.origin,
        },
        supports: entry.current.supports,
        ...(highlight ? { highlight } : {}),
      });
    });
  }
  function renderSourceContent(): ReactElement {
    if (version)
      return (
        <SourcePane
          version={version}
          source={workspace.sources.find(
            (item) => item.id === version.sourceId,
          )}
          span={span}
          reveal={reveal}
          busy={busy}
          onSelection={setSpan}
          onVersion={(next) =>
            void beforeNavigation(() => {
              setVersion(next);
              setSpan(null);
              setReveal(null);
            })
          }
          onUpdate={(source) => void beforeNavigation(() => openImport(source))}
          onNote={() => void retainSelectionAndBegin('note')}
          onQuestion={() => void retainSelectionAndBegin('question')}
          {...(onExplainSelection
            ? {
                onExplainText: () => void explainSelection('text'),
                onExplainVisual: () => void explainSelection('visual'),
              }
            : {})}
        />
      );
    return (
      <div className="ui-empty-state">
        <h2 className="ui-heading ui-empty-state__title">
          Start with a source
        </h2>
        <p className="ui-empty-state__body">
          Add pasted text to read and keep notes in your own words.
        </p>
        <div className="ui-empty-state__action">
          <button
            className="ui-button ui-button--text"
            onClick={() => void retainSelectionAndBegin('question')}
          >
            Save a question
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="reader-shell">
      {sidebar === undefined ? (
        <ReaderSidebar
          workspace={workspace}
          selectedLessonId={path?.lessonId}
          onNavigate={(destination) => {
            if (destination === 'home' && importState.dirty) {
              setImportVisible(true);
              setMessage(
                'Import or discard your source draft before closing this project.',
              );
              return;
            }
            void beforeNavigation(() => onNavigate(destination));
          }}
          onLesson={(origin) => void openLesson(origin)}
        />
      ) : (
        sidebar
      )}
      <main className="reader-main">
        <header className="reader-header">
          <h1 className="ui-sr-only">Reading</h1>
          <button
            className="ui-button ui-button--secondary"
            onClick={() => void beforeNavigation(() => openImport('new'))}
            aria-expanded={importVisible}
            aria-controls="reader-source-import"
          >
            {importing ? 'Resume source import' : 'Add source'}
          </button>
        </header>
        {workspace.unreadableProjects.map((diagnostic, index) => (
          <p
            role="alert"
            className="ui-alert ui-alert--error"
            key={`${diagnostic.projectId}-${index}`}
          >
            Saved project content could not be read: {diagnostic.reason}
          </p>
        ))}
        <output className="reader-status">{message}</output>
        <div className="reader-layout">
          <article className="reader-document">
            {importing && (
              <section
                id="reader-source-import"
                className="reader-source-import"
                hidden={!importVisible}
                aria-label="Source import"
              >
                <SourceImport
                  bridge={bridge}
                  projectId={workspace.project.id}
                  source={importing === 'new' ? undefined : importing}
                  onStateChange={setImportState}
                  onClose={() => setImportVisible(false)}
                  onCancel={discardImport}
                  onImported={(record) => {
                    if (!active.current) return;
                    const current = currentWorkspace.current;
                    publishWorkspace({
                      ...current,
                      sources: [
                        ...current.sources.filter(
                          (item) => item.id !== record.id,
                        ),
                        record,
                      ],
                    });
                    if (!version) {
                      setVersion(record.currentVersion);
                      setSpan(null);
                      setReveal(null);
                      selectPath(undefined);
                    }
                    discardImport();
                  }}
                />
              </section>
            )}
            {renderSourceContent()}
            {explanation}
          </article>
          <ReaderContext
            workspace={workspace}
            session={session}
            supports={supports}
            busy={busy}
            reveal={revealedEntry}
            onSupportsChange={setSupports}
            onEdit={edit}
            onOpenOrigin={openOrigin}
            onRevealEntry={revealEntry}
            onInsight={() => void retainSelectionAndBegin('insight')}
            onSource={(source) =>
              void beforeNavigation(() => {
                setVersion(source.currentVersion);
                setSpan(null);
                setReveal(null);
                selectPath(undefined);
              })
            }
          />
        </div>
      </main>
    </div>
  );
}

function unavailableSourceMessage(state: PathSourceState): string {
  if (state === 'ready')
    return 'The referenced readable source version is unavailable. Existing notes and origins are preserved.';
  if (state === 'unsupported')
    return 'Readable content is unsupported for this lesson. You can add a source or save a question.';
  return 'Readable content is pending for this lesson. You can add a source or save a question.';
}
