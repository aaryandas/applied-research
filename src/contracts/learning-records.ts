import type { SourceFormat } from './learning-api';
import type { SourceProvenance } from './source-provenance';
import type { Citation, EntryKind } from './workspace';

export const LEARNING_CHANNELS = {
  getWorkspace: 'learning:get-workspace',
  importTextSource: 'learning:import-text-source',
  saveHighlight: 'learning:save-highlight',
  saveReadingNote: 'learning:save-reading-note',
  saveQuestion: 'learning:save-question',
  saveInsight: 'learning:save-insight',
  savePathRevision: 'learning:save-path-revision',
  moveRecord: 'learning:move-record',
} as const;

export type LearningEntryKind = EntryKind | 'question';
export type CanvasView = 'distilled' | 'expanded';
export type PathSourceState = 'ready' | 'pending' | 'unsupported';

export interface PathOrigin {
  pathId: string;
  pathRevision: number;
  topicId: string;
  lessonId?: string;
}

export interface LearningOrigin {
  sourceRevisionId?: string;
  highlightId?: string;
  path?: PathOrigin;
}

export interface CommitAcknowledgement {
  projectId: string;
  recordId: string;
  revision: number;
  revisionId: string | null;
  committedAt: string;
  changed: boolean;
}

export interface RevisionConflict {
  code: 'revision-conflict';
  projectId: string;
  recordId: string;
  expectedRevision: number;
  currentRevision: number;
}

export type CommitResult<T> =
  | {
      status: 'committed';
      acknowledgement: CommitAcknowledgement;
      record: T;
    }
  | { status: 'conflict'; conflict: RevisionConflict };

export interface ImportTextSourceInput {
  projectId: string;
  sourceId?: string;
  expectedRevision: number;
  title: string;
  text: string;
  acquiredAt: string;
  locator?: string;
}

export interface SourceVersion {
  revisionId: string;
  sourceId: string;
  revision: number;
  title: string;
  canonicalText: string;
  sha256: string;
  format: SourceFormat;
  canonicalizationVersion: string;
  acquiredAt: string;
  provenance: SourceProvenance;
}

export interface SourceRecord {
  id: string;
  projectId: string;
  currentRevision: number;
  currentVersionId: string;
  currentVersion: SourceVersion;
  createdAt: string;
  versions: SourceVersion[];
}

export interface SaveHighlightInput {
  projectId: string;
  expectedRevision: 0;
  sourceId: string;
  revisionId: string;
  start: number;
  end: number;
  quote: string;
}

export interface SourceHighlight {
  id: string;
  projectId: string;
  sourceId: string;
  revisionId: string;
  start: number;
  end: number;
  quote: string;
  createdAt: string;
}

export interface SourceCitation {
  sourceId: string;
  revisionId: string;
  start: number;
  end: number;
  quote: string;
}

export interface SaveHumanEntryInput {
  projectId: string;
  entryId?: string;
  expectedRevision: number;
  title: string;
  body: string;
  origin: LearningOrigin | null;
}

export interface EntryRevisionReference {
  entryId: string;
  revision: number;
}

export interface SaveInsightInput extends SaveHumanEntryInput {
  supports: EntryRevisionReference[];
}

export interface LearningEntryRevision {
  revision: number;
  kind: LearningEntryKind;
  title: string;
  body: string;
  url: string;
  citations: Citation[];
  authorKind: 'human' | 'assistant' | 'system';
  recordedAt: string;
  origin: LearningOrigin | null;
  supports: EntryRevisionReference[];
}

export interface LearningEntryRecord {
  id: string;
  projectId: string;
  currentRevision: number;
  current: LearningEntryRevision;
  createdAt: string;
  revisions: LearningEntryRevision[];
}

export interface PathTopicInput {
  id: string;
  title: string;
  lessons: PathLessonInput[];
}

export type PathLessonSource =
  | { state: 'ready'; sourceRevisionId: string }
  | { state: 'pending' | 'unsupported' };

export interface PathLessonInput {
  id: string;
  title: string;
  objective: string;
  activity: string;
  source: PathLessonSource;
}

export interface SavePathRevisionInput {
  projectId: string;
  pathId?: string;
  expectedRevision: number;
  title: string;
  topics: PathTopicInput[];
}

export interface LearningPathLesson {
  id: string;
  title: string;
  objective: string;
  activity: string;
  sourceState: PathSourceState;
  sourceRevisionId: string | null;
  citations: SourceCitation[];
}

export interface LearningPathTopic {
  id: string;
  title: string;
  lessons: LearningPathLesson[];
}

export interface LearningPathRevision {
  revision: number;
  title: string;
  authorKind: 'human' | 'assistant';
  recordedAt: string;
  topics: LearningPathTopic[];
}

export interface LearningPathRecord {
  id: string;
  projectId: string;
  currentRevision: number;
  current: LearningPathRevision;
  createdAt: string;
  revisions: LearningPathRevision[];
}

export interface MoveLearningRecordInput {
  projectId: string;
  recordId: string;
  view: CanvasView;
  x: number;
  y: number;
}

export interface LearningRecordPlacement extends MoveLearningRecordInput {
  updatedAt: string;
}

export interface LearningWorkspaceDiagnostic {
  projectId: string | null;
  code:
    | 'invalid-stored-content'
    | 'missing-current-revision'
    | 'missing-canvas-placement';
  reason: string;
}

export interface LearningWorkspace {
  project: {
    id: string;
    goal: string;
    createdAt: string;
    updatedAt: string;
  };
  entries: LearningEntryRecord[];
  sources: SourceRecord[];
  highlights: SourceHighlight[];
  paths: LearningPathRecord[];
  placements: LearningRecordPlacement[];
  unreadableProjects: LearningWorkspaceDiagnostic[];
}

export interface LearningRecordsBridge {
  getLearningWorkspace(projectId: string): Promise<LearningWorkspace>;
  importTextSource(
    input: ImportTextSourceInput,
  ): Promise<CommitResult<SourceRecord>>;
  saveHighlight(
    input: SaveHighlightInput,
  ): Promise<CommitResult<SourceHighlight>>;
  saveReadingNote(
    input: SaveHumanEntryInput,
  ): Promise<CommitResult<LearningEntryRecord>>;
  saveQuestion(
    input: SaveHumanEntryInput,
  ): Promise<CommitResult<LearningEntryRecord>>;
  saveInsight(
    input: SaveInsightInput,
  ): Promise<CommitResult<LearningEntryRecord>>;
  savePathRevision(
    input: SavePathRevisionInput,
  ): Promise<CommitResult<LearningPathRecord>>;
  moveLearningRecord(input: MoveLearningRecordInput): Promise<void>;
}
