import { adoptSourcedLearning } from './source-learning-adoption';
import { PracticalRecords } from './practical-records';
import type {
  PracticalFileContent,
  RetainedPracticalFile,
} from './practical-files';
import type {
  ImportPracticalFileResult,
  ListPracticalAttemptsResult,
  LoadPracticalAttemptResult,
  LoadPracticalJourneyResult,
  PracticalFilePreviewResult,
  PracticalHumanPlanResult,
  PracticalProgressResult,
} from '../contracts/practical-records';
import type { PracticalCommitResult } from '../contracts/practical-work';
import { decodeAcquiredSourceAcceptance } from './source-adoption-validation';
import {
  decodeGeneratedLesson,
  generatedProvenance,
} from './source-generated-validation';
import { writeAcquiredSource, writeTrustedSource } from './source-persistence';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { and, asc, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type {
  CommitResult,
  LearningEntryRecord,
  LearningPathRecord,
  LearningWorkspace,
  SourceCitation,
  SourceHighlight,
  SourceRecord,
} from '../contracts/learning-records';
import type {
  Citation,
  EntryDraft,
  EntryKind,
  EntryPosition,
  Project,
} from '../contracts/workspace';
import {
  copyLegacyLearningEditContext,
  readLegacyLearningEditContext,
  writeHumanLearningEntry,
  type HumanLearningEntryWrite,
} from './learning-entry-writer';
import {
  writePathRevision,
  type ValidatedPathWrite,
} from './learning-path-writer';
import { insertEntry, touchProject } from './learning-record-persistence';
import { readLearningWorkspace } from './learning-record-reader';
import {
  decodeHighlight,
  decodeHumanEntry,
  decodeImportTextSource,
  decodeInsight,
  decodeLearningRecordPosition,
  decodePathRevision,
  decodeProjectId,
} from './learning-record-validation';
import {
  moveLearningRecord,
  writeSourceHighlight,
  writeTextSource,
} from './learning-source-writer';
import {
  allocateTrustedLessonIds,
  decodeTrustedLearningPath,
} from './trusted-learning-records';
import {
  decodeCanvasCoordinate,
  decodeRecord,
  decodeEntryContent,
  decodeLegacyProject,
  decodeStoredEntryRevision,
  decodeText,
  decodeUuid,
  isWorkspaceValidationError,
  type DecodedEntryContent,
  type EntryAuthorKind,
} from './workspace-decoder';
import { migrateWorkspaceDatabase } from './workspace-migration';
import {
  entries,
  entryPlacements,
  entryRevisions,
  projects,
  recordPlacements,
  workspaceSchema,
  sourceVersions,
  type WorkspaceDatabase,
  type WorkspaceTransaction,
} from './workspace-schema';

export interface EntryRevision {
  revision: number;
  kind: EntryKind;
  title: string;
  body: string;
  url: string;
  citations: Citation[];
  authorKind: EntryAuthorKind;
  recordedAt: string;
}

export interface EntryRevisionSave {
  project: Project;
  revision: number;
}

interface NewEntryContent {
  projectId: string;
  kind: EntryKind;
  title: string;
  body: string;
  url: string;
  citations: Citation[];
}

interface ValidatedEntryContent extends DecodedEntryContent {
  projectId: string;
}

interface RevisionContent {
  kind: EntryKind;
  title: string;
  body: string;
  url: string;
  citationsJson: string;
}

export type UnreadableProjectCode =
  | 'invalid-stored-content'
  | 'missing-current-revision'
  | 'missing-canvas-placement';

export interface UnreadableProject {
  projectId: string | null;
  code: UnreadableProjectCode;
  reason: string;
}

export interface WorkspaceListResult {
  projects: Project[];
  unreadableProjects: UnreadableProject[];
}

const UNREADABLE_PROJECT_REASONS: Record<UnreadableProjectCode, string> = {
  'invalid-stored-content':
    'Its stored content is invalid. Restore a verified backup or contact support before editing this space.',
  'missing-current-revision':
    'An entry has no current content revision. Restore a verified backup or contact support before editing this space.',
  'missing-canvas-placement':
    'An entry is missing its canvas placement. Restore a verified backup or contact support before editing this space.',
};

export class StoredProjectError extends Error {
  readonly projectId: string | null;
  readonly code: UnreadableProjectCode;
  readonly reason: string;

  constructor(
    projectId: string,
    code: UnreadableProjectCode,
    options?: ErrorOptions,
  ) {
    const reason = UNREADABLE_PROJECT_REASONS[code];
    let safeProjectId: string | null = null;
    try {
      safeProjectId = decodeUuid(projectId, 'stored project id');
    } catch {
      // Corrupt identity text must not enter diagnostics or public errors.
    }
    const subject = safeProjectId
      ? `Learning space ${safeProjectId}`
      : 'A learning space';
    super(
      `${subject} cannot be opened. ${reason} No data was changed.`,
      options,
    );
    this.name = 'StoredProjectError';
    this.projectId = safeProjectId;
    this.code = code;
    this.reason = reason;
  }

  diagnostic(): UnreadableProject {
    return {
      projectId: this.projectId,
      code: this.code,
      reason: this.reason,
    };
  }
}

export class WorkspaceStorageError extends Error {
  readonly code = 'workspace-storage-unavailable';

  constructor(options?: ErrorOptions) {
    super(
      'The local workspace is temporarily unavailable. No data was changed. Close other tools using it and retry; if the problem continues, keep workspace.sqlite and contact support.',
      options,
    );
    this.name = 'WorkspaceStorageError';
  }
}

export function classifyStoredProjectFailure(
  projectId: string,
  error_: unknown,
): StoredProjectError {
  if (error_ instanceof StoredProjectError) return error_;
  if (isWorkspaceValidationError(error_)) {
    return new StoredProjectError(projectId, 'invalid-stored-content', {
      cause: error_,
    });
  }
  if (error_ instanceof WorkspaceStorageError) throw error_;
  throw new WorkspaceStorageError({ cause: error_ });
}

export class WorkspaceStore {
  private readonly database: Database.Database;
  private readonly orm: WorkspaceDatabase;
  private readonly practical: PracticalRecords;

  acceptSourcedLearning(value: unknown): CommitResult<LearningPathRecord> {
    return this.database
      .transaction(() => adoptSourcedLearning(this, value))
      .immediate();
  }

  recordPracticalResult(value: unknown): PracticalCommitResult {
    return this.practical.recordPracticalResult(value);
  }
  loadPracticalAttempt(value: unknown): LoadPracticalAttemptResult {
    return this.practical.loadPracticalAttempt(value);
  }
  listPracticalAttempts(value: unknown): ListPracticalAttemptsResult {
    return this.practical.listPracticalAttempts(value);
  }
  previewPracticalFile(value: unknown): PracticalFilePreviewResult {
    return this.practical.previewPracticalFile(value);
  }
  loadPracticalJourney(value: unknown): LoadPracticalJourneyResult {
    return this.practical.loadPracticalJourney(value);
  }
  retainAcceptedBrief(
    value: unknown,
  ):
    | { status: 'retained'; briefId: string; briefRevision: number }
    | { status: 'failed' } {
    return this.practical.retainAcceptedBrief(value);
  }
  recordPracticalProgress(value: unknown): PracticalProgressResult {
    return this.practical.recordPracticalProgress(value);
  }
  recordPracticalWorkChoice(value: unknown): { status: 'saved' | 'failed' } {
    return this.practical.recordPracticalWorkChoice(value);
  }
  savePracticalHumanPlan(value: unknown): PracticalHumanPlanResult {
    return this.practical.savePracticalHumanPlan(value);
  }
  importPracticalFile(
    scope: unknown,
    file: PracticalFileContent,
  ): ImportPracticalFileResult {
    return this.practical.importPracticalFile(scope, file);
  }
  readPracticalFile(
    scope: unknown,
    selectionId: string,
  ): RetainedPracticalFile | null {
    return this.practical.readPracticalFile(scope, selectionId);
  }

  constructor(path: string) {
    this.database = new Database(path);
    try {
      migrateWorkspaceDatabase(this.database, path);
      this.database.pragma('journal_mode = WAL');
      this.database.pragma('synchronous = FULL');
      this.database.pragma('foreign_keys = ON');
      this.database.pragma('busy_timeout = 5000');
      this.orm = drizzle(this.database, { schema: workspaceSchema });
      this.practical = new PracticalRecords(this.orm);
    } catch (error_) {
      this.database.close();
      throw error_;
    }
  }

  list(): Project[] {
    return this.listWithDiagnostics().projects;
  }

  listWithDiagnostics(): WorkspaceListResult {
    let storedProjects: Array<typeof projects.$inferSelect>;
    try {
      storedProjects = this.orm
        .select()
        .from(projects)
        .orderBy(desc(projects.updatedAt))
        .all();
    } catch (error_) {
      throw new WorkspaceStorageError({ cause: error_ });
    }
    const readableProjects: Project[] = [];
    const unreadableProjects: UnreadableProject[] = [];
    for (const project of storedProjects) {
      try {
        readableProjects.push(this.readProject(project));
      } catch (error_) {
        unreadableProjects.push(
          classifyStoredProjectFailure(project.id, error_).diagnostic(),
        );
      }
    }
    return { projects: readableProjects, unreadableProjects };
  }

  get(id: string): Project {
    let project: typeof projects.$inferSelect | undefined;
    try {
      project = this.orm
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .get();
    } catch (error_) {
      throw new WorkspaceStorageError({ cause: error_ });
    }
    if (!project) throw new Error('Learning space not found.');
    return this.readProject(project);
  }

  create(goal: string): Project {
    return this.orm.transaction(
      (transaction) => {
        const trimmed = decodeText(goal, 'learning goal', 1_000).trim();
        if (!trimmed) throw new Error('Enter a learning goal.');
        const now = new Date().toISOString();
        const project: Project = {
          id: randomUUID(),
          goal: trimmed,
          createdAt: now,
          updatedAt: now,
          entries: [],
        };
        transaction.insert(projects).values(project).run();
        return project;
      },
      { behavior: 'immediate' },
    );
  }

  saveEntry(draft: EntryDraft): Project {
    const expectedRevision = draft.id
      ? this.currentRevision(draft.projectId, draft.id)
      : 0;
    return this.saveEntryRevision(draft, expectedRevision).project;
  }

  saveEntryRevision(
    draft: EntryDraft,
    expectedRevision: number,
  ): EntryRevisionSave {
    const saved = this.orm.transaction(
      (transaction) => {
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
          throw new Error('Expected revision must be a non-negative integer.');
        }
        const validated = this.validateHumanDraft(draft);
        const project = transaction
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, validated.projectId))
          .get();
        if (!project) throw new Error('Learning space not found.');
        if (!validated.id) {
          if (expectedRevision !== 0)
            throw new Error('Entry revision conflict.');
          const recordedAt = new Date();
          const entryId = insertEntry(
            transaction,
            { ...validated, authorKind: 'human' },
            { recordedAt },
          );
          touchProject(transaction, validated.projectId, recordedAt);
          return { projectId: validated.projectId, entryId, revision: 1 };
        }
        const current = this.readCurrentRevision(
          transaction,
          validated.projectId,
          validated.id,
        );
        if (!current) throw new Error('Note not found.');
        if (current.kind === 'assistant' || current.kind === 'experiment') {
          throw new Error(
            'This entry keeps its original attribution. Create your own note instead.',
          );
        }
        if (current.revision !== expectedRevision) {
          throw new Error(
            `Entry revision conflict: expected ${expectedRevision}, current ${current.revision}.`,
          );
        }
        const editContext = readLegacyLearningEditContext(transaction, {
          projectId: validated.projectId,
          entryId: validated.id,
          revision: current.revision,
          currentKind: current.kind,
          requestedKind: validated.kind,
        });
        const next = {
          kind: editContext?.persistedKind ?? validated.kind,
          title: validated.title,
          body: validated.body,
          url: validated.url,
          citationsJson: '[]',
        } satisfies RevisionContent;
        if (this.sameContent(current, next)) {
          return {
            projectId: validated.projectId,
            entryId: validated.id,
            revision: current.revision,
          };
        }
        const revision = current.revision + 1;
        const recordedAt = new Date();
        transaction
          .insert(entryRevisions)
          .values({
            entryId: validated.id,
            projectId: validated.projectId,
            revision,
            kind: next.kind,
            title: validated.title,
            body: validated.body,
            url: validated.url,
            citationsJson: '[]',
            authorKind: 'human',
            recordedAt: recordedAt.toISOString(),
          })
          .run();
        if (editContext) {
          copyLegacyLearningEditContext(transaction, {
            editContext,
            revision,
          });
        }
        const updated = transaction
          .update(entries)
          .set({ currentRevision: revision })
          .where(
            and(
              eq(entries.id, validated.id),
              eq(entries.projectId, validated.projectId),
              eq(entries.currentRevision, expectedRevision),
            ),
          )
          .run();
        if (updated.changes !== 1) throw new Error('Entry revision conflict.');
        touchProject(transaction, validated.projectId, recordedAt);
        return {
          projectId: validated.projectId,
          entryId: validated.id,
          revision,
        };
      },
      { behavior: 'immediate' },
    );
    return { project: this.get(saved.projectId), revision: saved.revision };
  }

  getEntryHistory(projectId: string, entryId: string): EntryRevision[] {
    const ownedEntry = this.orm
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.projectId, projectId)))
      .get();
    if (!ownedEntry) throw new Error('Entry not found.');
    return this.orm
      .select()
      .from(entryRevisions)
      .where(
        and(
          eq(entryRevisions.entryId, entryId),
          eq(entryRevisions.projectId, projectId),
        ),
      )
      .orderBy(desc(entryRevisions.revision))
      .all()
      .map((revision) => {
        const content = decodeStoredEntryRevision(revision);
        return {
          revision: content.revision,
          kind: content.kind,
          title: content.title,
          body: content.body,
          url: content.url,
          citations: content.citations,
          authorKind: content.authorKind,
          recordedAt: content.recordedAt,
        };
      });
  }

  moveEntry(position: EntryPosition): void {
    this.orm.transaction(
      (transaction) => {
        const projectId = decodeUuid(position.projectId, 'project id');
        const entryId = decodeUuid(position.id, 'entry id');
        const x = decodeCanvasCoordinate(position.x, 'entry x');
        const y = decodeCanvasCoordinate(position.y, 'entry y');
        const moved = transaction
          .update(entryPlacements)
          .set({ x, y })
          .where(
            and(
              eq(entryPlacements.entryId, entryId),
              eq(entryPlacements.projectId, projectId),
            ),
          )
          .run();
        if (moved.changes !== 1) throw new Error('Entry not found.');
        const updatedAt = new Date();
        const placementUpdated = transaction
          .update(recordPlacements)
          .set({ x, y, updatedAt: updatedAt.toISOString() })
          .where(
            and(
              eq(recordPlacements.recordId, entryId),
              eq(recordPlacements.projectId, projectId),
              eq(recordPlacements.view, 'distilled'),
            ),
          )
          .run();
        if (placementUpdated.changes !== 1) {
          throw new Error('Entry distilled placement not found.');
        }
        touchProject(transaction, projectId, updatedAt);
      },
      { behavior: 'immediate' },
    );
  }

  getLearningWorkspace(projectIdValue: unknown): LearningWorkspace {
    const projectId = decodeProjectId(projectIdValue);
    let project: typeof projects.$inferSelect | undefined;
    try {
      project = this.orm
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
    } catch (error_) {
      throw new WorkspaceStorageError({ cause: error_ });
    }
    if (!project) throw new Error('Learning space not found.');
    try {
      return readLearningWorkspace({
        orm: this.orm,
        project,
        unreadableProjects: this.learningWorkspaceDiagnostics(),
      });
    } catch (error_) {
      throw classifyStoredProjectFailure(project.id, error_);
    }
  }

  importTextSource(value: unknown): CommitResult<SourceRecord> {
    const input = decodeImportTextSource(value);
    const outcome = this.orm.transaction(
      (transaction) => writeTextSource(transaction, input),
      { behavior: 'immediate' },
    );
    if (outcome.status === 'conflict') return outcome;
    const record = this.getLearningWorkspace(input.projectId).sources.find(
      (item) => item.id === outcome.acknowledgement.recordId,
    );
    if (!record) throw new Error('Saved source could not be read.');
    return {
      status: 'committed',
      acknowledgement: outcome.acknowledgement,
      record,
    };
  }

  /** Trusted main-only boundary; never exposed as a renderer payload operation. */
  acceptAcquiredSource(
    value: unknown,
  ): Extract<CommitResult<SourceRecord>, { status: 'committed' }> {
    const input = decodeAcquiredSourceAcceptance(value);
    return this.orm.transaction(
      (transaction) => {
        const acknowledgement = writeAcquiredSource(transaction, input);
        const record = this.getLearningWorkspace(input.projectId).sources.find(
          (item) => item.id === acknowledgement.recordId,
        );
        if (!record) throw new Error('Saved source could not be read.');
        return { status: 'committed', acknowledgement, record };
      },
      { behavior: 'immediate' },
    );
  }

  /** Generated teaching text is adopted only by authenticated main/backend code. */
  acceptGeneratedLesson(
    value: unknown,
  ): Extract<CommitResult<SourceRecord>, { status: 'committed' }> {
    const projectId = decodeProjectId(
      decodeRecord(value, 'generated lesson').projectId,
    );
    return this.orm.transaction(
      (transaction) => {
        const input = decodeGeneratedLesson(
          value,
          transaction
            .select()
            .from(sourceVersions)
            .where(eq(sourceVersions.projectId, projectId))
            .all(),
        );
        const acknowledgement = writeTrustedSource(transaction, {
          projectId: input.projectId,
          source: input.source,
          provenance: generatedProvenance(input),
        });
        const record = this.getLearningWorkspace(input.projectId).sources.find(
          (item) => item.id === acknowledgement.recordId,
        );
        if (!record) throw new Error('Saved lesson could not be read.');
        return { status: 'committed', acknowledgement, record };
      },
      { behavior: 'immediate' },
    );
  }

  saveHighlight(value: unknown): CommitResult<SourceHighlight> {
    const input = decodeHighlight(value);
    const acknowledgement = this.orm.transaction(
      (transaction) => writeSourceHighlight(transaction, input),
      { behavior: 'immediate' },
    );
    const record = this.getLearningWorkspace(input.projectId).highlights.find(
      (item) => item.id === acknowledgement.recordId,
    );
    if (!record) throw new Error('Saved highlight could not be read.');
    return { status: 'committed', acknowledgement, record };
  }

  saveReadingNote(value: unknown): CommitResult<LearningEntryRecord> {
    return this.saveHumanLearningEntry({
      input: decodeHumanEntry(value),
      kind: 'note',
      supports: [],
    });
  }

  saveQuestion(value: unknown): CommitResult<LearningEntryRecord> {
    return this.saveHumanLearningEntry({
      input: decodeHumanEntry(value),
      kind: 'question',
      supports: [],
    });
  }

  saveInsight(value: unknown): CommitResult<LearningEntryRecord> {
    const input = decodeInsight(value);
    return this.saveHumanLearningEntry({
      input,
      kind: 'insight',
      supports: input.supports,
    });
  }

  savePathRevision(value: unknown): CommitResult<LearningPathRecord> {
    return this.saveValidatedPath({
      input: decodePathRevision(value),
      authorKind: 'human',
      citationsByLesson: new Map(),
    });
  }

  acceptBackendLearningPath(value: unknown): CommitResult<LearningPathRecord> {
    const accepted = decodeTrustedLearningPath(value);
    const current = accepted.pathId
      ? this.getLearningWorkspace(accepted.projectId).paths.find(
          (item) => item.id === accepted.pathId,
        )
      : undefined;
    const currentRevision = current?.revisions.find(
      (item) => item.revision === current.currentRevision,
    );
    const topicId = currentRevision?.topics[0]?.id ?? randomUUID();
    const citationsByLesson = new Map<string, SourceCitation[]>();
    const lessonIds = allocateTrustedLessonIds(
      currentRevision?.topics[0]?.lessons ?? [],
      accepted.contribution.steps,
    );
    const lessons = accepted.contribution.steps.map((step, index) => {
      const lessonId = lessonIds[index]!;
      citationsByLesson.set(lessonId, step.citations);
      const sourceRevisionId =
        step.sourceState === 'pending'
          ? undefined
          : (step.sourceRevisionId ?? step.citations[0]?.revisionId);
      return {
        id: lessonId,
        title: step.title,
        objective: step.objective,
        activity: step.activity,
        source: sourceRevisionId
          ? ({
              state: 'ready',
              sourceRevisionId,
            } as const)
          : ({ state: 'pending' } as const),
      };
    });
    const input = decodePathRevision({
      projectId: accepted.projectId,
      ...(accepted.pathId ? { pathId: accepted.pathId } : {}),
      expectedRevision: accepted.expectedRevision,
      title: accepted.contribution.title,
      topics: [
        {
          id: topicId,
          title: accepted.contribution.title,
          lessons,
        },
      ],
    });
    return this.saveValidatedPath({
      input,
      authorKind: 'assistant',
      citationsByLesson,
    });
  }

  moveLearningRecord(value: unknown): void {
    const input = decodeLearningRecordPosition(value);
    this.orm.transaction(
      (transaction) => moveLearningRecord(transaction, input),
      { behavior: 'immediate' },
    );
  }

  addAssistant(input: {
    projectId: string;
    prompt: string;
    body: string;
    citations: Citation[];
  }): Project {
    return this.addEntry(
      {
        projectId: input.projectId,
        kind: 'assistant',
        title: input.prompt,
        body: input.body,
        url: '',
        citations: input.citations,
      },
      'assistant',
    );
  }

  addExperiment(projectId: string): Project {
    return this.addEntry(
      {
        projectId,
        kind: 'experiment',
        title: 'See a matrix transform space',
        body: 'Predict what changes, adjust the matrix, and compare the result.',
        url: '',
        citations: [],
      },
      'system',
    );
  }

  close(): void {
    this.database.close();
  }

  private saveHumanLearningEntry(
    write: HumanLearningEntryWrite,
  ): CommitResult<LearningEntryRecord> {
    const outcome = this.orm.transaction(
      (transaction) => writeHumanLearningEntry(transaction, write),
      { behavior: 'immediate' },
    );
    if (outcome.status === 'conflict') return outcome;
    const record = this.getLearningWorkspace(
      write.input.projectId,
    ).entries.find((item) => item.id === outcome.acknowledgement.recordId);
    if (!record) throw new Error('Saved learning record could not be read.');
    return {
      status: 'committed',
      acknowledgement: outcome.acknowledgement,
      record,
    };
  }

  private saveValidatedPath(
    write: ValidatedPathWrite,
  ): CommitResult<LearningPathRecord> {
    const outcome = this.orm.transaction(
      (transaction) => writePathRevision(transaction, write),
      { behavior: 'immediate' },
    );
    if (outcome.status === 'conflict') return outcome;
    const record = this.getLearningWorkspace(write.input.projectId).paths.find(
      (item) => item.id === outcome.acknowledgement.recordId,
    );
    if (!record) throw new Error('Saved learning path could not be read.');
    return {
      status: 'committed',
      acknowledgement: outcome.acknowledgement,
      record,
    };
  }

  private addEntry(
    content: NewEntryContent,
    authorKind: EntryAuthorKind,
  ): Project {
    const projectId = this.orm.transaction(
      (transaction) => {
        const validated = this.validateNewEntry(content, authorKind);
        const project = transaction
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, validated.projectId))
          .get();
        if (!project) throw new Error('Learning space not found.');
        const recordedAt = new Date();
        insertEntry(transaction, validated, { recordedAt });
        touchProject(transaction, validated.projectId, recordedAt);
        return validated.projectId;
      },
      { behavior: 'immediate' },
    );
    return this.get(projectId);
  }

  private currentRevision(projectId: string, entryId: string): number {
    const entry = this.orm
      .select({ currentRevision: entries.currentRevision })
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.projectId, projectId)))
      .get();
    if (!entry) throw new Error('Note not found.');
    return entry.currentRevision;
  }

  private readCurrentRevision(
    transaction: WorkspaceTransaction,
    projectId: string,
    entryId: string,
  ): (RevisionContent & { revision: number }) | undefined {
    const revision = transaction
      .select({
        revision: entries.currentRevision,
        kind: entryRevisions.kind,
        title: entryRevisions.title,
        body: entryRevisions.body,
        url: entryRevisions.url,
        citationsJson: entryRevisions.citationsJson,
        authorKind: entryRevisions.authorKind,
        recordedAt: entryRevisions.recordedAt,
      })
      .from(entries)
      .innerJoin(
        entryRevisions,
        and(
          eq(entryRevisions.entryId, entries.id),
          eq(entryRevisions.revision, entries.currentRevision),
        ),
      )
      .where(and(eq(entries.id, entryId), eq(entries.projectId, projectId)))
      .get();
    if (!revision) return undefined;
    const content = decodeStoredEntryRevision(revision);
    return {
      revision: content.revision,
      kind: content.kind,
      title: content.title,
      body: content.body,
      url: content.url,
      citationsJson: JSON.stringify(content.citations),
    };
  }

  private sameContent(
    current: RevisionContent,
    next: RevisionContent,
  ): boolean {
    return (
      current.kind === next.kind &&
      current.title === next.title &&
      current.body === next.body &&
      current.url === next.url &&
      current.citationsJson === next.citationsJson
    );
  }

  private readProject(project: typeof projects.$inferSelect): Project {
    try {
      return this.readValidatedProject(project);
    } catch (error_) {
      throw classifyStoredProjectFailure(project.id, error_);
    }
  }

  private learningWorkspaceDiagnostics(): UnreadableProject[] {
    const storedProjects = this.orm.select().from(projects).all();
    const diagnostics: UnreadableProject[] = [];
    for (const project of storedProjects) {
      try {
        this.readProject(project);
        readLearningWorkspace({
          orm: this.orm,
          project,
          unreadableProjects: [],
        });
      } catch (error_) {
        diagnostics.push(
          classifyStoredProjectFailure(project.id, error_).diagnostic(),
        );
      }
    }
    return diagnostics;
  }

  private readValidatedProject(project: typeof projects.$inferSelect): Project {
    const storedEntries = this.orm
      .select({
        id: entries.id,
        revision: entryRevisions.revision,
        kind: entryRevisions.kind,
        title: entryRevisions.title,
        body: entryRevisions.body,
        url: entryRevisions.url,
        citationsJson: entryRevisions.citationsJson,
        authorKind: entryRevisions.authorKind,
        recordedAt: entryRevisions.recordedAt,
        x: entryPlacements.x,
        y: entryPlacements.y,
        createdAt: entries.createdAt,
      })
      .from(entries)
      .leftJoin(
        entryRevisions,
        and(
          eq(entryRevisions.entryId, entries.id),
          eq(entryRevisions.projectId, entries.projectId),
          eq(entryRevisions.revision, entries.currentRevision),
        ),
      )
      .leftJoin(
        entryPlacements,
        and(
          eq(entryPlacements.entryId, entries.id),
          eq(entryPlacements.projectId, entries.projectId),
        ),
      )
      .where(eq(entries.projectId, project.id))
      .orderBy(asc(entries.sortOrder))
      .all();
    return decodeLegacyProject({
      ...project,
      entries: storedEntries.map((entry) => {
        if (
          entry.revision === null ||
          entry.kind === null ||
          entry.authorKind === null ||
          entry.recordedAt === null
        ) {
          throw new StoredProjectError(project.id, 'missing-current-revision');
        }
        if (entry.x === null || entry.y === null) {
          throw new StoredProjectError(project.id, 'missing-canvas-placement');
        }
        const content = decodeStoredEntryRevision({
          revision: entry.revision,
          kind: entry.kind,
          title: entry.title,
          body: entry.body,
          url: entry.url,
          citationsJson: entry.citationsJson,
          authorKind: entry.authorKind,
          recordedAt: entry.recordedAt,
        });
        return {
          id: entry.id,
          kind: content.kind,
          title: content.title,
          body: content.body,
          url: content.url,
          citations: content.citations,
          x: entry.x,
          y: entry.y,
          createdAt: entry.createdAt,
        };
      }),
    });
  }

  private validateHumanDraft(
    draft: EntryDraft,
  ): ValidatedEntryContent & { id?: string } {
    const content = decodeEntryContent(
      {
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        url: draft.url,
        citations: [],
      },
      'human',
    );
    return {
      ...content,
      projectId: decodeUuid(draft.projectId, 'project id'),
      ...(draft.id === undefined
        ? {}
        : { id: decodeUuid(draft.id, 'entry id') }),
    };
  }

  private validateNewEntry(
    content: NewEntryContent,
    authorKind: EntryAuthorKind,
  ): ValidatedEntryContent {
    return {
      ...decodeEntryContent(content, authorKind),
      projectId: decodeUuid(content.projectId, 'project id'),
    };
  }
}
