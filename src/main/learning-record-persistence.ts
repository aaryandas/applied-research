import { randomUUID } from 'node:crypto';
import { eq, max } from 'drizzle-orm';
import type {
  CommitAcknowledgement,
  RevisionConflict,
} from '../contracts/learning-records';
import type { Citation, EntryKind } from '../contracts/workspace';
import type { EntryAuthorKind } from './workspace-decoder';
import {
  entries,
  entryPlacements,
  entryRevisions,
  projects,
  recordPlacements,
  workspaceRecords,
  type WorkspaceTransaction,
} from './workspace-schema';

export type WriteOutcome =
  | { status: 'committed'; acknowledgement: CommitAcknowledgement }
  | { status: 'conflict'; conflict: RevisionConflict };

export interface PersistedEntryContent {
  projectId: string;
  kind: EntryKind;
  title: string;
  body: string;
  url: string;
  citations: Citation[];
  authorKind: EntryAuthorKind;
}

interface RecordIdentity {
  id: string;
  projectId: string;
  recordType: 'entry' | 'source' | 'path' | 'topic' | 'lesson';
  recordedAt: Date;
}

interface DefaultPlacement {
  id: string;
  projectId: string;
  x: number;
  y: number;
  recordedAt: Date;
}

export function acknowledgement(input: {
  projectId: string;
  recordId: string;
  revision: number;
  revisionId: string | null;
  recordedAt: Date;
  changed: boolean;
}): CommitAcknowledgement {
  return {
    projectId: input.projectId,
    recordId: input.recordId,
    revision: input.revision,
    revisionId: input.revisionId,
    committedAt: input.recordedAt.toISOString(),
    changed: input.changed,
  };
}

export function conflict(input: Omit<RevisionConflict, 'code'>): WriteOutcome {
  return {
    status: 'conflict',
    conflict: { code: 'revision-conflict', ...input },
  };
}

export function assertProject(
  transaction: WorkspaceTransaction,
  projectId: string,
): void {
  const project = transaction
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new Error('Learning space not found.');
}

export function touchProject(
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

export function insertWorkspaceRecord(
  transaction: WorkspaceTransaction,
  input: RecordIdentity,
): void {
  transaction
    .insert(workspaceRecords)
    .values({
      id: input.id,
      projectId: input.projectId,
      recordType: input.recordType,
      createdAt: input.recordedAt.toISOString(),
    })
    .run();
}

export function insertDefaultRecordPlacements(
  transaction: WorkspaceTransaction,
  input: DefaultPlacement,
): void {
  transaction
    .insert(recordPlacements)
    .values(
      (['distilled', 'expanded'] as const).map((view) => ({
        recordId: input.id,
        projectId: input.projectId,
        view,
        x: input.x,
        y: input.y,
        updatedAt: input.recordedAt.toISOString(),
      })),
    )
    .onConflictDoNothing()
    .run();
}

export function insertEntry(
  transaction: WorkspaceTransaction,
  content: PersistedEntryContent,
  options: { recordedAt: Date; entryId?: string },
): string {
  const order = transaction
    .select({ maximum: max(entries.sortOrder) })
    .from(entries)
    .where(eq(entries.projectId, content.projectId))
    .get();
  const sortOrder = (order?.maximum ?? -1) + 1;
  const entryId = options.entryId ?? randomUUID();
  const createdAt = options.recordedAt.toISOString();
  insertWorkspaceRecord(transaction, {
    id: entryId,
    projectId: content.projectId,
    recordType: 'entry',
    recordedAt: options.recordedAt,
  });
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
  const x = 48 + (sortOrder % 2) * 424;
  const y = 40 + Math.floor(sortOrder / 2) * 800;
  transaction
    .insert(entryPlacements)
    .values({
      entryId,
      projectId: content.projectId,
      view: 'canvas',
      x,
      y,
    })
    .run();
  insertDefaultRecordPlacements(transaction, {
    id: entryId,
    projectId: content.projectId,
    x,
    y,
    recordedAt: options.recordedAt,
  });
  return entryId;
}
