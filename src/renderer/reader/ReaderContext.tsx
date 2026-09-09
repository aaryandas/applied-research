import type { ReactElement } from 'react';
import { Tabs, TabList, Tab, TabPanel } from 'react-aria-components';
import type {
  LearningEntryRecord,
  LearningOrigin,
  LearningWorkspace,
  SourceRecord,
} from '../../contracts/learning-records';
import { EmptyState } from '../shell/ui';
import { DraftSession } from './draft-session';
import { NoteComposer } from './NoteComposer';
import { EntryOrigin, InsightSupports } from './EntryOrigin';
import { isHumanSupport } from './human-support';

interface ReaderContextProps {
  workspace: LearningWorkspace;
  session: DraftSession;
  supports: string[];
  busy: boolean;
  onSupportsChange: (supports: string[]) => void;
  onEdit: (entry: LearningEntryRecord) => void;
  onOpenOrigin: (origin: LearningOrigin) => void;
  onInsight: () => void;
  onSource: (source: SourceRecord) => void;
}
export function ReaderContext({
  workspace,
  session,
  supports,
  busy,
  onSupportsChange,
  onEdit,
  onOpenOrigin,
  onInsight,
  onSource,
}: Readonly<ReaderContextProps>): ReactElement {
  const humanSupports = workspace.entries.filter(isHumanSupport);
  const insights = workspace.entries.filter(
    (entry) => entry.current.kind === 'insight',
  );
  return (
    <aside className="reader-context" aria-label="Reading context">
      <NoteComposer session={session} workspace={workspace} />
      <Tabs defaultSelectedKey="notes">
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
            <section key={entry.id}>
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
              />
            </section>
          ))}
        </TabPanel>
        <TabPanel id="sources">
          <h2 className="ui-sr-only">Sources</h2>
          {workspace.sources.map((source) => (
            <button
              className="ui-button"
              key={source.id}
              onClick={() => onSource(source)}
            >
              {source.currentVersion.title}
            </button>
          ))}
        </TabPanel>
      </Tabs>
    </aside>
  );
}
