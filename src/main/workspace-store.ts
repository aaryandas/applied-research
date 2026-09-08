import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { and, asc, desc, eq, max } from 'drizzle-orm';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import type {
  Citation,
  EntryDraft,
  EntryKind,
  EntryPosition,
  Project,
} from '../contracts/workspace';
import {
  decodeCanvasCoordinate,
  decodeEntryAuthorKind,
  decodeEntryContent,
  decodeLegacyProject,
  decodeText,
  decodeTimestamp,
  decodeUuid,
  type DecodedEntryContent,
  type EntryAuthorKind,
} from './workspace-decoder';
import { migrateWorkspaceDatabase } from './workspace-migration';
import {
  entries,
  entryPlacements,
  entryRevisions,
  projects,
  workspaceSchema,
} from './workspace-schema';

const CANVAS_VIEW = 'canvas';
type WorkspaceDatabase = BetterSQLite3Database<typeof workspaceSchema>;
type WorkspaceTransaction = Parameters<
  Parameters<WorkspaceDatabase['transaction']>[0]
>[0];

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

export class WorkspaceStore {
  private readonly database: Database.Database;
  private readonly orm: WorkspaceDatabase;

  constructor(path: string) {
    this.database = new Database(path);
    try {
      migrateWorkspaceDatabase(this.database, path);
      this.database.pragma('journal_mode = WAL');
      this.database.pragma('synchronous = FULL');
      this.database.pragma('foreign_keys = ON');
      this.database.pragma('busy_timeout = 5000');
      this.orm = drizzle(this.database, { schema: workspaceSchema });
    } catch (error_) {
      this.database.close();
      throw error_;
    }
  }

  list(): Project[] {
    return this.listWithDiagnostics().projects;
  }

  listWithDiagnostics(): WorkspaceListResult {
    const storedProjects = this.orm
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt))
      .all();
    const readableProjects: Project[] = [];
    const unreadableProjects: UnreadableProject[] = [];
    for (const project of storedProjects) {
      try {
        readableProjects.push(this.readProject(project));
      } catch (error_) {
        if (!(error_ instanceof StoredProjectError)) throw error_;
        unreadableProjects.push(error_.diagnostic());
      }
    }
    return { projects: readableProjects, unreadableProjects };
  }

  get(id: string): Project {
    const project = this.orm
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();
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
          const entryId = this.insertEntry(
            transaction,
            {
              ...validated,
              authorKind: 'human',
            },
            recordedAt,
          );
          this.touchProject(transaction, validated.projectId, recordedAt);
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
        const next = {
          kind: validated.kind,
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
            kind: validated.kind,
            title: validated.title,
            body: validated.body,
            url: validated.url,
            citationsJson: '[]',
            authorKind: 'human',
            recordedAt: recordedAt.toISOString(),
          })
          .run();
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
        this.touchProject(transaction, validated.projectId, recordedAt);
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
        const authorKind = decodeEntryAuthorKind(revision.authorKind);
        const content = decodeEntryContent(
          {
            kind: revision.kind,
            title: revision.title,
            body: revision.body,
            url: revision.url,
            citations: JSON.parse(revision.citationsJson) as unknown,
          },
          authorKind,
        );
        return {
          revision: revision.revision,
          kind: content.kind,
          title: content.title,
          body: content.body,
          url: content.url,
          citations: content.citations,
          authorKind,
          recordedAt: decodeTimestamp(
            revision.recordedAt,
            'entry revision timestamp',
          ),
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
        this.touchProject(transaction, projectId, new Date());
      },
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
        this.insertEntry(transaction, validated, recordedAt);
        this.touchProject(transaction, validated.projectId, recordedAt);
        return validated.projectId;
      },
      { behavior: 'immediate' },
    );
    return this.get(projectId);
  }

  private insertEntry(
    transaction: WorkspaceTransaction,
    content: ValidatedEntryContent,
    recordedAt: Date,
  ): string {
    const order = transaction
      .select({ maximum: max(entries.sortOrder) })
      .from(entries)
      .where(eq(entries.projectId, content.projectId))
      .get();
    const sortOrder = (order?.maximum ?? -1) + 1;
    const entryId = randomUUID();
    const createdAt = recordedAt.toISOString();
    transaction
      .insert(entries)
      .values({
        id: entryId,
        projectId: content.projectId,
        createdAt,
        sortOrder,
        currentRevision: 1,
      })
      .run();
    transaction
      .insert(entryRevisions)
      .values({
        entryId,
        projectId: content.projectId,
        revision: 1,
        kind: content.kind,
        title: content.title,
        body: content.body,
        url: content.url,
        citationsJson: JSON.stringify(content.citations),
        authorKind: content.authorKind,
        recordedAt: createdAt,
      })
      .run();
    transaction
      .insert(entryPlacements)
      .values({
        entryId,
        projectId: content.projectId,
        view: CANVAS_VIEW,
        x: 48 + (sortOrder % 2) * 424,
        y: 40 + Math.floor(sortOrder / 2) * 800,
      })
      .run();
    return entryId;
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
    const authorKind = decodeEntryAuthorKind(revision.authorKind);
    const content = decodeEntryContent(
      {
        kind: revision.kind,
        title: revision.title,
        body: revision.body,
        url: revision.url,
        citations: JSON.parse(revision.citationsJson) as unknown,
      },
      authorKind,
    );
    return {
      revision: revision.revision,
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

  private touchProject(
    transaction: WorkspaceTransaction,
    projectId: string,
    updatedAt: Date,
  ): void {
    transaction
      .update(projects)
      .set({ updatedAt: updatedAt.toISOString() })
      .where(eq(projects.id, projectId))
      .run();
  }

  private readProject(project: typeof projects.$inferSelect): Project {
    try {
      return this.readValidatedProject(project);
    } catch (error_) {
      if (error_ instanceof StoredProjectError) throw error_;
      throw new StoredProjectError(project.id, 'invalid-stored-content', {
        cause: error_,
      });
    }
  }

  private readValidatedProject(project: typeof projects.$inferSelect): Project {
    const storedEntries = this.orm
      .select({
        id: entries.id,
        kind: entryRevisions.kind,
        title: entryRevisions.title,
        body: entryRevisions.body,
        url: entryRevisions.url,
        citationsJson: entryRevisions.citationsJson,
        authorKind: entryRevisions.authorKind,
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
        if (entry.kind === null || entry.authorKind === null) {
          throw new StoredProjectError(project.id, 'missing-current-revision');
        }
        if (entry.x === null || entry.y === null) {
          throw new StoredProjectError(project.id, 'missing-canvas-placement');
        }
        const content = decodeEntryContent(
          {
            kind: entry.kind,
            title: entry.title,
            body: entry.body,
            url: entry.url,
            citations: JSON.parse(entry.citationsJson ?? '') as unknown,
          },
          decodeEntryAuthorKind(entry.authorKind),
        );
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
