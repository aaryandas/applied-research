import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import type { PracticalActivityGuidance } from './ActivityGuidanceControls';

/** Structural subset of AR-25 CompanionSession; observation/context policy stays there. */
export interface PracticalGuidanceSession {
  getState(): { observation: { status: 'inactive' | 'starting' | 'active' } };
  startActivity(request: PracticalGuidanceRequest): Promise<{ status: string }>;
  stop(reason: 'user-stop'): void;
}

/** Keep this adapter stable per mounted session; companion state changes rerender its owner. */
export function createPracticalActivityGuidance(
  session: PracticalGuidanceSession,
): PracticalActivityGuidance {
  return {
    get status() {
      const status = session.getState().observation.status;
      return status === 'inactive' ? 'idle' : status;
    },
    async start(request) {
      const outcome = await session.startActivity(structuredClone(request));
      if (
        outcome.status !== 'answered' &&
        outcome.status !== 'cancelled' &&
        outcome.status !== 'ignored'
      )
        throw new Error('Activity guidance could not start.');
    },
    async stop() {
      // No await before revocation: stop also cancels a start still awaiting context/AI.
      session.stop('user-stop');
    },
  };
}
