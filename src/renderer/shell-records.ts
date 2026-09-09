import type {
  LearningWorkspace,
  PathOrigin,
} from '../contracts/learning-records';
import type { PracticalActivity } from '../contracts/practical-work';
export function practicalActivity(
  workspace: LearningWorkspace,
  origin: PathOrigin | undefined,
): PracticalActivity | null {
  if (!origin?.lessonId) return null;
  const path = workspace.paths.find((record) => record.id === origin.pathId);
  const revision =
    path?.currentRevision === origin.pathRevision
      ? path.current
      : path?.revisions.find(
          (record) => record.revision === origin.pathRevision,
        );
  const lesson = revision?.topics
    .find((topic) => topic.id === origin.topicId)
    ?.lessons.find((item) => item.id === origin.lessonId);
  if (!lesson?.activity.trim()) return null;
  return {
    projectId: workspace.project.id,
    origin: {
      path: { ...origin, lessonId: origin.lessonId },
      ...(lesson.sourceRevisionId
        ? { sourceRevisionId: lesson.sourceRevisionId }
        : {}),
    },
    title: lesson.title,
    instructions: lesson.activity,
    objective: lesson.objective,
  };
}

export function listPracticalActivities(
  workspace: LearningWorkspace,
  selected?: PathOrigin,
): PracticalActivity[] {
  const listed: PracticalActivity[] = [];
  const seen = new Set<string>();
  function add(origin: PathOrigin | undefined): void {
    const activity = practicalActivity(workspace, origin);
    if (!activity) return;
    const key = JSON.stringify([
      activity.projectId,
      activity.origin.path,
      activity.origin.sourceRevisionId ?? null,
      activity.origin.highlightId ?? null,
    ]);
    if (seen.has(key)) return;
    seen.add(key);
    listed.push(activity);
  }
  for (const path of workspace.paths) {
    for (const topic of path.current.topics) {
      for (const lesson of topic.lessons) {
        add({
          pathId: path.id,
          pathRevision: path.currentRevision,
          topicId: topic.id,
          lessonId: lesson.id,
        });
      }
    }
  }
  add(selected);
  return listed;
}

export type { WorkspaceSearchResult } from './shell/record-navigation';
export { searchWorkspace } from './shell/record-navigation';
