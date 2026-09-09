import { and, eq } from 'drizzle-orm';
import { Data, Effect } from 'effect';
import type {
  AcquiredSource,
  MetadataOnlySource,
  ProviderIdentity,
} from '../../contracts/sourcing.js';
import type { DatabaseService } from '../database.js';
import {
  sourceDescriptor as sourceDescriptorTable,
  sourceIndexState as sourceIndexStateTable,
  sourceRevision as sourceRevisionTable,
} from '../schema.js';

export class SourcePersistenceFailure extends Data.TaggedError(
  'SourcePersistenceFailure',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface StoredIndexState {
  readonly sourceId: string;
  readonly revisionId: string;
  readonly embeddingGeneration: string;
  readonly passageCount: number;
}

export interface SourcePersistence {
  readonly saveDescriptor: (
    accountId: string,
    source: MetadataOnlySource,
    now: Date,
  ) => Effect.Effect<void, SourcePersistenceFailure>;
  readonly getDescriptor: (
    accountId: string,
    sourceId: string,
    providerIdentity?: ProviderIdentity,
  ) => Effect.Effect<MetadataOnlySource | null, SourcePersistenceFailure>;
  readonly listDescriptors: (
    accountId: string,
  ) => Effect.Effect<MetadataOnlySource[], SourcePersistenceFailure>;
  readonly saveRevision: (
    accountId: string,
    source: AcquiredSource,
    now: Date,
  ) => Effect.Effect<AcquiredSource, SourcePersistenceFailure>;
  readonly getRevision: (
    accountId: string,
    sourceId: string,
    revisionId: string,
  ) => Effect.Effect<AcquiredSource | null, SourcePersistenceFailure>;
  readonly listAcquired: (
    accountId: string,
  ) => Effect.Effect<AcquiredSource[], SourcePersistenceFailure>;
  readonly saveIndexState: (
    accountId: string,
    state: StoredIndexState,
    now: Date,
  ) => Effect.Effect<void, SourcePersistenceFailure>;
  readonly getIndexState: (
    accountId: string,
    sourceId: string,
    revisionId: string,
    embeddingGeneration: string,
  ) => Effect.Effect<StoredIndexState | null, SourcePersistenceFailure>;
}

function persistenceEffect<A>(
  operation: () => Promise<A>,
): Effect.Effect<A, SourcePersistenceFailure> {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) =>
      new SourcePersistenceFailure({
        message: 'Source persistence is unavailable.',
        cause,
      }),
  });
}

function asMetadata(value: unknown): MetadataOnlySource | null {
  if (typeof value !== 'object' || value === null) return null;
  const content = Reflect.get(value, 'content');
  if (
    typeof content !== 'object' ||
    content === null ||
    Reflect.get(content, 'state') !== 'metadata-only'
  ) {
    return null;
  }
  return value as MetadataOnlySource;
}

function asAcquired(value: unknown): AcquiredSource | null {
  if (typeof value !== 'object' || value === null) return null;
  const content = Reflect.get(value, 'content');
  if (
    typeof content !== 'object' ||
    content === null ||
    Reflect.get(content, 'state') !== 'acquired'
  ) {
    return null;
  }
  return value as AcquiredSource;
}

export function makeMemorySourcePersistence(): SourcePersistence {
  const descriptors = new Map<string, MetadataOnlySource>();
  const revisions = new Map<string, AcquiredSource>();
  const index = new Map<string, StoredIndexState>();
  const descriptorKey = (accountId: string, sourceId: string): string =>
    `${accountId}\0${sourceId}`;
  const revisionKey = (
    accountId: string,
    sourceId: string,
    revisionId: string,
  ): string => `${accountId}\0${sourceId}\0${revisionId}`;
  const indexKey = (
    accountId: string,
    sourceId: string,
    revisionId: string,
    generation: string,
  ): string => `${accountId}\0${sourceId}\0${revisionId}\0${generation}`;
  return {
    saveDescriptor(accountId, source) {
      return Effect.sync(() => {
        descriptors.set(descriptorKey(accountId, source.sourceId), source);
      });
    },
    getDescriptor(accountId, sourceId, providerIdentity) {
      return Effect.sync(() => {
        const source = descriptors.get(descriptorKey(accountId, sourceId));
        if (!source) return null;
        if (
          providerIdentity &&
          !source.providerIds.some(
            (id) =>
              id.provider === providerIdentity.provider &&
              id.id === providerIdentity.id,
          )
        ) {
          return null;
        }
        return source;
      });
    },
    listDescriptors(accountId) {
      return Effect.sync(() =>
        [...descriptors.entries()]
          .filter(([key]) => key.startsWith(`${accountId}\0`))
          .map(([, source]) => source),
      );
    },
    saveRevision(accountId, source) {
      return Effect.sync(() => {
        const revision = source.content.revision;
        const key = revisionKey(
          accountId,
          source.sourceId,
          revision.revisionId,
        );
        const existing = [...revisions.entries()].find(
          ([storedKey, stored]) =>
            storedKey.startsWith(`${accountId}\0${source.sourceId}\0`) &&
            stored.content.revision.sha256 === revision.sha256 &&
            stored.content.revision.canonicalizationVersion ===
              revision.canonicalizationVersion,
        );
        if (existing) return existing[1];
        revisions.set(key, source);
        return source;
      });
    },
    getRevision(accountId, sourceId, revisionId) {
      return Effect.sync(
        () =>
          revisions.get(revisionKey(accountId, sourceId, revisionId)) ?? null,
      );
    },
    listAcquired(accountId) {
      return Effect.sync(() =>
        [...revisions.entries()]
          .filter(([key]) => key.startsWith(`${accountId}\0`))
          .map(([, source]) => source),
      );
    },
    saveIndexState(accountId, state) {
      return Effect.sync(() => {
        index.set(
          indexKey(
            accountId,
            state.sourceId,
            state.revisionId,
            state.embeddingGeneration,
          ),
          state,
        );
      });
    },
    getIndexState(accountId, sourceId, revisionId, embeddingGeneration) {
      return Effect.sync(
        () =>
          index.get(
            indexKey(accountId, sourceId, revisionId, embeddingGeneration),
          ) ?? null,
      );
    },
  };
}

export function makePostgresSourcePersistence(
  database: DatabaseService,
): SourcePersistence {
  return {
    saveDescriptor(accountId, source, now) {
      const provider = source.providerIds[0];
      if (!provider) {
        return Effect.fail(
          new SourcePersistenceFailure({
            message: 'Source persistence is unavailable.',
          }),
        );
      }
      return persistenceEffect(async () => {
        await database.db
          .insert(sourceDescriptorTable)
          .values({
            accountId,
            sourceId: source.sourceId,
            provider: provider.provider,
            providerKey: provider.id,
            descriptor: source,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              sourceDescriptorTable.accountId,
              sourceDescriptorTable.sourceId,
            ],
            set: {
              provider: provider.provider,
              providerKey: provider.id,
              descriptor: source,
              updatedAt: now,
            },
          });
      });
    },
    getDescriptor(accountId, sourceId, providerIdentity) {
      return persistenceEffect(async () => {
        const [row] = await database.db
          .select()
          .from(sourceDescriptorTable)
          .where(
            and(
              eq(sourceDescriptorTable.accountId, accountId),
              eq(sourceDescriptorTable.sourceId, sourceId),
            ),
          );
        const source = asMetadata(row?.descriptor);
        if (!source) return null;
        if (
          providerIdentity &&
          !source.providerIds.some(
            (id) =>
              id.provider === providerIdentity.provider &&
              id.id === providerIdentity.id,
          )
        ) {
          return null;
        }
        return source;
      });
    },
    listDescriptors(accountId) {
      return persistenceEffect(async () => {
        const rows = await database.db
          .select()
          .from(sourceDescriptorTable)
          .where(eq(sourceDescriptorTable.accountId, accountId));
        return rows.flatMap((row) => {
          const source = asMetadata(row.descriptor);
          return source ? [source] : [];
        });
      });
    },
    saveRevision(accountId, source, now) {
      const revision = source.content.revision;
      return persistenceEffect(async () =>
        database.db.transaction(async (transaction) => {
          const [existing] = await transaction
            .select()
            .from(sourceRevisionTable)
            .where(
              and(
                eq(sourceRevisionTable.accountId, accountId),
                eq(sourceRevisionTable.sourceId, source.sourceId),
                eq(sourceRevisionTable.sha256, revision.sha256),
                eq(
                  sourceRevisionTable.canonicalizationVersion,
                  revision.canonicalizationVersion,
                ),
              ),
            );
          const stored = asAcquired(existing?.acquired);
          if (stored) return stored;
          await transaction.insert(sourceRevisionTable).values({
            accountId,
            sourceId: source.sourceId,
            revisionId: revision.revisionId,
            sha256: revision.sha256,
            canonicalizationVersion: revision.canonicalizationVersion,
            acquired: source,
            createdAt: now,
          });
          return source;
        }),
      );
    },
    getRevision(accountId, sourceId, revisionId) {
      return persistenceEffect(async () => {
        const [row] = await database.db
          .select()
          .from(sourceRevisionTable)
          .where(
            and(
              eq(sourceRevisionTable.accountId, accountId),
              eq(sourceRevisionTable.sourceId, sourceId),
              eq(sourceRevisionTable.revisionId, revisionId),
            ),
          );
        return asAcquired(row?.acquired);
      });
    },
    listAcquired(accountId) {
      return persistenceEffect(async () => {
        const rows = await database.db
          .select()
          .from(sourceRevisionTable)
          .where(eq(sourceRevisionTable.accountId, accountId));
        return rows.flatMap((row) => {
          const source = asAcquired(row.acquired);
          return source ? [source] : [];
        });
      });
    },
    saveIndexState(accountId, state, now) {
      return persistenceEffect(async () => {
        await database.db
          .insert(sourceIndexStateTable)
          .values({
            accountId,
            sourceId: state.sourceId,
            revisionId: state.revisionId,
            embeddingGeneration: state.embeddingGeneration,
            passageCount: state.passageCount,
            indexedAt: now,
          })
          .onConflictDoNothing();
      });
    },
    getIndexState(accountId, sourceId, revisionId, embeddingGeneration) {
      return persistenceEffect(async () => {
        const [row] = await database.db
          .select()
          .from(sourceIndexStateTable)
          .where(
            and(
              eq(sourceIndexStateTable.accountId, accountId),
              eq(sourceIndexStateTable.sourceId, sourceId),
              eq(sourceIndexStateTable.revisionId, revisionId),
              eq(
                sourceIndexStateTable.embeddingGeneration,
                embeddingGeneration,
              ),
            ),
          );
        return row
          ? {
              sourceId: row.sourceId,
              revisionId: row.revisionId,
              embeddingGeneration: row.embeddingGeneration,
              passageCount: row.passageCount,
            }
          : null;
      });
    },
  };
}
