import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeMemorySourceOperations } from './operations.js';

describe('source operation idempotency', () => {
  it('retains uncertain paid work and refuses blind retry of changed input', async () => {
    const store = makeMemorySourceOperations();
    const now = new Date('2026-09-09T00:00:00.000Z');
    const first = await Effect.runPromise(
      store.begin({
        accountId: 'account-a',
        requestId: 'sourced-01',
        kind: 'sourced',
        inputHash: 'hash-a',
        now,
      }),
    );
    expect(first.kind).toBe('reserved');
    await Effect.runPromise(
      store.retain({
        accountId: 'account-a',
        requestId: 'sourced-01',
        publicResponse: {
          outcome: 'coverage-pending',
          requestId: 'sourced-01',
        },
        now,
      }),
    );
    const replay = await Effect.runPromise(
      store.begin({
        accountId: 'account-a',
        requestId: 'sourced-01',
        kind: 'sourced',
        inputHash: 'hash-a',
        now,
      }),
    );
    expect(replay.kind).toBe('uncertain');
    const conflict = await Effect.runPromise(
      store.begin({
        accountId: 'account-a',
        requestId: 'sourced-01',
        kind: 'sourced',
        inputHash: 'hash-b',
        now,
      }),
    );
    expect(conflict.kind).toBe('conflict');
  });
});
