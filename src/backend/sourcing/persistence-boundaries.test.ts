import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  AcquiredSource,
  MetadataOnlySource,
} from '../../contracts/sourcing.js';
import type { DatabaseService } from '../database.js';
import {
  sourceDescriptor as sourceDescriptorTable,
  sourceIndexState as sourceIndexStateTable,
  sourceRevision as sourceRevisionTable,
} from '../schema.js';
import { STARTER_CATALOG_SOURCES } from './catalog.js';
import {
  makeMemorySourcePersistence,
  makePostgresSourcePersistence,
  SourcePersistenceFailure,
  type SourcePersistence,
} from './persistence.js';

const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';
const NOW = new Date('2026-09-09T00:00:00.000Z');
const CANONICAL_TEXT = 'SQL selects rows from a table.';
const OTHER_TEXT = 'A primary key uniquely identifies a row.';

const catalog = STARTER_CATALOG_SOURCES.find((item) =>
  item.sourceId.includes('python'),
);

function requireCatalog(): MetadataOnlySource {
  if (!catalog) throw new Error('expected reviewed PSF chapter');
  return catalog;
}

function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function acquiredFrom(
  descriptor: MetadataOnlySource,
  canonicalText: string,
  revisionId: string,
): AcquiredSource {
  const location =
    descriptor.acquisitionLocation ?? descriptor.originalLocation;
  return {
    ...descriptor,
    acquisitionLocation: location,
    content: {
      state: 'acquired',
      revision: {
        sourceId: descriptor.sourceId,
        revisionId,
        title: descriptor.title,
        canonicalText,
        sha256: sha256Of(canonicalText),
        format: 'html',
        canonicalizationVersion: 'canonical-text-v1',
        acquiredAt: '2026-09-09T00:00:00.000Z',
        provenance: {
          kind: 'discovered',
          acquiredFromUrl: location.url,
          providerIdentity: descriptor.providerIds[0]!,
          discoveredAt: descriptor.discoveredAt,
        },
        extraction: {
          method: 'parse5-html-v1',
          coverage: 'complete',
          note: null,
        },
      },
    },
  };
}

function sqlEquals(condition: unknown): Record<string, unknown> {
  const equals: Record<string, unknown> = {};
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as { queryChunks?: unknown[] };
    if (!Array.isArray(record.queryChunks)) return;
    for (let index = 0; index < record.queryChunks.length - 2; index += 1) {
      const column = record.queryChunks[index] as { name?: string };
      const param = record.queryChunks[index + 2] as {
        value?: unknown;
        encoder?: unknown;
      };
      if (
        column &&
        typeof column.name === 'string' &&
        param &&
        Object.hasOwn(param, 'encoder') &&
        Object.hasOwn(param, 'value')
      ) {
        equals[column.name] = param.value;
      }
    }
    for (const chunk of record.queryChunks) visit(chunk);
  };
  visit(condition);
  return equals;
}

const SQL_FIELD: Record<string, string> = {
  account_id: 'accountId',
  source_id: 'sourceId',
  revision_id: 'revisionId',
  sha256: 'sha256',
  canonicalization_version: 'canonicalizationVersion',
  embedding_generation: 'embeddingGeneration',
};

function rowMatches(row: Record<string, unknown>, condition: unknown): boolean {
  for (const [sqlName, value] of Object.entries(sqlEquals(condition))) {
    const field = SQL_FIELD[sqlName] ?? sqlName;
    if (row[field] !== value) return false;
  }
  return true;
}

function thenableRows(rows: unknown[]) {
  const result = Promise.resolve(rows);
  return {
    for: async () => rows,
    then: result.then.bind(result),
  };
}

interface PersistenceState {
  descriptors: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
  index: Record<string, unknown>[];
}

function fakePersistenceDatabase(
  initial: Partial<PersistenceState> = {},
  options: {
    transactionFailure?: Error;
    queryFailure?: Error;
    insertFailure?: Error;
  } = {},
): { database: DatabaseService; state: PersistenceState } {
  const state: PersistenceState = {
    descriptors: initial.descriptors ? [...initial.descriptors] : [],
    revisions: initial.revisions ? [...initial.revisions] : [],
    index: initial.index ? [...initial.index] : [],
  };

  function rowsFor(table: unknown): Record<string, unknown>[] {
    if (table === sourceDescriptorTable) return state.descriptors;
    if (table === sourceRevisionTable) return state.revisions;
    if (table === sourceIndexStateTable) return state.index;
    throw new Error('unexpected table');
  }

  const executor = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const runInsert = (
          mode: 'insert' | 'nothing' | 'update',
          set?: Record<string, unknown>,
        ): void => {
          if (options.insertFailure) throw options.insertFailure;
          const rows = rowsFor(table);
          if (table === sourceDescriptorTable) {
            const existing = rows.find(
              (row) =>
                row.accountId === values.accountId &&
                row.sourceId === values.sourceId,
            );
            if (existing && mode === 'update' && set) {
              Object.assign(existing, set);
              return;
            }
            if (existing && mode === 'nothing') return;
            if (existing) throw new Error('duplicate descriptor');
            rows.push({ ...values });
            return;
          }
          if (table === sourceRevisionTable) {
            const existing = rows.find(
              (row) =>
                row.accountId === values.accountId &&
                row.sourceId === values.sourceId &&
                row.revisionId === values.revisionId,
            );
            if (existing) throw new Error('duplicate revision');
            rows.push({ ...values });
            return;
          }
          if (table === sourceIndexStateTable) {
            const existing = rows.find(
              (row) =>
                row.accountId === values.accountId &&
                row.sourceId === values.sourceId &&
                row.revisionId === values.revisionId &&
                row.embeddingGeneration === values.embeddingGeneration,
            );
            if (existing && mode === 'nothing') return;
            if (existing) throw new Error('duplicate index state');
            rows.push({ ...values });
          }
        };
        return {
          then<TResult1 = void, TResult2 = never>(
            onfulfilled?:
              ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?:
              ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) {
            return Promise.resolve()
              .then(() => runInsert('insert'))
              .then(onfulfilled, onrejected);
          },
          onConflictDoNothing() {
            return Promise.resolve().then(() => runInsert('nothing'));
          },
          onConflictDoUpdate(config: { set: Record<string, unknown> }) {
            return Promise.resolve().then(() =>
              runInsert('update', config.set),
            );
          },
        };
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          if (options.queryFailure) throw options.queryFailure;
          return thenableRows(
            rowsFor(table).filter((row) => rowMatches(row, condition)),
          );
        },
      }),
    }),
  };

  const db = {
    transaction: async (operation: (value: unknown) => Promise<unknown>) => {
      if (options.transactionFailure) throw options.transactionFailure;
      return operation(executor);
    },
    insert: executor.insert,
    select: executor.select,
  };

  return {
    database: { db, pool: {} } as unknown as DatabaseService,
    state,
  };
}

function run<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(effect);
}

function flip<A, E>(effect: Effect.Effect<A, E>): Promise<E> {
  return Effect.runPromise(Effect.flip(effect));
}

async function roundTripDescriptors(
  persistence: SourcePersistence,
  source: MetadataOnlySource,
): Promise<void> {
  await run(persistence.saveDescriptor(ACCOUNT_A, source, NOW));
  expect(
    await run(persistence.getDescriptor(ACCOUNT_A, source.sourceId)),
  ).toEqual(source);
  expect(
    await run(
      persistence.getDescriptor(
        ACCOUNT_A,
        source.sourceId,
        source.providerIds[0],
      ),
    ),
  ).toEqual(source);
  expect(
    await run(
      persistence.getDescriptor(ACCOUNT_A, source.sourceId, {
        provider: 'curated-catalog',
        id: 'wrong-provider-id',
      }),
    ),
  ).toBeNull();
  expect(
    await run(
      persistence.getDescriptor(ACCOUNT_A, source.sourceId, {
        provider: 'mit-open-courseware',
        id: source.providerIds[0]!.id,
      }),
    ),
  ).toBeNull();
  expect(
    await run(persistence.getDescriptor(ACCOUNT_B, source.sourceId)),
  ).toBeNull();
  expect(await run(persistence.listDescriptors(ACCOUNT_A))).toEqual([source]);
  expect(await run(persistence.listDescriptors(ACCOUNT_B))).toEqual([]);
}

describe('memory source persistence public service', () => {
  it('saves, lists, and looks up descriptors by optional matching identity', async () => {
    const source = requireCatalog();
    await roundTripDescriptors(makeMemorySourcePersistence(), source);
  });

  it('replays an identical acquired revision and distinguishes a changed hash', async () => {
    const source = requireCatalog();
    const persistence = makeMemorySourcePersistence();
    const first = acquiredFrom(source, CANONICAL_TEXT, 'revision-0001');
    const replay = acquiredFrom(source, CANONICAL_TEXT, 'revision-0002');
    const changed = acquiredFrom(source, OTHER_TEXT, 'revision-0003');
    expect(await run(persistence.saveRevision(ACCOUNT_A, first, NOW))).toEqual(
      first,
    );
    expect(await run(persistence.saveRevision(ACCOUNT_A, replay, NOW))).toEqual(
      first,
    );
    expect(
      await run(persistence.saveRevision(ACCOUNT_A, changed, NOW)),
    ).toEqual(changed);
    expect(
      await run(
        persistence.getRevision(ACCOUNT_A, source.sourceId, 'revision-0001'),
      ),
    ).toEqual(first);
    expect(
      await run(
        persistence.getRevision(ACCOUNT_A, source.sourceId, 'revision-0002'),
      ),
    ).toBeNull();
    expect(await run(persistence.listAcquired(ACCOUNT_A))).toEqual([
      first,
      changed,
    ]);
    expect(await run(persistence.listAcquired(ACCOUNT_B))).toEqual([]);
  });

  it('separates index state by account, revision, and embedding generation', async () => {
    const persistence = makeMemorySourcePersistence();
    const state = {
      sourceId: 'bccampus_database_design_2e_ch15',
      revisionId: 'revision-0001',
      embeddingGeneration: 'generation-a',
      passageCount: 3,
    };
    await run(persistence.saveIndexState(ACCOUNT_A, state, NOW));
    expect(
      await run(
        persistence.getIndexState(
          ACCOUNT_A,
          state.sourceId,
          state.revisionId,
          state.embeddingGeneration,
        ),
      ),
    ).toEqual(state);
    expect(
      await run(
        persistence.getIndexState(
          ACCOUNT_A,
          state.sourceId,
          state.revisionId,
          'generation-b',
        ),
      ),
    ).toBeNull();
    expect(
      await run(
        persistence.getIndexState(
          ACCOUNT_B,
          state.sourceId,
          state.revisionId,
          state.embeddingGeneration,
        ),
      ),
    ).toBeNull();
  });
});

describe('PostgreSQL source persistence public service', () => {
  it('rejects a descriptor without a primary provider before writing', async () => {
    const source = requireCatalog();
    const fake = fakePersistenceDatabase();
    const persistence = makePostgresSourcePersistence(fake.database);
    const failure = await flip(
      persistence.saveDescriptor(
        ACCOUNT_A,
        { ...source, providerIds: [] },
        NOW,
      ),
    );
    expect(failure).toBeInstanceOf(SourcePersistenceFailure);
    expect(failure).toMatchObject({
      _tag: 'SourcePersistenceFailure',
      message: 'Source persistence is unavailable.',
    });
    expect(fake.state.descriptors).toEqual([]);
  });

  it('inserts, updates, and reads back catalog descriptors through public methods', async () => {
    const source = requireCatalog();
    const fake = fakePersistenceDatabase();
    const persistence = makePostgresSourcePersistence(fake.database);
    await roundTripDescriptors(persistence, source);
    const updated = { ...source, title: `${source.title} (reviewed)` };
    await run(persistence.saveDescriptor(ACCOUNT_A, updated, NOW));
    expect(fake.state.descriptors).toHaveLength(1);
    expect(
      await run(persistence.getDescriptor(ACCOUNT_A, source.sourceId)),
    ).toEqual(updated);
  });

  it('filters null, primitive, missing, and wrong-state descriptor blobs', async () => {
    const source = requireCatalog();
    const fake = fakePersistenceDatabase({
      descriptors: [
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          provider: 'curated-catalog',
          providerKey: source.providerIds[0]!.id,
          descriptor: null,
        },
        {
          accountId: ACCOUNT_A,
          sourceId: 'bccampus_database_design_2e_ch2',
          descriptor: 'metadata-only',
        },
        {
          accountId: ACCOUNT_A,
          sourceId: 'openalex_W2741809807',
          descriptor: 12,
        },
        {
          accountId: ACCOUNT_A,
          sourceId: 'mit_ocw_6_006',
          descriptor: { title: 'missing content' },
        },
        {
          accountId: ACCOUNT_A,
          sourceId: 'openstax_calculus',
          descriptor: { content: null },
        },
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          descriptor: { content: { state: 'acquired' } },
        },
      ],
    });
    const persistence = makePostgresSourcePersistence(fake.database);
    expect(
      await run(persistence.getDescriptor(ACCOUNT_A, source.sourceId)),
    ).toBeNull();
    expect(await run(persistence.listDescriptors(ACCOUNT_A))).toEqual([]);
  });

  it('returns null for absent descriptor and revision rows', async () => {
    const persistence = makePostgresSourcePersistence(
      fakePersistenceDatabase().database,
    );
    expect(
      await run(
        persistence.getDescriptor(
          ACCOUNT_A,
          'bccampus_database_design_2e_ch15',
        ),
      ),
    ).toBeNull();
    expect(
      await run(
        persistence.getRevision(
          ACCOUNT_A,
          'bccampus_database_design_2e_ch15',
          'revision-0001',
        ),
      ),
    ).toBeNull();
    expect(await run(persistence.listAcquired(ACCOUNT_A))).toEqual([]);
  });

  it('inserts a new acquired revision, replays identical hash plus canonicalization, and stores a changed revision', async () => {
    const source = requireCatalog();
    const fake = fakePersistenceDatabase();
    const persistence = makePostgresSourcePersistence(fake.database);
    const first = acquiredFrom(source, CANONICAL_TEXT, 'revision-0001');
    const replay = acquiredFrom(source, CANONICAL_TEXT, 'revision-9999');
    const changed = acquiredFrom(source, OTHER_TEXT, 'revision-0002');
    expect(await run(persistence.saveRevision(ACCOUNT_A, first, NOW))).toEqual(
      first,
    );
    expect(await run(persistence.saveRevision(ACCOUNT_A, replay, NOW))).toEqual(
      first,
    );
    expect(fake.state.revisions).toHaveLength(1);
    expect(
      await run(persistence.saveRevision(ACCOUNT_A, changed, NOW)),
    ).toEqual(changed);
    expect(fake.state.revisions).toHaveLength(2);
    expect(
      await run(
        persistence.getRevision(ACCOUNT_A, source.sourceId, 'revision-0001'),
      ),
    ).toEqual(first);
    expect(
      await run(
        persistence.getRevision(ACCOUNT_A, source.sourceId, 'revision-0002'),
      ),
    ).toEqual(changed);
    expect(await run(persistence.listAcquired(ACCOUNT_A))).toEqual([
      first,
      changed,
    ]);
    expect(await run(persistence.listAcquired(ACCOUNT_B))).toEqual([]);
  });

  it('filters acquired blobs that are null, primitive, missing content, or not acquired', async () => {
    const source = requireCatalog();
    const valid = acquiredFrom(source, CANONICAL_TEXT, 'revision-0001');
    const fake = fakePersistenceDatabase({
      revisions: [
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          revisionId: 'revision-0001',
          sha256: valid.content.revision.sha256,
          canonicalizationVersion: 'canonical-text-v1',
          acquired: null,
        },
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          revisionId: 'revision-0002',
          acquired: 'acquired',
        },
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          revisionId: 'revision-0003',
          acquired: ['acquired'],
        },
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          revisionId: 'revision-0004',
          acquired: { content: null },
        },
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          revisionId: 'revision-0005',
          acquired: { content: { state: 'metadata-only' } },
        },
        {
          accountId: ACCOUNT_A,
          sourceId: source.sourceId,
          revisionId: 'revision-0006',
          sha256: valid.content.revision.sha256,
          canonicalizationVersion: 'canonical-text-v1',
          acquired: valid,
        },
      ],
    });
    const persistence = makePostgresSourcePersistence(fake.database);
    expect(
      await run(
        persistence.getRevision(ACCOUNT_A, source.sourceId, 'revision-0001'),
      ),
    ).toBeNull();
    expect(await run(persistence.listAcquired(ACCOUNT_A))).toEqual([valid]);
  });

  it('saves index state once, reads it back, and keeps generation/account/revision separate', async () => {
    const fake = fakePersistenceDatabase();
    const persistence = makePostgresSourcePersistence(fake.database);
    const state = {
      sourceId: 'bccampus_database_design_2e_ch15',
      revisionId: 'revision-0001',
      embeddingGeneration: 'generation-a',
      passageCount: 4,
    };
    await run(persistence.saveIndexState(ACCOUNT_A, state, NOW));
    await run(
      persistence.saveIndexState(ACCOUNT_A, { ...state, passageCount: 9 }, NOW),
    );
    expect(fake.state.index).toHaveLength(1);
    expect(fake.state.index[0]).toMatchObject({ passageCount: 4 });
    expect(
      await run(
        persistence.getIndexState(
          ACCOUNT_A,
          state.sourceId,
          state.revisionId,
          'generation-a',
        ),
      ),
    ).toEqual(state);
    expect(
      await run(
        persistence.getIndexState(
          ACCOUNT_A,
          state.sourceId,
          'revision-0002',
          'generation-a',
        ),
      ),
    ).toBeNull();
    expect(
      await run(
        persistence.getIndexState(
          ACCOUNT_B,
          state.sourceId,
          state.revisionId,
          'generation-a',
        ),
      ),
    ).toBeNull();
  });

  it('maps failed select, insert, and revision transactions to SourcePersistenceFailure', async () => {
    const source = requireCatalog();
    const query = makePostgresSourcePersistence(
      fakePersistenceDatabase({}, { queryFailure: new Error('select failed') })
        .database,
    );
    expect(
      await flip(query.getDescriptor(ACCOUNT_A, source.sourceId)),
    ).toMatchObject({
      _tag: 'SourcePersistenceFailure',
      message: 'Source persistence is unavailable.',
    });
    const insert = makePostgresSourcePersistence(
      fakePersistenceDatabase({}, { insertFailure: new Error('insert failed') })
        .database,
    );
    expect(
      await flip(insert.saveDescriptor(ACCOUNT_A, source, NOW)),
    ).toMatchObject({ _tag: 'SourcePersistenceFailure' });
    const tx = makePostgresSourcePersistence(
      fakePersistenceDatabase(
        {},
        { transactionFailure: new Error('tx failed') },
      ).database,
    );
    expect(
      await flip(
        tx.saveRevision(
          ACCOUNT_A,
          acquiredFrom(source, CANONICAL_TEXT, 'revision-0001'),
          NOW,
        ),
      ),
    ).toMatchObject({ _tag: 'SourcePersistenceFailure' });
  });
});
