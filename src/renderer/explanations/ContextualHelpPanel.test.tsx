import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ContextualHelpPanel } from './ContextualHelpPanel';
import type { ContextualHelpBridge } from './contextual-help-bridge';
import { EXPLANATION_ARTIFACT_CONTRACT_VERSION } from '../../contracts/explanation-artifacts';
import type { RetainedExplanation } from '../../contracts/explanation-artifacts';

const projectId = '10000000-0000-4000-8000-000000000001';
const highlightId = '40000000-0000-4000-8000-000000000001';
const otherHighlightId = '40000000-0000-4000-8000-000000000002';
const sourceRevisionId = '30000000-0000-4000-8000-000000000001';
const explanationId = '21000000-0000-4000-8000-000000000001';
const visualExplanationId = '21000000-0000-4000-8000-000000000002';
const attemptId = '22000000-0000-4000-8000-000000000001';
const visualAttemptId = '22000000-0000-4000-8000-000000000002';
const artifactId = '24000000-0000-4000-8000-000000000001';
const sha256 = 'ab'.repeat(32);
const image =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';

function textRecord(): RetainedExplanation {
  return {
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
  };
}

function visualRecord(): RetainedExplanation {
  return {
    contractVersion: EXPLANATION_ARTIFACT_CONTRACT_VERSION,
    explanationId: visualExplanationId,
    projectId,
    origin: { sourceRevisionId, highlightId },
    intent: 'visual',
    attempts: [
      {
        attemptId: visualAttemptId,
        explanationId: visualExplanationId,
        intent: 'visual',
        status: 'ready',
        requestedAt: '2026-09-09T08:00:00.000Z',
        completedAt: '2026-09-09T08:00:00.000Z',
        humanQuestion: {
          kind: 'app-authored',
          intent: 'explain-this-visually',
        },
        aiResponse: null,
        provenance: null,
        citations: [],
        plan: {
          status: 'supported',
          family: 'weighted-combination',
          parameters: {
            vectors: [
              [2, 1],
              [-1, 2],
            ],
            weights: [3, 1],
            labels: ['First vector', 'Second vector'],
          },
          stages: [{ name: 'Combine', seconds: 2 }],
          caption: 'Weighted sum of two vectors',
          copy: {
            role: 'untrusted-display-copy',
            title: 'Weights',
            quote: null,
          },
          sourceSupport: {
            kind: 'illustrative-assumption',
            note: 'Original geometry.',
          },
          rationale: {
            role: 'untrusted-display-copy',
            text: 'Shows a weighted combination.',
          },
        },
        result: {
          kind: 'clip',
          family: 'weighted-combination',
          assetVersion: 'original-manim-1',
          media: { kind: 'app-retained-media', artifactId },
          verified: {
            sha256,
            mediaType: 'video/mp4',
            bytes: 4096,
            width: 1280,
            height: 720,
            durationSeconds: 10,
            stages: [{ name: 'Combine', seconds: 2 }],
            renderer: {
              name: 'manim-community',
              version: '0.21.0',
              image,
            },
          },
        },
      },
    ],
    usefulAttemptId: visualAttemptId,
    createdAt: '2026-09-09T08:00:00.000Z',
    updatedAt: '2026-09-09T08:00:00.000Z',
  };
}

function makeBridge(
  overrides: Partial<ContextualHelpBridge> = {},
): ContextualHelpBridge {
  return {
    requestContextualHelp: vi.fn(async (input) => ({
      outcome: 'success',
      requestId: input.requestId,
      explanationId,
      attemptId,
    })),
    cancelContextualHelp: vi.fn(async () => undefined),
    loadRetainedExplanation: vi.fn(async () => textRecord()),
    listRetainedExplanations: vi.fn(async () => []),
    saveExplanationSceneState: vi.fn(async (input) => input.state),
    loadExplanationSceneState: vi.fn(async () => null),
    acceptSceneCapture: vi.fn(async () => {
      throw new Error('unused');
    }),
    openRetainedClipMedia: vi.fn(async () => ({ status: 'missing' as const })),
    ...overrides,
  };
}

const askSelection = {
  kind: 'text' as const,
  origin: { sourceRevisionId, highlightId },
  quote: 'weighted combination of values',
};

it('keeps the quote and human draft through loading, failure and retry', async () => {
  let fail = true;
  const bridge = makeBridge({
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
  });
  render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={askSelection}
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
      intent: 'text',
      question: { kind: 'human', text: 'What is a weighted sum here?' },
    }),
  );
});

it('shows a visual result requested from Ask and retries that intent', async () => {
  let fail = true;
  const visual = {
    ...visualRecord(),
    attempts: visualRecord().attempts.map((attempt) => ({
      ...attempt,
      result: null,
    })),
  };
  const bridge = makeBridge({
    requestContextualHelp: vi.fn(async (input) => {
      if (fail) {
        fail = false;
        return {
          outcome: 'unavailable',
          requestId: input.requestId,
          message: 'Planner offline.',
          retryable: true,
        };
      }
      return {
        outcome: 'success',
        requestId: input.requestId,
        explanationId: visualExplanationId,
        attemptId: visualAttemptId,
      };
    }),
    loadRetainedExplanation: vi.fn(async () => visual),
  });
  render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={askSelection}
      active
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Visual explanation' }));
  await screen.findByText('Planner offline.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(screen.getByText('Weighted sum of two vectors')).toBeVisible(),
  );
  expect(bridge.requestContextualHelp).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ intent: 'visual' }),
  );
  expect(bridge.requestContextualHelp).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ intent: 'visual' }),
  );
});

it('shows a text result requested from Visual and retries that intent', async () => {
  let fail = true;
  const bridge = makeBridge({
    requestContextualHelp: vi.fn(async (input) => {
      if (fail) {
        fail = false;
        return {
          outcome: 'unavailable',
          requestId: input.requestId,
          message: 'Tutor offline.',
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
  });
  render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={{
        kind: 'visual',
        origin: { sourceRevisionId, highlightId },
        quote: 'weighted combination of values',
      }}
      active
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Explain this passage' }));
  await screen.findByText('Tutor offline.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(
      screen.getByText('It is a combination of values with weights.'),
    ).toBeVisible(),
  );
  expect(bridge.requestContextualHelp).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ intent: 'text' }),
  );
  expect(bridge.requestContextualHelp).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ intent: 'text' }),
  );
});

it('cancels an in-flight Ask when the selection changes and ignores the late result', async () => {
  let resolveFirst:
    | ((value: {
        outcome: 'success';
        requestId: string;
        explanationId: string;
        attemptId: string;
      }) => void)
    | undefined;
  const first = new Promise<{
    outcome: 'success';
    requestId: string;
    explanationId: string;
    attemptId: string;
  }>((resolve) => {
    resolveFirst = resolve;
  });
  const requestContextualHelp = vi.fn(async (input) => {
    if (requestContextualHelp.mock.calls.length === 1) {
      return first.then(() => ({
        outcome: 'success' as const,
        requestId: input.requestId,
        explanationId,
        attemptId,
      }));
    }
    return {
      outcome: 'success' as const,
      requestId: input.requestId,
      explanationId: '21000000-0000-4000-8000-000000000099',
      attemptId: '22000000-0000-4000-8000-000000000099',
    };
  });
  let releaseCancel: (() => void) | undefined;
  const cancelGate = new Promise<void>((resolve) => {
    releaseCancel = resolve;
  });
  const bridge = makeBridge({
    requestContextualHelp,
    cancelContextualHelp: vi.fn(async () => cancelGate),
    loadRetainedExplanation: vi.fn(
      async (input): Promise<RetainedExplanation | null> =>
        input.explanationId === explanationId
          ? textRecord()
          : {
              ...textRecord(),
              explanationId: input.explanationId,
              origin: { sourceRevisionId, highlightId: otherHighlightId },
              attempts: [
                {
                  ...textRecord().attempts[0]!,
                  result: {
                    kind: 'text-answer' as const,
                    body: 'Later selection answer.',
                    nextAction: 'Write a Note.',
                  },
                },
              ],
            },
    ),
  });
  const { rerender } = render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={askSelection}
      active
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Explain this passage' }));
  await waitFor(() =>
    expect(bridge.requestContextualHelp).toHaveBeenCalledTimes(1),
  );
  const firstId = (bridge.requestContextualHelp as ReturnType<typeof vi.fn>)
    .mock.calls[0]?.[0]?.requestId as string;
  rerender(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={{
        kind: 'text',
        origin: { sourceRevisionId, highlightId: otherHighlightId },
        quote: 'other passage',
      }}
      active
    />,
  );
  await waitFor(() =>
    expect(bridge.cancelContextualHelp).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: firstId }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Explain this passage' }));
  expect(bridge.requestContextualHelp).toHaveBeenCalledTimes(1);
  releaseCancel?.();
  await waitFor(() =>
    expect(bridge.requestContextualHelp).toHaveBeenCalledTimes(2),
  );
  resolveFirst?.({
    outcome: 'success',
    requestId: firstId,
    explanationId,
    attemptId,
  });
  await waitFor(() =>
    expect(screen.getByText('Later selection answer.')).toBeVisible(),
  );
  expect(
    screen.queryByText('It is a combination of values with weights.'),
  ).toBeNull();
});

it('keeps a previous useful Ask when a later Visual request is cancelled by selection change', async () => {
  const visualHold = new Promise<never>(() => undefined);
  const bridge = makeBridge({
    listRetainedExplanations: vi.fn(async () => [textRecord()]),
    loadRetainedExplanation: vi.fn(async () => textRecord()),
    requestContextualHelp: vi.fn(async () => visualHold),
  });
  const { rerender } = render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={askSelection}
      active
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByText('It is a combination of values with weights.'),
    ).toBeVisible(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Visual explanation' }));
  await waitFor(() =>
    expect(bridge.requestContextualHelp).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'visual' }),
    ),
  );
  rerender(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={{
        kind: 'text',
        origin: { sourceRevisionId, highlightId: otherHighlightId },
        quote: 'other passage',
      }}
      active
    />,
  );
  await waitFor(() => expect(bridge.cancelContextualHelp).toHaveBeenCalled());
  rerender(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={askSelection}
      active
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByText('It is a combination of values with weights.'),
    ).toBeVisible(),
  );
  expect(bridge.requestContextualHelp).toHaveBeenCalledTimes(1);
});

it('reopens a retained explanation by identity without a new paid request', async () => {
  const visual = visualRecord();
  const bridge = makeBridge({
    listRetainedExplanations: vi.fn(async () => [visual]),
    loadRetainedExplanation: vi.fn(async () => visual),
    openRetainedClipMedia: vi.fn(async () => ({
      status: 'ready' as const,
      objectUrl: 'blob:http://localhost/clip',
    })),
  });
  render(
    <ContextualHelpPanel
      projectId={projectId}
      projectGeneration={1}
      requestGeneration={0}
      bridge={bridge}
      selection={{
        kind: 'visual',
        origin: { sourceRevisionId, highlightId },
        quote: 'weighted combination of values',
      }}
      openExplanationId={visualExplanationId}
      active
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Retained explanation clip' }),
    ).toBeVisible(),
  );
  expect(screen.getByText('Weighted sum of two vectors')).toBeVisible();
  expect(bridge.requestContextualHelp).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(bridge.openRetainedClipMedia).toHaveBeenCalledWith({
      projectId,
      artifactId,
    }),
  );
  expect(
    screen.queryByText(/Manim playback is not mounted/),
  ).not.toBeInTheDocument();
});
