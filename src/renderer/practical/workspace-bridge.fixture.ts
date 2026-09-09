import {
  EMPTY_PRACTICAL_JOURNEY,
  type PracticalAttemptRecord,
  type PracticalWorkspaceBridge,
} from '../../contracts/practical-records';

export function practicalWorkspaceMethods(
  overrides: Partial<PracticalWorkspaceBridge> = {},
): PracticalWorkspaceBridge {
  return {
    loadPracticalAttempt: async () => ({ status: 'loaded', attempt: null }),
    loadPracticalJourney: async () => ({
      status: 'loaded',
      attempt: null,
      attempts: [],
      journey: EMPTY_PRACTICAL_JOURNEY,
    }),
    recordPracticalResult: async () => ({ status: 'failed' }),
    selectPracticalFile: async () => ({ status: 'cancelled' }),
    cancelPracticalFileSelection: async () => {},
    listPracticalAttempts: async () => ({ status: 'loaded', attempts: [] }),
    previewPracticalFile: async () => ({ status: 'unavailable' }),
    exportPracticalFile: async () => ({ status: 'cancelled' }),
    cancelPracticalExport: async () => {},
    recordPracticalProgress: async () => ({ status: 'failed' }),
    recordPracticalWorkChoice: async () => ({ status: 'failed' }),
    savePracticalHumanPlan: async () => ({ status: 'failed' }),
    ...overrides,
  };
}

export function loadedJourney(
  attempt: PracticalAttemptRecord | null,
): Awaited<ReturnType<PracticalWorkspaceBridge['loadPracticalJourney']>> {
  return {
    status: 'loaded',
    attempt,
    attempts: attempt
      ? [
          {
            attemptId: attempt.attemptId,
            currentRevision: attempt.currentRevision,
            updatedAt: '2026-09-09T01:00:00Z',
            fileCount: attempt.returnedEvidence.length,
          },
        ]
      : [],
    journey: EMPTY_PRACTICAL_JOURNEY,
  };
}
