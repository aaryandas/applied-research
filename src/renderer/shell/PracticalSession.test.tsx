import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { PracticalWorkspaceBridge } from '../../contracts/practical-records';
import type {
  PracticalActivity,
  PracticalDraft,
} from '../../contracts/practical-work';
import type { CompanionSessionOptions } from '../../contracts/companion';
import { PracticalSession } from './PracticalSession';
import {
  loadedJourney,
  practicalWorkspaceMethods,
} from '../practical/workspace-bridge.fixture';

it('asks with the reopened attempt and exact owned reflection through the mounted AR-19 resolver', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const activity: PracticalActivity = {
    projectId: 'a1234567-1234-4234-8234-123456789012',
    origin: {
      path: {
        pathId: 'b1234567-1234-4234-8234-123456789012',
        pathRevision: 1,
        topicId: 'c1234567-1234-4234-8234-123456789012',
        lessonId: 'd1234567-1234-4234-8234-123456789012',
      },
    },
    title: 'Test a prediction',
    objective: 'Explain a changed case',
    instructions: 'Change one input.',
  };
  const draft: PracticalDraft = {
    prediction: '',
    attempt: '',
    reportedResult: { kind: 'user-reported-text', text: '' },
    selectedEvidence: null,
    reflection: { authorKind: 'human', text: ' My exact saved reflection. ' },
  };
  const attemptId = 'e1234567-1234-4234-8234-123456789012';
  const attempt = {
    attemptId,
    activity,
    currentRevision: 3,
    draft,
    revisions: [],
    returnedEvidence: [],
  };
  const bridge: PracticalWorkspaceBridge = practicalWorkspaceMethods({
    loadPracticalAttempt: async () => ({
      status: 'loaded',
      attempt,
    }),
    loadPracticalJourney: async () => loadedJourney(attempt),
    recordPracticalResult: async () => ({ status: 'failed' }),
    selectPracticalFile: async () => ({ status: 'cancelled' }),
    cancelPracticalFileSelection: async () => {},
  });
  const requestGuidance = vi.fn<CompanionSessionOptions['requestGuidance']>(
    async () => ({
      status: 'answered',
      text: 'Synthetic guidance transport answer.',
    }),
  );
  let revoke = () => {};
  const view = render(
    <PracticalSession
      bridge={bridge}
      toolBridge={{
        openTool: async () => {},
        closeTool: async () => {},
        openExternal: async () => {},
        onToolState: () => () => {},
        resizeTool: async () => {},
      }}
      activity={activity}
      attemptId="f1234567-1234-4234-8234-123456789012"
      registerFlush={() => () => {}}
      registerRevocation={(stop) => {
        revoke = stop ?? (() => {});
      }}
      onReturnToLearning={() => {}}
      requestGuidance={requestGuidance}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: /Your interpretation/ }),
    ).toHaveValue(' My exact saved reflection. '),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(1));
  expect(requestGuidance.mock.calls[0]![0]).toMatchObject({
    requestedTarget: { attemptId, activity, target: 'reflection' },
    pageAccess: 'none',
    context: {
      authorKind: 'human',
      text: ' My exact saved reflection. ',
      version: { kind: 'saved', revision: 3 },
    },
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: /Your interpretation/ }),
    { target: { value: ' My exact unsaved reflection. ' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask about my reflection' }),
  );
  await waitFor(() => expect(requestGuidance).toHaveBeenCalledTimes(2));
  expect(requestGuidance.mock.calls[1]![0]).toMatchObject({
    context: {
      text: ' My exact unsaved reflection. ',
      version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 3 },
    },
  });
  revoke();
  view.unmount();
});
