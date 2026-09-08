import type {
  LearningEntryRecord,
  LearningEntryRevision,
  LearningWorkspace,
} from '../../contracts/learning-records';

/** Synthetic component-test data. Never imported by the product entry point. */
export function createCanvasFixture(): LearningWorkspace {
  const origin = {
    sourceRevisionId: 'source-v1',
    highlightId: 'highlight',
    path: {
      pathId: 'path',
      pathRevision: 1,
      topicId: 'topic',
      lessonId: 'lesson',
    },
  };
  const note: LearningEntryRevision = {
    revision: 1,
    kind: 'note',
    title: '',
    body: 'A joint angle changes the direction of every link after it.',
    url: '',
    citations: [],
    authorKind: 'human',
    recordedAt: '2026-09-08T12:00:00Z',
    origin,
    supports: [],
  };
  const question: LearningEntryRevision = {
    ...note,
    kind: 'question',
    body: 'Why does the hand move farther when the arm is straight?',
  };
  const insight: LearningEntryRevision = {
    ...note,
    kind: 'insight',
    body: 'The same joint rotation moves the hand differently depending on the whole arm’s configuration.',
    origin: null,
    supports: [
      { entryId: 'note', revision: 1 },
      { entryId: 'question', revision: 1 },
    ],
  };
  const record = (
    id: string,
    current: LearningEntryRevision,
  ): LearningEntryRecord => ({
    id,
    projectId: 'project',
    currentRevision: 1,
    current,
    revisions: [current],
    createdAt: current.recordedAt,
  });
  const version = {
    revisionId: 'source-v1',
    sourceId: 'source',
    revision: 1,
    title: 'Planar arm study — synthetic source',
    canonicalText:
      'A rotation affects the downstream links. The hand position depends on both joint angles.',
    sha256: 'synthetic',
    format: 'plain-text' as const,
    canonicalizationVersion: '1' as const,
    acquiredAt: '2026-09-08T12:00:00Z',
    provenance: { kind: 'human-imported' as const, locator: null },
  };
  const path = {
    revision: 1,
    title: 'Learning robotics',
    authorKind: 'human' as const,
    recordedAt: '2026-09-08T12:00:00Z',
    topics: [
      {
        id: 'topic',
        title: 'Robot movement',
        lessons: [
          {
            id: 'lesson',
            title: 'Joint angles and hand position',
            objective: 'Describe how a joint changes the hand position.',
            activity: 'Compare two configurations.',
            sourceState: 'ready' as const,
            sourceRevisionId: 'source-v1',
            citations: [],
          },
        ],
      },
    ],
  };
  return {
    project: {
      id: 'project',
      goal: 'Learning robotics',
      createdAt: '',
      updatedAt: '',
    },
    entries: [
      record('note', note),
      record('question', question),
      record('insight', insight),
    ],
    sources: [
      {
        id: 'source',
        projectId: 'project',
        currentRevision: 1,
        currentVersionId: version.revisionId,
        currentVersion: version,
        versions: [version],
        createdAt: version.acquiredAt,
      },
    ],
    highlights: [
      {
        id: 'highlight',
        projectId: 'project',
        sourceId: 'source',
        revisionId: version.revisionId,
        start: 0,
        end: 39,
        quote: version.canonicalText.slice(0, 39),
        createdAt: version.acquiredAt,
      },
    ],
    paths: [
      {
        id: 'path',
        projectId: 'project',
        currentRevision: 1,
        current: path,
        revisions: [path],
        createdAt: path.recordedAt,
      },
    ],
    placements: [],
    unreadableProjects: [],
  };
}
