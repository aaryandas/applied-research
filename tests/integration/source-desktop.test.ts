import { expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/workspace-store';
import { SourceDesktopOperations } from '../../src/main/source-desktop';
import { request, acquired } from './source-adoption-fixtures';

it('commits a user-selected acquired source before returning saved and revokes a late project response', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const first = store.create('First'),
      second = store.create('Second');
    const source = acquired();
    let finish!: (value: unknown) => void;
    const operations = new SourceDesktopOperations({
      store,
      authenticated: () => true,
      transport: {
        discover: async () => ({
          outcome: 'success',
          requestId: 'discover-01',
          candidates: [{ ...source, content: { state: 'metadata-only' } }],
        }),
        acquire: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
      openOriginal: async () => {},
    });
    operations.activate(first.id);
    await operations.discover({
      projectId: first.id,
      request: {
        apiVersion: '2026-09-08',
        requestId: 'discover-01',
        query: 'hello',
        kinds: ['paper'],
        intent: 'research',
        limit: 5,
      },
    });
    const pending = operations.acquire({ projectId: first.id, request });
    finish({ outcome: 'success', requestId: request.requestId, source });
    const result = await pending;
    expect(result.outcome).toBe('saved');
    expect(
      store.getLearningWorkspace(first.id).sources[0]?.currentVersion
        .canonicalText,
    ).toBe('hello');
    const late = operations.acquire({
      projectId: first.id,
      request: { ...request, requestId: 'request-two' },
    });
    operations.activate(second.id);
    finish({ outcome: 'success', requestId: 'request-two', source });
    expect(await late).toEqual({
      outcome: 'stale-project',
      requestId: 'request-two',
    });
    expect(store.getLearningWorkspace(second.id).sources).toEqual([]);
  } finally {
    store.close();
  }
});

it('refuses acquisition identities that were not offered by trusted discovery', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Select evidence');
    let downloads = 0;
    const operations = new SourceDesktopOperations({
      store,
      authenticated: () => true,
      transport: {
        discover: async () => {
          throw new Error('unused');
        },
        acquire: async () => {
          downloads++;
          return {
            outcome: 'success',
            requestId: request.requestId,
            source: acquired(),
          };
        },
      },
      openOriginal: async () => {},
    });
    operations.activate(project.id);
    expect(
      (await operations.acquire({ projectId: project.id, request })).outcome,
    ).toBe('not-permitted');
    expect(downloads).toBe(0);
  } finally {
    store.close();
  }
});

it('opens the acknowledged older acquired edition rather than silently selecting the newest edition', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Immutable editions');
    let source = acquired();
    const operations = new SourceDesktopOperations({
      store,
      authenticated: () => true,
      transport: {
        discover: async () => ({
          outcome: 'success',
          requestId: 'discover-01',
          candidates: [{ ...source, content: { state: 'metadata-only' } }],
        }),
        acquire: async (input) => ({
          outcome: 'success',
          requestId: input.requestId,
          source,
        }),
      },
      openOriginal: async () => {},
    });
    operations.activate(project.id);
    await operations.discover({
      projectId: project.id,
      request: {
        apiVersion: '2026-09-08',
        requestId: 'discover-01',
        query: 'hello',
        kinds: ['paper'],
        intent: 'research',
        limit: 5,
      },
    });
    const first = await operations.acquire({ projectId: project.id, request });
    source = structuredClone(source);
    source.content.revision.revisionId = 'edition-2';
    await operations.acquire({ projectId: project.id, request });
    source = acquired();
    const replay = await operations.acquire({ projectId: project.id, request });
    if (first.outcome !== 'saved' || replay.outcome !== 'saved')
      throw new Error('Expected saved editions');
    expect(replay.saved.revisionId).toBe(first.saved.revisionId);
    expect(replay.saved.revisionId).not.toBe(
      store.getLearningWorkspace(project.id).sources[0]!.currentVersionId,
    );
  } finally {
    store.close();
  }
});

it('keeps signed-out and missing transport states unavailable without accepting renderer credentials or saving anything', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Offline');
    let signedIn = false;
    const operations = new SourceDesktopOperations({
      store,
      authenticated: () => signedIn,
      transport: null,
      openOriginal: async () => {},
    });
    const discovery = {
      apiVersion: '2026-09-08',
      requestId: 'discover-01',
      query: 'hello',
      kinds: ['paper'],
      intent: 'research',
      limit: 5,
    };
    expect(
      (await operations.discover({ projectId: project.id, request: discovery }))
        .outcome,
    ).toBe('stale-project');
    operations.activate(project.id);
    expect(
      (await operations.discover({ projectId: project.id, request: discovery }))
        .outcome,
    ).toBe('unauthenticated');
    expect(
      (await operations.acquire({ projectId: project.id, request })).outcome,
    ).toBe('unauthenticated');
    signedIn = true;
    expect(
      (await operations.discover({ projectId: project.id, request: discovery }))
        .outcome,
    ).toBe('unavailable');
    expect(
      (
        await operations.generate({
          projectId: project.id,
          requestId: 'generate-01',
          consent: 'acquire-learning-evidence',
        })
      ).outcome,
    ).toBe('unavailable');
    await expect(
      operations.generate({ projectId: project.id, requestId: 'generate-01' }),
    ).rejects.toThrow();
    expect(store.getLearningWorkspace(project.id).sources).toEqual([]);
  } finally {
    store.close();
  }
});

it('resolves only trusted retained original identities after reopening and refuses foreign or forged links', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Original navigation');
    const source = acquired();
    store.acceptAcquiredSource({
      projectId: project.id,
      request,
      response: { outcome: 'success', requestId: request.requestId, source },
    });
    let opened = '';
    const operations = new SourceDesktopOperations({
      store,
      authenticated: () => false,
      transport: null,
      openOriginal: async (url) => {
        opened = url;
      },
    });
    operations.activate(project.id);
    const target = {
      projectId: project.id,
      sourceId: request.sourceId,
      providerIdentity: request.providerIdentity,
    };
    expect(
      await operations.openOriginal({ ...target, sourceId: 'unknown-source' }),
    ).toBe('unavailable');
    expect(
      await operations.openOriginal({
        ...target,
        providerIdentity: { provider: 'openalex', id: 'W9' },
      }),
    ).toBe('unavailable');
    expect(opened).toBe('');
    expect(await operations.openOriginal(target)).toBe('opened');
    expect(opened).toBe('https://example.org/paper');
    operations.revoke();
    expect(await operations.openOriginal(target)).toBe('unavailable');
  } finally {
    store.close();
  }
});

it('cancels pending discovery and generation and rejects malformed or mismatched backend responses', async () => {
  const store = new WorkspaceStore(':memory:');
  try {
    const project = store.create('Lifetime');
    let finish!: (value: unknown) => void;
    const operations = new SourceDesktopOperations({
      store,
      authenticated: () => true,
      transport: {
        discover: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        acquire: async () => {
          throw new Error('unused');
        },
        generate: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
      openOriginal: async () => {},
    });
    operations.activate(project.id);
    const request = {
      apiVersion: '2026-09-08',
      requestId: 'discover-01',
      query: 'hello',
      kinds: ['paper'],
      intent: 'research',
      limit: 5,
    };
    const search = operations.discover({ projectId: project.id, request });
    operations.cancel({ projectId: project.id, requestId: request.requestId });
    finish(null);
    expect((await search).outcome).toBe('stale-project');
    const invalid = operations.discover({ projectId: project.id, request });
    finish(null);
    expect((await invalid).outcome).toBe('unavailable');
    const input = {
      projectId: project.id,
      requestId: 'generate-01',
      consent: 'acquire-learning-evidence',
    };
    const mismatch = operations.generate(input);
    finish({ outcome: 'sourced', requestId: 'wrong-request' });
    expect((await mismatch).outcome).toBe('save-failed');
    const noEvidence = operations.generate(input);
    finish({ outcome: 'coverage-pending', requestId: input.requestId });
    expect((await noEvidence).outcome).toBe('coverage-pending');
    const late = operations.generate(input);
    operations.revoke();
    finish(null);
    expect((await late).outcome).toBe('stale-project');
  } finally {
    store.close();
  }
});
