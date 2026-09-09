import type { ReactElement } from 'react';
import { useState } from 'react';
import type {
  LearningWorkspace,
  PathOrigin,
  PathSourceState,
} from '../../contracts/learning-records';
import { BrandMark, Icon } from '../FieldAtlas';
import './sidebar-collapse.css';

export type WorkspaceDestination =
  'home' | 'reader' | 'canvas' | 'practical' | 'find' | 'settings';
export interface ReaderSidebarProps {
  workspace: LearningWorkspace;
  selectedLessonId?: string | undefined;
  onNavigate: (destination: WorkspaceDestination) => void;
  onLesson: (origin: PathOrigin) => void;
  destination?: WorkspaceDestination;
  collapsed?: boolean;
}

export function ReaderSidebar({
  workspace,
  selectedLessonId,
  onNavigate,
  onLesson,
  destination = 'reader',
  collapsed = false,
}: Readonly<ReaderSidebarProps>): ReactElement {
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);
  const [collapseSource, setCollapseSource] = useState(collapsed);
  if (collapseSource !== collapsed) {
    setCollapseSource(collapsed);
    setManualCollapsed(null);
  }
  const isCollapsed = manualCollapsed ?? collapsed;
  const toggleLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <nav
      className={`reader-sidebar${isCollapsed ? ' shell-icon-rail' : ''}`}
      aria-label="Project navigation"
    >
      <button
        type="button"
        className="reader-sidebar-collapse ui-button ui-button--icon"
        aria-expanded={!isCollapsed}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => setManualCollapsed(!isCollapsed)}
      >
        <span aria-hidden="true">{isCollapsed ? '»' : '«'}</span>
      </button>
      <button
        className="reader-brand ui-list-row"
        aria-label="Applied Research home"
        title="Home"
        onClick={() => onNavigate('home')}
      >
        <BrandMark />
        <span>Applied Research</span>
      </button>
      <p className="reader-project">{workspace.project.goal}</p>
      <div className="reader-workspace-links">
        <button
          className="ui-list-row"
          aria-label="Reading"
          title="Reading"
          aria-current={destination === 'reader' ? 'page' : undefined}
          onClick={() => onNavigate('reader')}
        >
          <Icon name="book" />
          <span>Reading</span>
        </button>
        <button
          className="ui-list-row"
          aria-label="Canvas"
          title="Canvas"
          aria-current={destination === 'canvas' ? 'page' : undefined}
          onClick={() => onNavigate('canvas')}
        >
          <Icon name="canvas" />
          <span>Canvas</span>
        </button>
        <button
          className="ui-list-row"
          aria-label="Practical"
          title="Practical"
          aria-current={destination === 'practical' ? 'page' : undefined}
          onClick={() => onNavigate('practical')}
        >
          <Icon name="tool" />
          <span>Practical</span>
        </button>
      </div>
      <div className="reader-outline">
        {workspace.paths.length === 0 && (
          <p className="reader-muted">
            No learning path yet. Add a source to begin reading.
          </p>
        )}
        {workspace.paths.map((path) => (
          <section key={path.id} aria-label={path.current.title}>
            <p className="reader-coordinate">{path.current.title}</p>
            {path.current.topics.map((topic) => (
              <details key={topic.id} open>
                <summary>{topic.title}</summary>
                {topic.lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    className="ui-list-row"
                    aria-current={
                      selectedLessonId === lesson.id ? 'page' : undefined
                    }
                    onClick={() =>
                      onLesson({
                        pathId: path.id,
                        pathRevision: path.currentRevision,
                        topicId: topic.id,
                        lessonId: lesson.id,
                      })
                    }
                  >
                    {lesson.title}
                    <small>
                      {lessonCaption(lesson.sourceState, lesson.objective)}
                    </small>
                  </button>
                ))}
              </details>
            ))}
          </section>
        ))}
      </div>
      <button
        className="reader-find ui-list-row"
        aria-label="Find"
        title="Find"
        aria-current={destination === 'find' ? 'page' : undefined}
        onClick={() => onNavigate('find')}
      >
        <Icon name="search" />
        <span>Find</span>
      </button>
      <button
        className="reader-profile ui-list-row"
        aria-label="Profile and settings"
        title="Settings"
        aria-current={destination === 'settings' ? 'page' : undefined}
        onClick={() => onNavigate('settings')}
      >
        <Icon name="settings" />
        <span>Profile and settings</span>
      </button>
    </nav>
  );
}

function lessonCaption(state: PathSourceState, objective: string): string {
  if (state === 'ready') return objective;
  return state === 'pending'
    ? 'Readable content pending'
    : 'Readable content unsupported';
}
