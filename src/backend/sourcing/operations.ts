import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Data, Effect } from 'effect';
import type { LearningRequest } from '../../contracts/learning-api.js';
import type { DatabaseService } from '../database.js';
import { sourceOperation as sourceOperationTable } from '../schema.js';

export type SourceOperationKind = 'discover' | 'acquire' | 'sourced';
export type SourceOperationState = 'in-progress' | 'completed' | 'uncertain';

export class SourceOperationFailure extends Data.TaggedError(
  'SourceOperationFailure',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface SourceOperationRecord {
  readonly inputHash: string;
  readonly state: SourceOperationState;
  readonly publicResponse: unknown | null;
  readonly frozenPayload: unknown | null;
}

export type SourceOperationDecision =
  | { readonly kind: 'reserved' }
  | { readonly kind: 'duplicate'; readonly record: SourceOperationRecord }
  | { readonly kind: 'in-progress'; readonly record: SourceOperationRecord }
  | { readonly kind: 'uncertain'; readonly record: SourceOperationRecord }
  | { readonly kind: 'conflict' };

export interface SourceOperationStore {
  readonly begin: (input: {
    accountId: string;
    requestId: string;
    kind: SourceOperationKind;
    inputHash: string;
    now: Date;
  }) => Effect.Effect<SourceOperationDecision, SourceOperationFailure>;
  readonly freeze: (input: {
    accountId: string;
    requestId: string;
    frozenPayload: unknown;
    now: Date;
  }) => Effect.Effect<void, SourceOperationFailure>;
  readonly complete: (input: {
    accountId: string;
    requestId: string;
    publicResponse: unknown;
    now: Date;
  }) => Effect.Effect<void, SourceOperationFailure>;
  readonly retain: (input: {
    accountId: string;
    requestId: string;
    publicResponse: unknown;
    now: Date;
  }) => Effect.Effect<void, SourceOperationFailure>;
}

export function clientVisibleLearningHash(request: LearningRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        apiVersion: request.apiVersion,
        requestId: request.requestId,
        model: request.model,
        operation: request.operation,
      }),
    )
    .digest('hex');
}

export function clientVisibleInputHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function operationEffect<A>(
  operation: () => Promise<A>,
): Effect.Effect<A, SourceOperationFailure> {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) =>
      new SourceOperationFailure({
        message: 'Source request accounting is unavailable.',
        cause,
      }),
  });
}

interface MemorySourceOperationRow {
  kind: string;
  inputHash: string;
  state: SourceOperationState;
  publicResponse: unknown | null;
  frozenPayload: unknown | null;
}

export function makeMemorySourceOperations(): SourceOperationStore {
  const rows = new Map<string, MemorySourceOperationRow>();
  const keyFor = (accountId: string, requestId: string): string =>
    `${accountId}\0${requestId}`;
  return {
    begin(input) {
      return Effect.sync(() => {
        const key = keyFor(input.accountId, input.requestId);
        const existing = rows.get(key);
        if (existing) {
          if (existing.inputHash !== input.inputHash)
            return { kind: 'conflict' } as const;
          if (existing.state === 'in-progress')
            return { kind: 'in-progress', record: existing } as const;
          if (existing.state === 'uncertain')
            return { kind: 'uncertain', record: existing } as const;
          return { kind: 'duplicate', record: existing } as const;
        }
        rows.set(key, {
          kind: input.kind,
          inputHash: input.inputHash,
          state: 'in-progress',
          publicResponse: null,
          frozenPayload: null,
        });
        return { kind: 'reserved' } as const;
      });
    },
    freeze(input) {
      return Effect.sync(() => {
        const row = rows.get(keyFor(input.accountId, input.requestId));
        if (row) row.frozenPayload = input.frozenPayload;
      });
    },
    complete(input) {
      return Effect.sync(() => {
        const row = rows.get(keyFor(input.accountId, input.requestId));
        if (row) {
          row.state = 'completed';
          row.publicResponse = input.publicResponse;
        }
      });
    },
    retain(input) {
      return Effect.sync(() => {
        const row = rows.get(keyFor(input.accountId, input.requestId));
        if (row) {
          row.state = 'uncertain';
          row.publicResponse = input.publicResponse;
        }
      });
    },
  };
}

function toRecord(row: {
  inputHash: string;
  state: string;
  publicResponse: unknown;
  frozenPayload: unknown;
}): SourceOperationRecord {
  return {
    inputHash: row.inputHash,
    state: row.state as SourceOperationState,
    publicResponse: row.publicResponse,
    frozenPayload: row.frozenPayload,
  };
}

export function makePostgresSourceOperations(
  database: DatabaseService,
): SourceOperationStore {
  return {
    begin(input) {
      return operationEffect(async () =>
        database.db.transaction(async (transaction) => {
          const inserted = await transaction
            .insert(sourceOperationTable)
            .values({
              accountId: input.accountId,
              requestId: input.requestId,
              kind: input.kind,
              inputHash: input.inputHash,
              state: 'in-progress',
              publicResponse: null,
              frozenPayload: null,
              createdAt: input.now,
              updatedAt: input.now,
            })
            .onConflictDoNothing()
            .returning();
          if (inserted[0]) return { kind: 'reserved' } as const;
          const [existing] = await transaction
            .select()
            .from(sourceOperationTable)
            .where(
              and(
                eq(sourceOperationTable.accountId, input.accountId),
                eq(sourceOperationTable.requestId, input.requestId),
              ),
            )
            .for('update');
          if (!existing) throw new Error('Source operation was not created.');
          if (existing.inputHash !== input.inputHash)
            return { kind: 'conflict' } as const;
          const record = toRecord(existing);
          if (existing.state === 'in-progress')
            return { kind: 'in-progress', record } as const;
          if (existing.state === 'uncertain')
            return { kind: 'uncertain', record } as const;
          return { kind: 'duplicate', record } as const;
        }),
      );
    },
    freeze(input) {
      return operationEffect(async () => {
        await database.db
          .update(sourceOperationTable)
          .set({
            frozenPayload: input.frozenPayload,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(sourceOperationTable.accountId, input.accountId),
              eq(sourceOperationTable.requestId, input.requestId),
            ),
          );
      });
    },
    complete(input) {
      return operationEffect(async () => {
        await database.db
          .update(sourceOperationTable)
          .set({
            state: 'completed',
            publicResponse: input.publicResponse,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(sourceOperationTable.accountId, input.accountId),
              eq(sourceOperationTable.requestId, input.requestId),
            ),
          );
      });
    },
    retain(input) {
      return operationEffect(async () => {
        await database.db
          .update(sourceOperationTable)
          .set({
            state: 'uncertain',
            publicResponse: input.publicResponse,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(sourceOperationTable.accountId, input.accountId),
              eq(sourceOperationTable.requestId, input.requestId),
            ),
          );
      });
    },
  };
}
