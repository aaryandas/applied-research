import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ContextualHelpPanel } from './ContextualHelpPanel';
import type { ContextualHelpBridge } from './contextual-help-bridge';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../../contracts/explanation-artifacts';
import type { RetainedExplanation } from '../../contracts/explanation-artifacts';

const projectId = '10000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const explanationId = '21000000-0000-4000-8000-000000000001';
const attemptId = '22000000-0000-4000-8000-000000000001';

it('keeps the quote and human draft through loading, failure and retry', async () => {
  let fail = true;
  const bridge: ContextualHelpBridge = {
    requestContextualHelp: vi.fn(async (input) => {
      if (fail) {
        fail = false;
        return {
          outcome: 'unavailable',
          requestId: input.requestId,
          message: 'Offline.',
          retryable: true,
        };
      }
      return {
        outcome: 'success',
        requestId: input.requestId,
        explanationId,
        attemptId,
      };
    }),
    cancelContextualHelp: vi.fn(async () => undefined),
    loadRetainedExplanation: vi.fn(
      async (): Promise<RetainedExplanation | null> => ({
        contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
        explanationId,
        projectId,
        origin: { sourceRevisionId, highlightId },
        intent: 'text',
        attempts: [
          {
            attemptId,
            explanationId,
            intent: 'text',
            status: 'ready',
            requestedAt: '2026-09-09T08:00:00.000Z',
            completedAt: '2026-09-09T08:00:00.000Z',
            humanQuestion: {
              kind: 'human',
              text: 'What is a weighted sum here?',
            },
            aiResponse: {
              kind: 'ai',
              body: 'It is a combination of values with weights.',
              nextAction: 'Write a Note.',
            },
            provenance: null,
            citations: [],
            plan: null,
            result: {
              kind: 'text-answer',
              body: 'It is a combination of values with weights.',
              nextAction: 'Write a Note.',
            },
          },
        ],
        usefulAttemptId: attemptId,
        createdAt: '2026-09-09T08:00:00.000Z',
        updatedAt: '2026-09-09T08:00:00.000Z',
      }),
    ),
    listRetainedExplanations: vi.fn(async () => []),
    saveExplanationSceneState: vi.fn(async (input) => input.state),
    loadExplanationSceneState: vi.fn(async () => null),
    acceptSceneCapture: vi.fn(async () => {
      throw new Error('unused');
    }),
    loadTrustedSceneCapture: vi.fn(async () => null),
  };
  render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={{
        kind: 'text',
        origin: { sourceRevisionId, highlightId },
        quote: 'weighted combination of values',
      }}
      active
    />,
  );
  expect(screen.getByText('weighted combination of values')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'What is a weighted sum here?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask this question' }));
  await screen.findByText('Offline.');
  expect(screen.getByLabelText('Your question')).toHaveValue(
    'What is a weighted sum here?',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(
      screen.getByText('It is a combination of values with weights.'),
    ).toBeVisible(),
  );
  expect(screen.getByLabelText('Your question')).toHaveValue(
    'What is a weighted sum here?',
  );
  expect(bridge.requestContextualHelp).toHaveBeenCalledWith(
    expect.objectContaining({
      question: { kind: 'human', text: 'What is a weighted sum here?' },
      untrustedSelection: {
        role: 'untrusted-display-copy',
        quote: 'weighted combination of values',
      },
    }),
  );
});
