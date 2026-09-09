import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccountingFailure } from '../accounting.js';
import { makeMemoryGenerationEvalBudget } from '../generation-eval.js';
import { adaptGenerationEvalLedger } from './generation-eval-adapter.js';

describe('generation-eval ledger adapter', () => {
  it('maps reserved admit onto the producer seam and settles known zero', async () => {
    const budget = makeMemoryGenerationEvalBudget({
      dispatchLimit: 10,
      limitMicrousd: 2_000_000,
    });
    const ledger = adaptGenerationEvalLedger(budget);
    const admitted = await Effect.runPromise(
      ledger.admit({
        requestId: 'request-eval-01',
        inputHash: 'a'.repeat(64),
        reservationMicrousd: 10,
      }),
    );
    expect(admitted).toEqual({ kind: 'admit' });
    await Effect.runPromise(
      ledger.settle({
        requestId: 'request-eval-01',
        inputHash: 'a'.repeat(64),
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 0 },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(1);
    const snap = await Effect.runPromise(budget.inspect());
    expect(snap.dispatchCommitted).toBe(1);
    expect(snap.committedMicrousd).toBe(0);
  });

  it('releases predispatch cancel, retains unknown dispatched charge, and exhausts the shared cap', async () => {
    const budget = makeMemoryGenerationEvalBudget({
      dispatchLimit: 1,
      limitMicrousd: 2_000_000,
    });
    const ledger = adaptGenerationEvalLedger(budget);
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-02',
          inputHash: 'b'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'admit' });
    await Effect.runPromise(
      ledger.settle({
        requestId: 'request-eval-02',
        inputHash: 'b'.repeat(64),
        dispatched: false,
        charge: { kind: 'none' },
        cancelled: true,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(0);
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-03',
          inputHash: 'c'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'admit' });
    await Effect.runPromise(
      ledger.settle({
        requestId: 'request-eval-03',
        inputHash: 'c'.repeat(64),
        dispatched: true,
        charge: { kind: 'unknown' },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(1);
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-04',
          inputHash: 'd'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'exhausted' });
  });

  it('maps postgres orDie defects to typed AccountingFailure', async () => {
    const ledger = adaptGenerationEvalLedger({
      inspect: () => Effect.die(new Error('inspect failed')),
      admit: () => Effect.die(new Error('admission failed')),
    });
    const exit = await Effect.runPromiseExit(
      ledger.admit({
        requestId: 'request-eval-05',
        inputHash: 'e'.repeat(64),
        reservationMicrousd: 10,
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const failure = exit.cause;
    expect(JSON.stringify(failure)).toContain('AccountingFailure');
    await expect(
      Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-05',
          inputHash: 'e'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).rejects.toBeInstanceOf(AccountingFailure);
  });

  it('maps conflict and in-progress, no-ops a missing reservation, and settles known spend', async () => {
    const budget = makeMemoryGenerationEvalBudget({
      dispatchLimit: 2,
      limitMicrousd: 2_000_000,
    });
    const ledger = adaptGenerationEvalLedger(budget);
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-06',
          inputHash: 'f'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'admit' });
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-06',
          inputHash: 'g'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-06',
          inputHash: 'f'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'in-progress' });
    await Effect.runPromise(
      ledger.settle({
        requestId: 'request-eval-06',
        inputHash: 'f'.repeat(64),
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 7 },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(1);
    const snap = await Effect.runPromise(budget.inspect());
    expect(snap.committedMicrousd).toBe(7);
    await Effect.runPromise(
      ledger.settle({
        requestId: 'request-eval-missing',
        inputHash: 'h'.repeat(64),
        dispatched: true,
        charge: { kind: 'known', actualMicrousd: 7 },
        cancelled: false,
      }),
    );
    expect(ledger.physicalDispatchCount()).toBe(1);
  });

  it('settles a dispatched none charge at zero without retaining the reservation', async () => {
    const budget = makeMemoryGenerationEvalBudget({
      dispatchLimit: 2,
      limitMicrousd: 2_000_000,
    });
    const ledger = adaptGenerationEvalLedger(budget);
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-07',
          inputHash: 'i'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'admit' });
    await Effect.runPromise(
      ledger.settle({
        requestId: 'request-eval-07',
        inputHash: 'i'.repeat(64),
        dispatched: true,
        charge: { kind: 'none' },
        cancelled: false,
      }),
    );
    const snap = await Effect.runPromise(budget.inspect());
    expect(snap.dispatchCommitted).toBe(1);
    expect(snap.committedMicrousd).toBe(0);
    expect(snap.reservedMicrousd).toBe(0);
  });

  it('maps settlement defects to typed AccountingFailure', async () => {
    const ledger = adaptGenerationEvalLedger({
      inspect: () =>
        Effect.succeed({
          committedMicrousd: 0,
          reservedMicrousd: 0,
          limitMicrousd: 2_000_000,
          dispatchCommitted: 0,
          dispatchReserved: 0,
          dispatchLimit: 2,
        }),
      admit: () =>
        Effect.succeed({
          kind: 'reserved',
          reservation: {
            release: () => Effect.die(new Error('release failed')),
            settle: () => Effect.die(new Error('settle failed')),
            retain: () => Effect.die(new Error('retain failed')),
          },
        }),
    });
    expect(
      await Effect.runPromise(
        ledger.admit({
          requestId: 'request-eval-08',
          inputHash: 'j'.repeat(64),
          reservationMicrousd: 10,
        }),
      ),
    ).toEqual({ kind: 'admit' });
    await expect(
      Effect.runPromise(
        ledger.settle({
          requestId: 'request-eval-08',
          inputHash: 'j'.repeat(64),
          dispatched: true,
          charge: { kind: 'known', actualMicrousd: 1 },
          cancelled: false,
        }),
      ),
    ).rejects.toBeInstanceOf(AccountingFailure);
  });
});
