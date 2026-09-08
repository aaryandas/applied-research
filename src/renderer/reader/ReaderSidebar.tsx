import type { ReactElement } from 'react';
import type {
  LearningWorkspace,
  PathOrigin,
  PathSourceState,
} from '../../contracts/learning-records';
import { BrandMark, Icon } from '../FieldAtlas';

export type WorkspaceDestination =
  'home' | 'reader' | 'canvas' | 'practical' | 'find' | 'settings';
export interface ReaderSidebarProps {
  workspace: LearningWorkspace;
  selectedLessonId?: string | undefined;
  onNavigate: (destination: WorkspaceDestination) => void;
  onLesson: (origin: PathOrigin) => void;
}

export function ReaderSidebar({
  workspace,
  selectedLessonId,
  onNavigate,
  onLesson,
}: Readonly<ReaderSidebarProps>): ReactElement {
  return (
    <nav className="reader-sidebar" aria-label="Project navigation">
      <button className="reader-brand" onClick={() => onNavigate('home')}>
        <BrandMark />
        Applied Research
      </button>
      <p className="reader-project">{workspace.project.goal}</p>
      <div className="reader-workspace-links">
        <button aria-current="page" onClick={() => onNavigate('reader')}>
          <Icon name="arrow" />
          Reading
        </button>
        <button onClick={() => onNavigate('canvas')}>
          <Icon name="canvas" />
          Canvas
        </button>
        <button onClick={() => onNavigate('practical')}>
          <Icon name="companion" />
          Practical
        </button>
        <button onClick={() => onNavigate('find')}>
          <Icon name="arrow" />
          Find
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
                      {lessonCaption(lesson.sourceState, lesson.objective)}
                    </small>
                  </button>
                ))}
              </details>
            ))}
          </section>
        ))}
      </div>
      <button className="reader-profile" onClick={() => onNavigate('settings')}>
        <Icon name="settings" />
        Profile and settings
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
