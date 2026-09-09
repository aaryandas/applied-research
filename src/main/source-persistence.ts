import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { SourceRevisionInput } from '../contracts/learning-api';
import type {
  DiscoveredSourceProvenance,
  GeneratedSourceProvenance,
} from '../contracts/source-provenance';
import type { CommitAcknowledgement } from '../contracts/learning-records';
import {
  acknowledgement,
  assertProject,
  insertDefaultRecordPlacements,
  insertWorkspaceRecord,
  touchProject,
} from './learning-record-persistence';
import {
  discoveredProvenance,
  type AcquiredSourceAcceptance,
} from './source-adoption-validation';
import {
  sourceRecords,
  sourceVersions,
  type WorkspaceTransaction,
} from './workspace-schema';

export function writeAcquiredSource(
  transaction: WorkspaceTransaction,
  input: AcquiredSourceAcceptance,
): CommitAcknowledgement {
  return writeTrustedSource(transaction, {
    projectId: input.projectId,
    source: {
      ...input.source.content.revision,
      provenance: {
        kind: 'discovered',
        locator: input.source.originalLocation.url,
      },
    },
    provenance: discoveredProvenance(input.source),
  });
}

export function writeTrustedSource(
  transaction: WorkspaceTransaction,
  input: {
    projectId: string;
    source: SourceRevisionInput;
    provenance: DiscoveredSourceProvenance | GeneratedSourceProvenance;
  },
): CommitAcknowledgement {
  assertProject(transaction, input.projectId);
  const remote = input.source;
  const versions = transaction
    .select()
    .from(sourceVersions)
    .where(
      and(
        eq(sourceVersions.projectId, input.projectId),
        eq(sourceVersions.provenance, input.provenance.kind),
        eq(sourceVersions.remoteSourceId, remote.sourceId),
      ),
    )
    .all();
  const prior = versions.find(
    (item) => item.remoteRevisionId === remote.revisionId,
  );
  const provenanceJson = JSON.stringify(input.provenance);
  if (prior) {
    if (
      prior.title !== remote.title ||
      prior.provenanceJson !== provenanceJson ||
      prior.canonicalText !== remote.canonicalText ||
      prior.sha256 !== remote.sha256 ||
      prior.format !== remote.format ||
      prior.canonicalizationVersion !== remote.canonicalizationVersion ||
      prior.acquiredAt !== remote.acquiredAt
    ) {
      throw new Error('An immutable source edition cannot be overwritten.');
    }
    return acknowledgement({
      projectId: input.projectId,
      recordId: prior.sourceId,
      revision: prior.revision,
      revisionId: prior.id,
      recordedAt: new Date(prior.acquiredAt),
      changed: false,
    });
  }
  const sourceId = versions[0]?.sourceId ?? randomUUID();
  const revision = versions.length + 1;
  const revisionId = randomUUID();
  const recordedAt = new Date();
  if (versions.length === 0) {
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
        currentRevision: revision,
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
      revision,
      title: remote.title,
      canonicalText: remote.canonicalText,
      sha256: remote.sha256,
      format: remote.format,
      canonicalizationVersion: remote.canonicalizationVersion,
      acquiredAt: remote.acquiredAt,
      provenance: input.provenance.kind,
      locator: input.provenance.locator,
      remoteSourceId: remote.sourceId,
      remoteRevisionId: remote.revisionId,
      provenanceJson,
    })
    .run();
  transaction
    .update(sourceRecords)
    .set({ currentRevision: revision, currentVersionId: revisionId })
    .where(
      and(
        eq(sourceRecords.id, sourceId),
        eq(sourceRecords.projectId, input.projectId),
      ),
    )
    .run();
  touchProject(transaction, input.projectId, recordedAt);
  return acknowledgement({
    projectId: input.projectId,
    recordId: sourceId,
    revision,
    revisionId,
    recordedAt,
    changed: true,
  });
}
