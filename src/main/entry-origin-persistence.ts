import type Database from 'better-sqlite3';
import type {
  EntryRevisionReference,
  LearningOrigin,
} from '../contracts/learning-records';
import { decodeUuid } from './workspace-decoder';

export const RESERVED_ENTRY_ORIGIN_COLUMNS = [
  'origin_entry_id',
  'origin_entry_revision',
] as const;

export function hasEntryOriginColumns(database: Database.Database): boolean {
  const names = new Set(
    (
      database.pragma('table_xinfo(entry_revision_context)') as Array<{
        name: unknown;
      }>
    ).map((row) => String(row.name)),
  );
  return RESERVED_ENTRY_ORIGIN_COLUMNS.every((column) => names.has(column));
}

export function readStoredEntryOrigins(
  database: Database.Database,
  projectId: string,
): Map<string, EntryRevisionReference> {
  const origins = new Map<string, EntryRevisionReference>();
  if (!hasEntryOriginColumns(database)) return origins;
  const rows = database
    .prepare(
      `SELECT entry_id, revision, origin_entry_id, origin_entry_revision
       FROM entry_revision_context
       WHERE project_id = ? AND origin_entry_id IS NOT NULL`,
    )
    .all(projectId) as Array<{
    entry_id: string;
    revision: number;
    origin_entry_id: string;
    origin_entry_revision: number;
  }>;
  for (const row of rows) {
    origins.set(`${row.entry_id}:${row.revision}`, {
      entryId: decodeUuid(row.origin_entry_id, 'origin entry id'),
      revision: row.origin_entry_revision,
    });
  }
  return origins;
}

export function persistEntryOrigin(
  database: Database.Database,
  input: {
    entryId: string;
    revision: number;
    origin: LearningOrigin | null;
  },
): void {
  if (!hasEntryOriginColumns(database)) {
    if (input.origin?.entry) {
      throw new Error(
        'Invalid entry origin: origin.entry is not persisted yet.',
      );
    }
    return;
  }
  const result = database
    .prepare(
      `UPDATE entry_revision_context
       SET origin_entry_id = ?, origin_entry_revision = ?
       WHERE entry_id = ? AND revision = ?`,
    )
    .run(
      input.origin?.entry?.entryId ?? null,
      input.origin?.entry?.revision ?? null,
      input.entryId,
      input.revision,
    );
  if (result.changes !== 1) {
    throw new Error('Learning record origin could not be stored.');
  }
}

export function copyStoredEntryOrigin(
  database: Database.Database,
  input: {
    entryId: string;
    fromRevision: number;
    toRevision: number;
  },
): void {
  if (!hasEntryOriginColumns(database)) return;
  database
    .prepare(
      `UPDATE entry_revision_context
       SET origin_entry_id = (
         SELECT origin_entry_id FROM entry_revision_context
         WHERE entry_id = ? AND revision = ?
       ),
       origin_entry_revision = (
         SELECT origin_entry_revision FROM entry_revision_context
         WHERE entry_id = ? AND revision = ?
       )
       WHERE entry_id = ? AND revision = ?`,
    )
    .run(
      input.entryId,
      input.fromRevision,
      input.entryId,
      input.fromRevision,
      input.entryId,
      input.toRevision,
    );
}

export function sameStoredEntryOrigin(
  database: Database.Database,
  entryId: string,
  revision: number,
  next: LearningOrigin | null,
): boolean {
  if (!hasEntryOriginColumns(database)) return next?.entry === undefined;
  const row = database
    .prepare(
      `SELECT origin_entry_id, origin_entry_revision
       FROM entry_revision_context
       WHERE entry_id = ? AND revision = ?`,
    )
    .get(entryId, revision) as
    | {
        origin_entry_id: string | null;
        origin_entry_revision: number | null;
      }
    | undefined;
  return (
    (row?.origin_entry_id ?? undefined) === next?.entry?.entryId &&
    (row?.origin_entry_revision ?? undefined) === next?.entry?.revision
  );
}

export function assertEntryOrigin(
  database: Database.Database,
  input: {
    projectId: string;
    entryId: string;
    origin: LearningOrigin | null;
  },
): void {
  const parent = input.origin?.entry;
  if (!parent) return;
  if (!hasEntryOriginColumns(database)) {
    throw new Error('Invalid entry origin: origin.entry is not persisted yet.');
  }
  if (parent.entryId === input.entryId) {
    throw new Error('Origin entry cannot reference itself.');
  }
  const stored = database
    .prepare(
      `SELECT entry_revisions.entry_id AS entry_id
       FROM entry_revisions
       INNER JOIN entries
         ON entries.id = entry_revisions.entry_id
        AND entries.project_id = entry_revisions.project_id
       WHERE entry_revisions.project_id = ?
         AND entry_revisions.entry_id = ?
         AND entry_revisions.revision = ?`,
    )
    .get(input.projectId, parent.entryId, parent.revision) as
    { entry_id: string } | undefined;
  if (!stored) {
    throw new Error('Origin entry revision not found in this learning space.');
  }
  const seen = new Set<string>([input.entryId]);
  let currentId: string | null = parent.entryId;
  let currentRevision: number | null = parent.revision;
  while (currentId && currentRevision) {
    if (seen.has(currentId)) {
      throw new Error('Origin entry cannot form a cycle.');
    }
    seen.add(currentId);
    const next = database
      .prepare(
        `SELECT origin_entry_id, origin_entry_revision
         FROM entry_revision_context
         WHERE entry_id = ? AND revision = ?`,
      )
      .get(currentId, currentRevision) as
      | {
          origin_entry_id: string | null;
          origin_entry_revision: number | null;
        }
      | undefined;
    currentId = next?.origin_entry_id ?? null;
    currentRevision = next?.origin_entry_revision ?? null;
  }
}
