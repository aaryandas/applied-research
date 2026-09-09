import type { ReactElement } from 'react';
import { useLayoutEffect, useState } from 'react';
import { Tabs, TabList, Tab, TabPanel } from 'react-aria-components';
import type {
  EntryRevisionReference,
  LearningEntryRecord,
  LearningEntryRevision,
  LearningOrigin,
  LearningWorkspace,
  SourceCitation,
  SourceVersion,
} from '../../contracts/learning-records';
import { EmptyState } from '../shell/ui';
import { DraftSession } from './draft-session';
import { GeneratedCitations } from './GeneratedCitations';
import { NoteComposer } from './NoteComposer';
import { EntryOrigin, InsightSupports } from './EntryOrigin';
import { isHumanSupport } from './human-support';

interface ReaderContextProps {
  workspace: LearningWorkspace;
  session: DraftSession;
  supports: string[];
  busy: boolean;
  reveal?: EntryRevisionReference | null;
  onSupportsChange: (supports: string[]) => void;
  onEdit: (entry: LearningEntryRecord) => void;
  onOpenOrigin: (origin: LearningOrigin) => void;
  onRevealEntry: (reference: EntryRevisionReference) => void;
  onInsight: () => void;
  citations?: readonly SourceCitation[];
  onOpenCitation?: (citation: SourceCitation) => void;
  onOpenSourceVersion: (version: SourceVersion) => void;
}

function recordHeadingId(reference: EntryRevisionReference): string {
  return `reader-record-${reference.entryId}-r${reference.revision}`;
}

function tabForRevision(revision: LearningEntryRevision | undefined): string {
  if (revision?.kind === 'insight') return 'insights';
  return 'notes';
}

function RevealedRecord({
  entry,
  revision,
  workspace,
  onOpenOrigin,
  onRevealEntry,
}: Readonly<{
  entry: LearningEntryRecord;
  revision: LearningEntryRevision;
  workspace: LearningWorkspace;
  onOpenOrigin: (origin: LearningOrigin) => void;
  onRevealEntry: (reference: EntryRevisionReference) => void;
}>): ReactElement {
  const historical = revision.revision !== entry.currentRevision;
  return (
    <section
      className="reader-entry reader-entry--revealed"
      data-record-id={entry.id}
      data-revision={revision.revision}
    >
      <h3
        id={recordHeadingId({
          entryId: entry.id,
          revision: revision.revision,
        })}
        className="reader-entry__heading"
        tabIndex={-1}
      >
        {revision.title || revision.kind}
        {historical ? ` · revision ${revision.revision}` : ''}
      </h3>
      <p className="reader-coordinate">
        {revision.authorKind === 'human' ? 'Human' : 'AI'} {revision.kind} ·
        revision {revision.revision}
        {historical ? ` · current is revision ${entry.currentRevision}` : ''}
      </p>
      <p
        className={revision.authorKind === 'human' ? 'reader-human' : undefined}
      >
        {revision.body}
      </p>
      {historical ? (
        <p className="reader-muted">
          This is the retained revision. Current wording was not replaced.
        </p>
      ) : null}
      <EntryOrigin
        revision={revision}
        workspace={workspace}
        onOpen={onOpenOrigin}
        onRevealEntry={onRevealEntry}
      />
    </section>
  );
}

export function ReaderContext({
  workspace,
  session,
  supports,
  busy,
  reveal = null,
  onSupportsChange,
  onEdit,
  onOpenOrigin,
  onRevealEntry,
  onInsight,
  citations = [],
  onOpenCitation,
  onOpenSourceVersion,
}: Readonly<ReaderContextProps>): ReactElement {
  const humanSupports = workspace.entries.filter(isHumanSupport);
  const insights = workspace.entries.filter(
    (entry) => entry.current.kind === 'insight',
  );
  const revealedEntry = reveal
    ? workspace.entries.find((entry) => entry.id === reveal.entryId)
    : undefined;
  const revealedRevision = revealedEntry?.revisions.find(
    (item) => item.revision === reveal?.revision,
  );
  const listedCurrent =
    Boolean(revealedEntry) &&
    reveal?.revision === revealedEntry?.currentRevision &&
    (isHumanSupport(revealedEntry!) ||
      revealedEntry!.current.kind === 'insight');
  const [tab, setTab] = useState('notes');
  const [receivedReveal, setReceivedReveal] = useState(reveal);
  if (receivedReveal !== reveal) {
    setReceivedReveal(reveal);
    if (reveal) setTab(tabForRevision(revealedRevision));
  }
  useLayoutEffect(() => {
    if (!reveal || !revealedRevision) return;
    document.getElementById(recordHeadingId(reveal))?.focus();
  }, [reveal, revealedRevision, tab]);
  return (
    <aside className="reader-context" aria-label="Reading context">
      <NoteComposer session={session} workspace={workspace} />
      {reveal && !revealedEntry ? (
        <p className="ui-alert ui-alert--error" role="alert">
          The referenced entry is unavailable.
        </p>
      ) : null}
      {revealedEntry && revealedRevision && !listedCurrent ? (
        <RevealedRecord
          entry={revealedEntry}
          revision={revealedRevision}
          workspace={workspace}
          onOpenOrigin={onOpenOrigin}
          onRevealEntry={onRevealEntry}
        />
      ) : null}
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <TabList aria-label="Reading records" className="reader-panel-tabs">
          <Tab id="notes">Notes</Tab>
          <Tab id="insights">Insights</Tab>
          <Tab id="sources">Sources</Tab>
        </TabList>
        <TabPanel id="notes">
          <h2 className="ui-sr-only">Notes and questions</h2>
          {humanSupports.length === 0 && (
            <EmptyState
              title="No notes yet"
              body="Highlight a passage and click Note to summarize it in your own words."
            />
          )}
          {humanSupports.map((entry) => (
            <section className="reader-entry" key={entry.id}>
              <h3
                id={recordHeadingId({
                  entryId: entry.id,
                  revision: entry.currentRevision,
                })}
                className="reader-entry__heading"
                tabIndex={-1}
              >
                {entry.current.title || entry.current.kind}
              </h3>
              <label className="reader-support">
                <input
                  type="checkbox"
                  checked={supports.includes(entry.id)}
                  onChange={(event) =>
                    onSupportsChange(
                      event.target.checked
                        ? [...supports, entry.id]
                        : supports.filter((id) => id !== entry.id),
                    )
                  }
                />
                Select {entry.current.title || entry.current.kind} for insight
              </label>
              <p className="reader-coordinate">
                Human {entry.current.kind} · revision {entry.currentRevision}
              </p>
              <p className="reader-human">{entry.current.body}</p>
              <button
                className="ui-button ui-button--text"
                onClick={() => onEdit(entry)}
              >
                Edit
              </button>
              <EntryOrigin
                revision={entry.current}
                workspace={workspace}
                onOpen={onOpenOrigin}
                onRevealEntry={onRevealEntry}
              />
            </section>
          ))}
          <button
            className="ui-button ui-button--secondary"
            disabled={supports.length < 2 || busy}
            onClick={onInsight}
          >
            Create insight
          </button>
        </TabPanel>
        <TabPanel id="insights">
          <h2 className="ui-sr-only">Insights</h2>
          {insights.map((entry) => (
            <section className="reader-entry" key={entry.id}>
              <h3
                id={recordHeadingId({
                  entryId: entry.id,
                  revision: entry.currentRevision,
                })}
                className="reader-entry__heading"
                tabIndex={-1}
              >
                {entry.current.title || entry.current.kind}
              </h3>
              <p className="reader-coordinate">
                {entry.current.authorKind === 'human' ? 'Human' : 'AI'} insight
              </p>
              <p
                className={
                  entry.current.authorKind === 'human'
                    ? 'reader-human'
                    : undefined
                }
              >
                {entry.current.body}
              </p>
              <InsightSupports
                revision={entry.current}
                workspace={workspace}
                onOpen={onOpenOrigin}
                onRevealEntry={onRevealEntry}
              />
            </section>
          ))}
        </TabPanel>
        <TabPanel id="sources">
          <h2 className="ui-sr-only">Sources</h2>
          {onOpenCitation ? (
            <GeneratedCitations
              citations={citations}
              sources={workspace.sources}
              onOpen={onOpenCitation}
            />
          ) : null}
          {workspace.sources.flatMap((source) =>
            source.versions
              .filter((edition) => edition.provenance.kind !== 'generated')
              .map((edition) => (
                <button
                  className="ui-button"
                  key={edition.revisionId}
                  onClick={() => onOpenSourceVersion(edition)}
                >
                  {edition.title}
                  {source.currentVersionId === edition.revisionId
                    ? ' · current'
                    : ` · retained revision ${edition.revision}`}
                </button>
              )),
          )}
        </TabPanel>
      </Tabs>
    </aside>
  );
}
