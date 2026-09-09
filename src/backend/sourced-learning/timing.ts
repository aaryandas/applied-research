import { Effect } from 'effect';

export interface SourcedLearningTimings {
  retrievalMs: number;
  generationMs: number;
  verificationMs: number;
  backendTotalMs: number;
  firstUsefulBackendMs: number | null;
  loadingMs: null;
  requestToFirstUsefulStepMs: null;
  goalMs: 20000;
}

export function emptyTimings(): SourcedLearningTimings {
  return {
    retrievalMs: 0,
    generationMs: 0,
    verificationMs: 0,
    backendTotalMs: 0,
    firstUsefulBackendMs: null,
    loadingMs: null,
    requestToFirstUsefulStepMs: null,
    goalMs: 20_000,
  };
}

export function learningTiming(now: () => number): {
  measure<A, E>(
    phase: 'retrievalMs' | 'generationMs' | 'verificationMs',
    work: Effect.Effect<A, E>,
  ): Effect.Effect<A, E>;
  finish(useful: boolean): SourcedLearningTimings;
} {
  const timings = emptyTimings();
  const started = now();
  return {
    measure: (phase, work) =>
      Effect.suspend(() => {
        const phaseStarted = now();
        return work.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              timings[phase] += Math.max(0, now() - phaseStarted);
            }),
          ),
        );
      }),
    finish: (useful) => {
      const backendTotalMs = Math.max(0, now() - started);
      return {
        ...timings,
        backendTotalMs,
        firstUsefulBackendMs: useful ? backendTotalMs : null,
      };
    },
  };
}

export type LearningTiming = ReturnType<typeof learningTiming>;
