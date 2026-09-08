import {
  useEffect,
  useImperativeHandle,
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
  SourceRecord,
  SourceVersion,
} from '../../contracts/learning-records';
import { DraftSession } from './draft-session';
import { ReaderContext } from './ReaderContext';
import { isHumanSupport } from './human-support';
import { ReaderSidebar, type WorkspaceDestination } from './ReaderSidebar';
import { SourceImport } from './SourceImport';
import {
  isExactSpan,
  readSelection,
  resolveOrigin,
  type TextSpan,
} from './reading-location';
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
}

export interface ReaderNavigationControls {
  openOrigin: (origin: LearningOrigin) => void;
  editEntry: (entry: EntryRevisionReference) => void;
}

/** The shell must flush before replacing this project-keyed component. */
export function Reader(props: ReaderProps): ReactElement {
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
}: ReaderProps): ReactElement {
  const [workspace, setWorkspace] = useState(initial);
  const [receivedWorkspace, setReceivedWorkspace] = useState(initial);
  if (receivedWorkspace !== initial) {
    setReceivedWorkspace(initial);
    setWorkspace(initial);
  }
  const active = useRef(true);
  const [session] = useState(
    () =>
      new DraftSession(bridge, initial.project.id, (next) => {
        if (active.current) {
          setWorkspace(next);
          onWorkspace(next);
        }
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
  const [supports, setSupports] = useState<string[]>([]);
  const prose = useRef<HTMLDivElement>(null);
  useImperativeHandle(navigationRef, () => ({
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
  }));
  useEffect(() => {
    prose.current?.querySelector('mark')?.scrollIntoView?.({ block: 'center' });
  }, [version?.revisionId, span]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    registerFlush(async () => {
      if (busy || importing) {
        setMessage('Finish or discard the source import before leaving.');
        return false;
      }
      return session.flush();
    });
    return () => registerFlush(null);
  }, [registerFlush, session, busy, importing]);

  async function beforeNavigation(action: () => void): Promise<void> {
    if (busy || importing) {
      setMessage('Finish or discard the current action before leaving.');
      return;
    }
    if ((await session.flush()) && active.current) action();
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
      setPath(origin);
      setSpan(null);
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
      setMessage(
        next
          ? null
          : lesson.sourceState === 'ready'
            ? 'The referenced readable source version is unavailable. Existing notes and origins are preserved.'
            : lesson.sourceState === 'unsupported'
              ? 'Readable content is unsupported for this lesson. You can add a source or save a question.'
              : 'Readable content is pending for this lesson. You can add a source or save a question.',
      );
    });
  }
  async function begin(kind: 'note' | 'question' | 'insight'): Promise<void> {
    const selectedVersion = version;
    const selectedSpan = span;
    const selectedPath = path;
    const eligible = workspace.entries.filter(isHumanSupport);
    const selectedSupports = eligible
      .filter((entry) => supports.includes(entry.id))
      .map((entry) => ({ entryId: entry.id, revision: entry.currentRevision }));
    if (busy || importing || !(await session.flush()) || !active.current)
      return;
    if (kind === 'insight' && selectedSupports.length < 2) {
      setMessage(
        'Select at least two distinct saved human notes or questions.',
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let origin: LearningOrigin | null = selectedPath
        ? { path: selectedPath }
        : null;
      if (selectedVersion)
        origin = { ...origin, sourceRevisionId: selectedVersion.revisionId };
      if (selectedSpan && selectedVersion && kind !== 'insight') {
        if (!isExactSpan(selectedVersion.canonicalText, selectedSpan))
          throw new Error('Invalid exact selection');
        const result = await bridge.saveHighlight({
          projectId: workspace.project.id,
          expectedRevision: 0,
          sourceId: selectedVersion.sourceId,
          revisionId: selectedVersion.revisionId,
          ...selectedSpan,
        });
        if (result.status === 'conflict') throw new Error('Highlight conflict');
        if (!active.current) return;
        origin = {
          ...origin,
          sourceRevisionId: result.record.revisionId,
          highlightId: result.record.id,
        };
        setWorkspace((current) => ({
          ...current,
          highlights: [...current.highlights, result.record],
        }));
      }
      if (active.current)
        session.begin({
          kind,
          input: {
            projectId: workspace.project.id,
            expectedRevision: 0,
            title: '',
            body: '',
            origin,
          },
          supports: selectedSupports,
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
        setPath(origin.path);
        setMessage(null);
        prose.current?.focus();
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
      });
    });
  }
  return (
    <div className="reader-shell">
      {sidebar === undefined ? (
        <ReaderSidebar
          workspace={workspace}
          selectedLessonId={path?.lessonId}
          onNavigate={(destination) =>
            void beforeNavigation(() => onNavigate(destination))
          }
          onLesson={(origin) => void openLesson(origin)}
        />
      ) : (
        sidebar
      )}
      <main className="reader-main">
        <header className="reader-header">
          <h1>Reading</h1>
          <button
            onClick={() => void beforeNavigation(() => setImporting('new'))}
          >
            Add source
          </button>
        </header>
        {workspace.unreadableProjects.map((diagnostic, index) => (
          <p role="alert" key={`${diagnostic.projectId}-${index}`}>
            {diagnostic.code}: {diagnostic.reason}
          </p>
        ))}
        {message && <p role="status">{message}</p>}
        <div className="reader-layout">
          <article>
            {importing ? (
              <SourceImport
                bridge={bridge}
                projectId={workspace.project.id}
                source={importing === 'new' ? undefined : importing}
                onCancel={() => setImporting(false)}
                onImported={(record) => {
                  if (!active.current) return;
                  const next = {
                    ...workspace,
                    sources: [
                      ...workspace.sources.filter(
                        (source) => source.id !== record.id,
                      ),
                      record,
                    ],
                  };
                  setWorkspace(next);
                  onWorkspace(next);
                  setVersion(record.currentVersion);
                  setSpan(null);
                  setImporting(false);
                }}
              />
            ) : version ? (
              <>
                <h2>{version.title}</h2>
                <div className="reader-actions">
                  <label>
                    Source version
                    <select
                      value={version.revisionId}
                      onChange={(event) => {
                        const next = workspace.sources
                          .flatMap((source) => source.versions)
                          .find(
                            (item) => item.revisionId === event.target.value,
                          );
                        if (next)
                          void beforeNavigation(() => {
                            setVersion(next);
                            setSpan(null);
                          });
                      }}
                    >
                      {workspace.sources
                        .find((source) => source.id === version.sourceId)
                        ?.versions.map((item) => (
                          <option key={item.revisionId} value={item.revisionId}>
                            Revision {item.revision}
                            {workspace.sources.find(
                              (source) => source.id === item.sourceId,
                            )?.currentVersionId === item.revisionId
                              ? ' · current'
                              : ' · retained'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      void beforeNavigation(() => {
                        const source = workspace.sources.find(
                          (item) => item.id === version.sourceId,
                        );
                        if (source) setImporting(source);
                      })
                    }
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
                  onMouseUp={() =>
                    setSpan(
                      prose.current
                        ? readSelection(
                            prose.current,
                            version.canonicalText,
                            window.getSelection(),
                          )
                        : null,
                    )
                  }
                  onKeyUp={() =>
                    setSpan(
                      prose.current
                        ? readSelection(
                            prose.current,
                            version.canonicalText,
                            window.getSelection(),
                          )
                        : null,
                    )
                  }
                >
                  {span ? (
                    <>
                      {version.canonicalText.slice(0, span.start)}
                      <mark>
                        {version.canonicalText.slice(span.start, span.end)}
                      </mark>
                      {version.canonicalText.slice(span.end)}
                    </>
                  ) : (
                    version.canonicalText
                  )}
                </div>
                <div className="reader-actions">
                  <button
                    disabled={!span || busy}
                    onClick={() => void begin('note')}
                  >
                    {busy ? 'Retaining selection…' : 'Note'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void begin('question')}
                  >
                    Save a question
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Start with a source</h2>
                <p>Add pasted text to read and keep notes in your own words.</p>
                <button onClick={() => void begin('question')}>
                  Save a question
                </button>
              </>
            )}
            {explanation}
          </article>
          <ReaderContext
            workspace={workspace}
            session={session}
            supports={supports}
            busy={busy}
            onSupportsChange={setSupports}
            onEdit={edit}
            onOpenOrigin={openOrigin}
            onInsight={() => void begin('insight')}
            onSource={(source) =>
              void beforeNavigation(() => {
                setVersion(source.currentVersion);
                setSpan(null);
                setPath(undefined);
              })
            }
          />
        </div>
      </main>
    </div>
  );
}
