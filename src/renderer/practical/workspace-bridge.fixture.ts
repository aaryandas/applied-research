import {
  EMPTY_PRACTICAL_JOURNEY,
  type LoadPracticalJourneyResult,
  type PracticalAttemptRecord,
  type PracticalWorkspaceBridge,
} from '../../contracts/practical-records';

export function practicalWorkspaceMethods(
  overrides: Partial<PracticalWorkspaceBridge> = {},
): PracticalWorkspaceBridge {
  return {
    loadPracticalAttempt: async () => ({
      status: 'loaded' as const,
      attempt: null,
    }),
    loadPracticalJourney: async () => ({
      status: 'loaded' as const,
      attempt: null,
      attempts: [],
      journey: EMPTY_PRACTICAL_JOURNEY,
    }),
    recordPracticalResult: async () => ({ status: 'failed' as const }),
    selectPracticalFile: async () => ({ status: 'cancelled' as const }),
    cancelPracticalFileSelection: async () => {},
    listPracticalAttempts: async () => ({
      status: 'loaded' as const,
      attempts: [],
    }),
    previewPracticalFile: async () => ({ status: 'unavailable' as const }),
    exportPracticalFile: async () => ({ status: 'cancelled' as const }),
    cancelPracticalExport: async () => {},
    recordPracticalProgress: async () => ({ status: 'failed' as const }),
    recordPracticalWorkChoice: async () => ({ status: 'failed' as const }),
    savePracticalHumanPlan: async () => ({ status: 'failed' as const }),
    ...overrides,
  };
}

export function loadedJourney(
  attempt: PracticalAttemptRecord | null,
): Extract<LoadPracticalJourneyResult, { status: 'loaded' }> {
  return {
    status: 'loaded' as const,
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
