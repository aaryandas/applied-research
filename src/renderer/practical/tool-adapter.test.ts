import { afterEach, expect, it, vi } from 'vitest';
import type { ToolState } from '../../contracts/workspace';
import { createPracticalToolAdapter } from './tool-adapter';

afterEach(() => vi.useRealTimers());

it('opens a selected compatible tool and refuses the native failed-load outcome', async () => {
  let publish: (state: ToolState) => void = () => {};
  const bridge = {
    onToolState: (listener: (state: ToolState) => void) => {
      publish = listener;
      return () => {
        publish = () => {};
      };
    },
    openTool: vi.fn(async () => {
      publish({
        url: 'https://www.desmos.com/calculator',
        title: '',
        loading: false,
        error: 'Load failed',
      });
    }),
    closeTool: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
  };
  const adapter = createPracticalToolAdapter({
    bridge,
    toolId: 'desmos-graphing',
    stopGuidance: async () => {},
  });
  await expect(adapter.openEmbedded()).rejects.toThrow('could not load');
  expect(bridge.openTool).toHaveBeenCalledWith(
    'https://www.desmos.com/calculator',
  );
  expect(bridge.openExternal).not.toHaveBeenCalled();
});

it('waits for an observed successful native load and cancels a stalled open on close', async () => {
  let publish: (state: ToolState) => void = () => {};
  const bridge = {
    onToolState: (listener: (state: ToolState) => void) => {
      publish = listener;
      return () => {
        publish = () => {};
      };
    },
    openTool: vi.fn(async () => {}),
    closeTool: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
  };
  const adapter = createPracticalToolAdapter({
    bridge,
    toolId: 'geogebra-graphing',
    stopGuidance: async () => {},
  });
  let opened = false;
  const opening = adapter.openEmbedded().then(() => {
    opened = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(opened).toBe(false);
  publish({
    url: 'https://www.geogebra.org/graphing',
    title: 'Graphing Calculator',
    loading: false,
    error: '',
  });
  await opening;
  expect(opened).toBe(true);
  bridge.openTool.mockImplementationOnce(async () => new Promise(() => {}));
  const stalled = adapter.openEmbedded();
  const rejected = expect(stalled).rejects.toThrow('stopped');
  await adapter.close();
  await rejected;
});

it('settles missing-load events and releases a failed subscription so a retry is possible', async () => {
  vi.useFakeTimers();
  let throwOnSubscribe = true;
  const bridge = {
    onToolState: () => {
      if (throwOnSubscribe) throw new Error('Private transport detail');
      return () => {};
    },
    openTool: vi.fn(async () => {}),
    closeTool: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
  };
  const adapter = createPracticalToolAdapter({
    bridge,
    toolId: 'desmos-graphing',
    stopGuidance: async () => {},
  });
  await expect(adapter.openEmbedded()).rejects.toThrow('could not load');
  throwOnSubscribe = false;
  const retry = adapter.openEmbedded();
  const failed = expect(retry).rejects.toThrow('could not load');
  await vi.advanceTimersByTimeAsync(30_000);
  await failed;
});

it('stops guidance before an explicit external handoff and blocks handoff if stopping fails', async () => {
  let observing = true;
  const destinations: string[] = [];
  const bridge = {
    onToolState: () => () => {},
    openTool: async () => {},
    closeTool: async () => {},
    openExternal: async (url: string) => {
      if (observing) throw new Error('Observation still active');
      destinations.push(url);
    },
  };
  const stopped = createPracticalToolAdapter({
    bridge,
    toolId: 'desmos-graphing',
    stopGuidance: async () => {
      observing = false;
    },
  });
  await stopped.openExternal();
  expect(destinations).toEqual(['https://www.desmos.com/calculator']);
  const failed = createPracticalToolAdapter({
    bridge,
    toolId: 'geogebra-graphing',
    stopGuidance: async () => {
      throw new Error('Cannot stop');
    },
  });
  await expect(failed.openExternal()).rejects.toThrow('Cannot stop');
  expect(destinations).toHaveLength(1);
});
