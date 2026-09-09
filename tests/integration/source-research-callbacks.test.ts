import { expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/workspace-store';
import { createResearchCallbacks } from '../../src/renderer/shell/research-callbacks';

it('blocks exact retained revision navigation until drafts flush, and refuses missing editions', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Read exactly');
    const result = store.importTextSource({
      projectId: project.id,
      expectedRevision: 0,
      title: 'Original',
      text: 'Exact human text',
      acquiredAt: '2026-09-09T00:00:00.000Z',
    });
    if (result.status !== 'committed') throw new Error('Missing fixture');
    let allow = false,
      opened = '';
    const callbacks = createResearchCallbacks({
      projectId: project.id,
      isCurrent: () => true,
      bridge: {
        getLearningWorkspace: async (id) => store.getLearningWorkspace(id),
        discoverSources: async () => {
          throw new Error('unused');
        },
        acquireAndSaveSource: async () => {
          throw new Error('unused');
        },
        cancelSourceOperation: async () => {},
        openSourceOriginal: async () => 'unavailable',
        activateSourceWorkspace: async () => {},
      },
      flush: async () => allow,
      openSaved: (_workspace, target) => {
        opened = target.revisionId;
      },
    });
    const target = {
      projectId: project.id,
      sourceId: result.record.id,
      revisionId: result.record.currentVersionId,
      question: 'Why?',
      origin: null,
    };
    expect(await callbacks.onOpenReader(target)).toBe('blocked');
    expect(opened).toBe('');
    allow = true;
    expect(
      await callbacks.onOpenReader({ ...target, revisionId: 'missing' }),
    ).toBe('missing-source');
    expect(opened).toBe('');
    expect(await callbacks.onOpenReader(target)).toBe('opened');
    expect(opened).toBe(target.revisionId);
  } finally {
    store.close();
  }
});

it('forwards explicit cancellation, blocks research on an unsaved draft, and ignores responses after project disposal', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Research lifetime');
    let current = true,
      allow = true,
      cancelled = '';
    let finish!: (value: {
      outcome: 'no-results';
      requestId: string;
      message: 'No source candidates were found.';
    }) => void;
    const callbacks = createResearchCallbacks({
      projectId: project.id,
      isCurrent: () => current,
      flush: async () => allow,
      openSaved: () => {},
      bridge: {
        activateSourceWorkspace: async () => {},
        getLearningWorkspace: async () =>
          store.getLearningWorkspace(project.id),
        discoverSources: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        acquireAndSaveSource: async (input) => ({
          outcome: 'save-failed',
          requestId: input.request.requestId,
        }),
        cancelSourceOperation: async (input) => {
          cancelled = input.requestId;
        },
        openSourceOriginal: async () => 'opened',
      },
    });
    const request = {
      apiVersion: '2026-09-08' as const,
      requestId: 'discover-01',
      query: 'Why?',
      intent: 'research' as const,
      kinds: ['paper' as const],
      limit: 5,
    };
    const controller = new AbortController();
    const operation = {
      context: { projectId: project.id, origin: null },
      question: 'Why?',
      signal: controller.signal,
    };
    const pending = callbacks.onDiscover(request, operation);
    await Promise.resolve();
    controller.abort();
    finish({
      outcome: 'no-results',
      requestId: request.requestId,
      message: 'No source candidates were found.',
    });
    expect((await pending).outcome).toBe('stale-project');
    expect(cancelled).toBe('discover-01');
    allow = false;
    await expect(
      callbacks.onDiscover(request, {
        ...operation,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Save current work');
    const target = {
      projectId: project.id,
      sourceId: 'remote-source',
      providerIdentity: { provider: 'openalex' as const, id: 'W1' as const },
    };
    expect(await callbacks.onOpenOriginal(target)).toBe('unavailable');
    allow = true;
    expect(await callbacks.onOpenOriginal(target)).toBe('opened');
    current = false;
    expect((await callbacks.onDiscover(request, operation)).outcome).toBe(
      'stale-project',
    );
    expect(
      await callbacks.onOpenReader({
        projectId: project.id,
        sourceId: 'missing',
        revisionId: 'missing',
        question: '',
        origin: null,
      }),
    ).toBe('stale-project');
  } finally {
    store.close();
  }
});
