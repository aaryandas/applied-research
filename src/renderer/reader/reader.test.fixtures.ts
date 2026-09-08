import { vi } from 'vitest';
import type {
  CommitResult,
  LearningEntryRecord,
  LearningRecordsBridge,
  LearningWorkspace,
  SaveHumanEntryInput,
  SourceHighlight,
  SourceRecord,
} from '../../contracts/learning-records';
export function fixture() {
  let workspace: LearningWorkspace = {
    project: {
      id: 'project',
      goal: 'Synthetic learning project',
      createdAt: '',
      updatedAt: '',
    },
    entries: [],
    sources: [],
    highlights: [],
    paths: [],
    placements: [],
    unreadableProjects: [],
  };
  let sequence = 0;
  function acknowledgement(recordId: string) {
    return {
      projectId: 'project',
      recordId,
      revision: 1,
      revisionId: `${recordId}-v1`,
      committedAt: '',
      changed: true,
    };
  }
  async function save(
    input: SaveHumanEntryInput,
    kind: 'note' | 'question' | 'insight',
    supports: LearningEntryRecord['current']['supports'] = [],
  ): Promise<CommitResult<LearningEntryRecord>> {
    const id = input.entryId ?? `entry-${++sequence}`;
    const current = {
      revision: input.expectedRevision + 1,
      kind,
      title: input.title,
      body: input.body,
      url: '',
      citations: [],
      authorKind: 'human' as const,
      recordedAt: '',
      origin: input.origin,
      supports,
    };
    const record = {
      id,
      projectId: input.projectId,
      currentRevision: current.revision,
      current,
      createdAt: '',
      revisions: [current],
    };
    workspace = {
      ...workspace,
      entries: [
        ...workspace.entries.filter((entry) => entry.id !== id),
        record,
      ],
    };
    return {
      status: 'committed',
      acknowledgement: acknowledgement(id),
      record,
    };
  }
  const unavailable = async (): Promise<never> => {
    throw new Error('Unused fixture operation');
  };
  const bridge: LearningRecordsBridge = {
    getLearningWorkspace: vi.fn(async () => workspace),
    importTextSource: vi.fn<LearningRecordsBridge['importTextSource']>(
      async (input) => {
        const id = 'source';
        const version = {
          revisionId: 'source-v1',
          sourceId: id,
          revision: 1,
          title: input.title,
          canonicalText: input.text,
          sha256: 'synthetic',
          format: 'plain-text' as const,
          canonicalizationVersion: '1' as const,
          acquiredAt: input.acquiredAt,
          provenance: {
            kind: 'human-imported' as const,
            locator: input.locator ?? null,
          },
        };
        const record: SourceRecord = {
          id,
          projectId: input.projectId,
          currentRevision: 1,
          currentVersionId: version.revisionId,
          currentVersion: version,
          createdAt: '',
          versions: [version],
        };
        workspace = { ...workspace, sources: [record] };
        return {
          status: 'committed',
          acknowledgement: acknowledgement(id),
          record,
        };
      },
    ),
    saveHighlight: vi.fn<LearningRecordsBridge['saveHighlight']>(
      async (input) => {
        const record: SourceHighlight = {
          ...input,
          id: `highlight-${++sequence}`,
          createdAt: '',
        };
        workspace = {
          ...workspace,
          highlights: [...workspace.highlights, record],
        };
        return {
          status: 'committed',
          acknowledgement: acknowledgement(record.id),
          record,
        };
      },
    ),
    saveReadingNote: vi.fn((input) => save(input, 'note')),
    saveQuestion: vi.fn((input) => save(input, 'question')),
    saveInsight: vi.fn((input) => save(input, 'insight', input.supports)),
    savePathRevision: unavailable,
    moveLearningRecord: unavailable,
  };
  return { bridge, workspace };
}
