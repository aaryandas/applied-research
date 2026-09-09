import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import {
  LEARNING_ONBOARDING_CHANNELS,
  LEARNING_ONBOARDING_RESUME_CHANNELS,
} from '../contracts/learning-onboarding';
import { CONTEXTUAL_HELP_CHANNELS } from '../contracts/contextual-help-desktop';
import { SOURCE_CHANNELS } from '../contracts/source-desktop';

vi.mock('electron', () => {
  const ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const contextBridge = {
    exposeInMainWorld: vi.fn(),
  };
  return { ipcRenderer, contextBridge };
});

describe('preload named desktop bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(contextBridge.exposeInMainWorld).mockReset();
  });

  it('maps onboarding, resume and contextual operations to named channels', async () => {
    await import('./index');
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'desktop',
      expect.any(Object),
    );
    const desktop = vi.mocked(contextBridge.exposeInMainWorld).mock
      .calls[0]![1] as {
      getLearnerProfile: () => Promise<unknown>;
      proposeCourse: (input: unknown) => Promise<unknown>;
      getContinueLearning: () => Promise<unknown>;
      saveReadingResume: (input: unknown) => Promise<unknown>;
      requestContextualHelp: (input: unknown) => Promise<unknown>;
      loadTrustedSceneCapture: (input: unknown) => Promise<unknown>;
      activateSourceWorkspace: (projectId: string) => Promise<unknown>;
    };
    await desktop.getLearnerProfile();
    await desktop.proposeCourse({ projectId: 'p', requestId: 'r' });
    await desktop.getContinueLearning();
    await desktop.saveReadingResume({ projectId: 'p' });
    await desktop.requestContextualHelp({ requestId: 'r' });
    await desktop.loadTrustedSceneCapture({
      projectId: 'p',
      captureId: 'c',
    });
    await desktop.activateSourceWorkspace('project');
    const channels = vi
      .mocked(ipcRenderer.invoke)
      .mock.calls.map((call) => call[0]);
    expect(channels).toEqual([
      LEARNING_ONBOARDING_CHANNELS.getProfile,
      LEARNING_ONBOARDING_CHANNELS.propose,
      LEARNING_ONBOARDING_RESUME_CHANNELS.getContinueLearning,
      LEARNING_ONBOARDING_RESUME_CHANNELS.saveReadingResume,
      CONTEXTUAL_HELP_CHANNELS.request,
      CONTEXTUAL_HELP_CHANNELS.loadCapture,
      SOURCE_CHANNELS.activate,
    ]);
  });
});
