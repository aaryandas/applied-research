import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type {
  SourceDesktopBridge,
  SourceGenerationResult,
} from '../../contracts/source-desktop';
import { fixture } from '../reader/reader.test.fixtures';
import { SourceLearningEntry } from './SourceLearningEntry';
function setup(
  generate: SourceDesktopBridge['generateSourcedLearning'],
  flush = async () => true,
) {
  const { workspace } = fixture();
  const bridge = {
    generateSourcedLearning: vi.fn(generate),
    cancelSourceOperation: vi.fn(async () => {}),
    getLearningWorkspace: vi.fn(async () => workspace),
  };
  const saved = vi.fn();
  const view = render(
    <SourceLearningEntry
      projectId={workspace.project.id}
      bridge={bridge}
      flush={flush}
      onSaved={saved}
    />,
  );
  const start = () =>
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Build path using acquired evidence',
      }),
    );
  return { bridge, saved, view, start, workspace };
}
it.each(['coverage-pending', 'unavailable', 'save-failed'] as const)(
  'shows %s honestly without publishing a saved path',
  async (outcome) => {
    const { start, saved } = setup(async (input) => ({
      outcome,
      requestId: input.requestId,
    }));
    start();
    await screen.findByRole('status');
    expect(saved).not.toHaveBeenCalled();
  },
);
it('waits for a committed path and loaded workspace before opening it', async () => {
  const { start, saved, workspace } = setup(async (input) => ({
    outcome: 'saved',
    requestId: input.requestId,
    pathId: 'saved-path',
    pathRevision: 1,
  }));
  start();
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(workspace, 'saved-path'),
  );
});
it('does not start acquisition when the human draft save is blocked', async () => {
  const { start, bridge } = setup(
    async (input) => ({ outcome: 'unavailable', requestId: input.requestId }),
    async () => false,
  );
  start();
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Build path using acquired evidence',
      }),
    ).toBeEnabled(),
  );
  expect(bridge.generateSourcedLearning).not.toHaveBeenCalled();
});
it('cancels or disposes without adopting a late generation response', async () => {
  let finish!: (value: SourceGenerationResult) => void;
  const { start, bridge, saved, view } = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  start();
  await waitFor(() =>
    expect(bridge.generateSourcedLearning).toHaveBeenCalled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Cancel path generation' }),
  );
  await act(async () =>
    finish({
      outcome: 'saved',
      requestId: 'late',
      pathId: 'wrong',
      pathRevision: 1,
    }),
  );
  expect(saved).not.toHaveBeenCalled();
  start();
  await waitFor(() =>
    expect(bridge.generateSourcedLearning).toHaveBeenCalledTimes(2),
  );
  view.unmount();
  await act(async () =>
    finish({
      outcome: 'saved',
      requestId: 'late',
      pathId: 'wrong',
      pathRevision: 1,
    }),
  );
  expect(saved).not.toHaveBeenCalled();
  expect(bridge.cancelSourceOperation).toHaveBeenCalledTimes(2);
});
it('retains a retry action after transport failure', async () => {
  const { start } = setup(async () => {
    throw new Error('Synthetic transport refusal');
  });
  start();
  expect(await screen.findByRole('status')).toHaveTextContent(
    'could not be saved',
  );
  expect(
    screen.getByRole('button', { name: 'Build path using acquired evidence' }),
  ).toBeEnabled();
});
