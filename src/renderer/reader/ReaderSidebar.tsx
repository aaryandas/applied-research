import type { ReactElement } from 'react';
import type {
  LearningWorkspace,
  PathOrigin,
} from '../../contracts/learning-records';
import { BrandMark, Icon } from '../FieldAtlas';

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
}: ReaderSidebarProps): ReactElement {
  return (
    <nav
      className={`reader-sidebar${collapsed ? ' shell-icon-rail' : ''}`}
      aria-label="Project navigation"
    >
      <button
        className="reader-brand"
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
          aria-label="Reading"
          title="Reading"
          aria-current={destination === 'reader' ? 'page' : undefined}
          onClick={() => onNavigate('reader')}
        >
          <Icon name="book" />
          <span>Reading</span>
        </button>
        <button
          aria-label="Canvas"
          title="Canvas"
          aria-current={destination === 'canvas' ? 'page' : undefined}
          onClick={() => onNavigate('canvas')}
        >
          <Icon name="canvas" />
          <span>Canvas</span>
        </button>
        <button
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
                      {lesson.sourceState === 'ready'
                        ? lesson.objective
                        : lesson.sourceState === 'pending'
                          ? 'Readable content pending'
                          : 'Readable content unsupported'}
                    </small>
                  </button>
                ))}
              </details>
            ))}
          </section>
        ))}
      </div>
      <button
        className="reader-find"
        aria-label="Find"
        title="Find"
        aria-current={destination === 'find' ? 'page' : undefined}
        onClick={() => onNavigate('find')}
      >
        <Icon name="search" />
        <span>Find</span>
      </button>
      <button
        className="reader-profile"
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
