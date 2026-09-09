import { expect, it } from 'vitest';
import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import {
  createPracticalActivityGuidance,
  type PracticalGuidanceSession,
} from './activity-guidance';

const request: PracticalGuidanceRequest = {
  trigger: 'explicit-action',
  target: {
    scope: 'applied-research',
    surface: 'practical-work',
    attemptId: 'test-attempt',
    target: 'activity-instructions',
    activity: {
      projectId: 'test-project',
      origin: {
        path: {
          pathId: 'test-path',
          pathRevision: 1,
          topicId: 'test-topic',
          lessonId: 'test-lesson',
        },
      },
      title: 'Compare',
      instructions: 'Change one input.',
      objective: 'Explain the change.',
    },
  },
};

it('reports the companion session state and revokes synchronously during a pending start', async () => {
  let observation: 'inactive' | 'starting' | 'active' = 'inactive';
  let received: PracticalGuidanceRequest | null = null;
  let finish!: (value: { status: string }) => void;
  const session: PracticalGuidanceSession = {
    getState: () => ({ observation: { status: observation } }),
    startActivity: (value) => {
      received = value;
      observation = 'starting';
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    stop: () => {
      observation = 'inactive';
    },
  };
  const adapter = createPracticalActivityGuidance(session);
  expect(adapter.status).toBe('idle');
  const starting = adapter.start(request);
  expect(received).toEqual(request);
  expect(adapter.status).toBe('starting');
  const stopping = adapter.stop();
  expect(adapter.status).toBe('idle');
  await stopping;
  finish({ status: 'cancelled' });
  await starting;
  expect(adapter.status).toBe('idle');
});

it('refuses an unexpected start outcome without exposing transport details', async () => {
  const adapter = createPracticalActivityGuidance({
    getState: () => ({ observation: { status: 'inactive' } }),
    startActivity: async () => ({ status: 'unavailable' }),
    stop: () => {},
  });
  await expect(adapter.start(request)).rejects.toThrow(
    'Activity guidance could not start.',
  );
});
