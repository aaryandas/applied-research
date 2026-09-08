import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type {
  CommitAcknowledgement,
  ImportTextSourceInput,
  MoveLearningRecordInput,
  SaveHighlightInput,
} from '../contracts/learning-records';
import { isScalarBoundary } from './learning-record-validation';
import {
  acknowledgement,
  assertProject,
  conflict,
  insertDefaultRecordPlacements,
  insertWorkspaceRecord,
  touchProject,
  type WriteOutcome,
} from './learning-record-persistence';
import {
  recordPlacements,
  sourceHighlights,
  sourceRecords,
  sourceVersions,
  workspaceRecords,
  type WorkspaceTransaction,
} from './workspace-schema';

export function writeTextSource(
  transaction: WorkspaceTransaction,
  input: ImportTextSourceInput,
): WriteOutcome {
  assertProject(transaction, input.projectId);
  if (!input.sourceId && input.expectedRevision !== 0) {
    throw new Error('A new source must use expected revision 0.');
  }
  const sourceId = input.sourceId ?? randomUUID();
  const existing = transaction
    .select()
    .from(sourceRecords)
    .where(eq(sourceRecords.id, sourceId))
    .get();
  if (existing && existing.projectId !== input.projectId) {
    throw new Error('Source not found in this learning space.');
  }
  if (!existing && input.expectedRevision !== 0) {
    return conflict({
      projectId: input.projectId,
      recordId: sourceId,
      expectedRevision: input.expectedRevision,
      currentRevision: 0,
    });
  }
  if (existing && existing.currentRevision !== input.expectedRevision) {
    return conflict({
      projectId: input.projectId,
      recordId: sourceId,
      expectedRevision: input.expectedRevision,
      currentRevision: existing.currentRevision,
    });
  }
  const currentVersion = existing
    ? transaction
        .select()
        .from(sourceVersions)
        .where(eq(sourceVersions.id, existing.currentVersionId))
        .get()
    : undefined;
  const locator = input.locator ?? null;
  const sha256 = createHash('sha256').update(input.text, 'utf8').digest('hex');
  if (
    currentVersion &&
    currentVersion.title === input.title &&
    currentVersion.canonicalText === input.text &&
    currentVersion.acquiredAt === input.acquiredAt &&
    currentVersion.locator === locator
  ) {
    return {
      status: 'committed',
      acknowledgement: acknowledgement({
        projectId: input.projectId,
        recordId: sourceId,
        revision: currentVersion.revision,
        revisionId: currentVersion.id,
        recordedAt: new Date(currentVersion.acquiredAt),
        changed: false,
      }),
    };
  }
  const recordedAt = new Date();
  const nextRevision = (existing?.currentRevision ?? 0) + 1;
  const revisionId = randomUUID();
  if (!existing) {
    insertWorkspaceRecord(transaction, {
      id: sourceId,
      projectId: input.projectId,
      recordType: 'source',
      recordedAt,
    });
    insertDefaultRecordPlacements(transaction, {
      id: sourceId,
      projectId: input.projectId,
      x: 0,
      y: 0,
      recordedAt,
    });
    transaction
      .insert(sourceRecords)
      .values({
        id: sourceId,
        projectId: input.projectId,
        currentRevision: nextRevision,
        currentVersionId: revisionId,
        createdAt: recordedAt.toISOString(),
      })
      .run();
  }
  transaction
    .insert(sourceVersions)
    .values({
      id: revisionId,
      sourceId,
      projectId: input.projectId,
      revision: nextRevision,
      title: input.title,
      canonicalText: input.text,
      sha256,
      format: 'plain-text',
      canonicalizationVersion: '1',
      acquiredAt: input.acquiredAt,
      provenance: 'human-imported',
      locator,
    })
    .run();
  if (existing) {
    const updated = transaction
      .update(sourceRecords)
      .set({ currentRevision: nextRevision, currentVersionId: revisionId })
      .where(
        and(
          eq(sourceRecords.id, sourceId),
          eq(sourceRecords.projectId, input.projectId),
          eq(sourceRecords.currentRevision, input.expectedRevision),
        ),
      )
      .run();
    if (updated.changes !== 1) {
      throw new Error('Source changed during this transaction.');
    }
  }
  touchProject(transaction, input.projectId, recordedAt);
  return {
    status: 'committed',
    acknowledgement: acknowledgement({
      projectId: input.projectId,
      recordId: sourceId,
      revision: nextRevision,
      revisionId,
      recordedAt,
      changed: true,
    }),
  };
}

export function writeSourceHighlight(
  transaction: WorkspaceTransaction,
  input: SaveHighlightInput,
): CommitAcknowledgement {
  assertProject(transaction, input.projectId);
  const source = transaction
    .select({ text: sourceVersions.canonicalText })
    .from(sourceVersions)
    .where(
      and(
        eq(sourceVersions.projectId, input.projectId),
        eq(sourceVersions.sourceId, input.sourceId),
        eq(sourceVersions.id, input.revisionId),
      ),
    )
    .get();
  if (!source) throw new Error('Source revision not found.');
  if (
    !isScalarBoundary(source.text, input.start) ||
    !isScalarBoundary(source.text, input.end) ||
    source.text.slice(input.start, input.end) !== input.quote
  ) {
    throw new Error(
      'Highlight offsets and quote must exactly match scalar boundaries in the saved source revision.',
    );
  }
  const existing = transaction
    .select({ id: sourceHighlights.id, createdAt: sourceHighlights.createdAt })
    .from(sourceHighlights)
    .where(
      and(
        eq(sourceHighlights.projectId, input.projectId),
        eq(sourceHighlights.sourceRevisionId, input.revisionId),
        eq(sourceHighlights.start, input.start),
        eq(sourceHighlights.end, input.end),
        eq(sourceHighlights.quote, input.quote),
      ),
    )
    .get();
  if (existing) {
    return acknowledgement({
      projectId: input.projectId,
      recordId: existing.id,
      revision: 1,
      revisionId: null,
      recordedAt: new Date(existing.createdAt),
      changed: false,
    });
  }
  const id = randomUUID();
  const recordedAt = new Date();
  transaction
    .insert(sourceHighlights)
    .values({
      id,
      projectId: input.projectId,
      sourceRevisionId: input.revisionId,
      start: input.start,
      end: input.end,
      quote: input.quote,
      createdAt: recordedAt.toISOString(),
    })
    .run();
  touchProject(transaction, input.projectId, recordedAt);
  return acknowledgement({
    projectId: input.projectId,
    recordId: id,
    revision: 1,
    revisionId: null,
    recordedAt,
    changed: true,
  });
}

export function moveLearningRecord(
  transaction: WorkspaceTransaction,
  input: MoveLearningRecordInput,
): void {
  const owned = transaction
    .select({ id: workspaceRecords.id })
    .from(workspaceRecords)
    .where(
      and(
        eq(workspaceRecords.projectId, input.projectId),
        eq(workspaceRecords.id, input.recordId),
      ),
    )
    .get();
  if (!owned) throw new Error('Learning record not found.');
  const updatedAt = new Date();
  transaction
    .insert(recordPlacements)
    .values({ ...input, updatedAt: updatedAt.toISOString() })
    .onConflictDoUpdate({
      target: [recordPlacements.recordId, recordPlacements.view],
      set: {
        projectId: input.projectId,
        x: input.x,
        y: input.y,
        updatedAt: updatedAt.toISOString(),
      },
    })
    .run();
  touchProject(transaction, input.projectId, updatedAt);
}
