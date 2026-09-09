import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import {
  MAX_PRACTICAL_ATTEMPT_FILE_BYTES,
  MAX_PRACTICAL_FILES,
  MAX_PRACTICAL_FILE_BYTES,
  type PracticalAttemptScope,
} from '../contracts/practical-records';
import type { SelectedPracticalFile } from '../contracts/practical-work';
import { practicalFiles } from './practical-schema';
import type { WorkspaceTransaction } from './workspace-schema';

export interface PracticalFileContent {
  displayName: string;
  bytes: Buffer;
}

export interface RetainedPracticalFile extends PracticalFileContent {
  sha256: string;
}

/** Files remain inert evidence bytes; signature checks do not claim a safe executable or full parser. */
function fileMediaType(file: PracticalFileContent): string {
  if (
    !Buffer.isBuffer(file.bytes) ||
    file.bytes.length === 0 ||
    file.bytes.length > MAX_PRACTICAL_FILE_BYTES
  )
    throw new Error('Unsupported evidence size.');
  if (
    !file.displayName ||
    file.displayName.length > 255 ||
    Array.from(file.displayName).some((character) => {
      const point = character.codePointAt(0)!;
      return (
        character === '/' ||
        character === '\\' ||
        point < 32 ||
        point === 127 ||
        (point >= 0xd800 && point <= 0xdfff)
      );
    })
  )
    throw new Error('Unsupported evidence name.');
  const extension = extname(file.displayName).toLowerCase();
  switch (extension) {
    case '.txt':
    case '.csv':
    case '.json': {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
        file.bytes,
      );
      if (decoded.includes('\0')) throw new Error('Unsupported evidence text.');
      if (extension === '.json') JSON.parse(decoded);
      return extension === '.json'
        ? 'application/json'
        : extension === '.csv'
          ? 'text/csv'
          : 'text/plain';
    }
    case '.png':
      if (
        file.bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        return 'image/png';
      break;
    case '.jpg':
    case '.jpeg':
      if (
        file.bytes[0] === 255 &&
        file.bytes[1] === 216 &&
        file.bytes.at(-2) === 255 &&
        file.bytes.at(-1) === 217
      )
        return 'image/jpeg';
      break;
    case '.pdf':
      if (file.bytes.subarray(0, 5).toString('ascii') === '%PDF-')
        return 'application/pdf';
  }
  throw new Error('Unsupported evidence format.');
}

function metadata(
  row: typeof practicalFiles.$inferSelect,
): SelectedPracticalFile {
  return {
    kind: 'user-selected-file',
    selectionId: row.id,
    displayName: row.displayName,
    mediaType: row.mediaType,
    byteLength: row.byteLength,
  };
}

function fileScope(scope: PracticalAttemptScope) {
  return and(
    eq(practicalFiles.projectId, scope.activity.projectId),
    eq(practicalFiles.attemptId, scope.attemptId),
  );
}

export function writePracticalFile(
  transaction: WorkspaceTransaction,
  scope: PracticalAttemptScope,
  file: PracticalFileContent,
): SelectedPracticalFile {
  const mediaType = fileMediaType(file);
  const existing = transaction
    .select({ size: practicalFiles.byteLength })
    .from(practicalFiles)
    .where(fileScope(scope))
    .all();
  if (
    existing.length >= MAX_PRACTICAL_FILES ||
    existing.reduce((total, row) => total + row.size, file.bytes.length) >
      MAX_PRACTICAL_ATTEMPT_FILE_BYTES
  )
    throw new Error('This attempt has reached its evidence limit.');
  const row = {
    id: randomUUID(),
    projectId: scope.activity.projectId,
    attemptId: scope.attemptId,
    displayName: file.displayName,
    mediaType,
    byteLength: file.bytes.length,
    sha256: createHash('sha256').update(file.bytes).digest('hex'),
    content: Buffer.from(file.bytes),
    importedAt: new Date().toISOString(),
  };
  transaction.insert(practicalFiles).values(row).run();
  return metadata(row);
}

export function readPracticalFiles(
  transaction: WorkspaceTransaction,
  scope: PracticalAttemptScope,
): SelectedPracticalFile[] {
  return transaction
    .select()
    .from(practicalFiles)
    .where(fileScope(scope))
    .orderBy(asc(practicalFiles.importedAt), asc(practicalFiles.id))
    .all()
    .map((row) => {
      validateRetainedFile(row);
      return metadata(row);
    });
}

function validateRetainedFile(row: typeof practicalFiles.$inferSelect): void {
  const mediaType = fileMediaType({
    displayName: row.displayName,
    bytes: row.content,
  });
  if (
    row.content.length !== row.byteLength ||
    mediaType !== row.mediaType ||
    createHash('sha256').update(row.content).digest('hex') !== row.sha256
  )
    throw new Error('Saved evidence could not be verified.');
}

export function readPracticalFile(
  transaction: WorkspaceTransaction,
  scope: PracticalAttemptScope,
  selectionId: string,
): RetainedPracticalFile | null {
  const row = transaction
    .select()
    .from(practicalFiles)
    .where(and(fileScope(scope), eq(practicalFiles.id, selectionId)))
    .get();
  if (!row) return null;
  validateRetainedFile(row);
  return {
    displayName: row.displayName,
    bytes: Buffer.from(row.content),
    sha256: row.sha256,
  };
}
