import { isValidElement, type ReactNode, type RefObject } from 'react';
import { createRoot as createDomRoot, type Root } from 'react-dom/client';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SceneCanvas } from './SceneCanvas';
import { createExplanation } from './recipes';
import type { SceneRuntime } from './runtime';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  tick: vi.fn(),
  dispose: vi.fn(),
  rendererDispose: vi.fn(),
  unmount: vi.fn(),
  configure: vi.fn(async () => {}),
  frame: vi.fn<(state: unknown, delta: number) => void>(),
  scene: {},
  camera: {},
  invalidate: vi.fn(),
  initializationFails: false,
  renderFails: false,
  selection: vi.fn<(part: 'base') => void>(),
  renderer: null as { domElement: HTMLCanvasElement } | null,
  roots: [] as { dom: Root; host: HTMLDivElement }[],
  failureCallbacks: [] as (() => void)[],
}));
vi.mock('three', async (original) => ({
  ...(await original<typeof import('three')>()),
  WebGLRenderer: class {
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      if (mocks.initializationFails) throw new Error('No WebGL');
      this.domElement = canvas;
      mocks.renderer = this;
    }
    dispose = mocks.rendererDispose;
  },
}));
vi.mock('@react-three/fiber', () => ({
  extend: vi.fn(),
  createRoot: () => {
    const host = document.createElement('div');
    const dom = createDomRoot(host);
    mocks.roots.push({ dom, host });
    return {
      configure: mocks.configure,
      render: (children: ReactNode) => {
        if (isValidElement<{ onLost: () => void }>(children))
          mocks.failureCallbacks.push(children.props.onLost);
        dom.render(children);
      },
      unmount: mocks.unmount,
    };
  },
  useThree: () => {
    if (mocks.renderFails) throw new Error('Scene error');
    return {
      scene: mocks.scene,
      camera: mocks.camera,
      gl: mocks.renderer,
      invalidate: mocks.invalidate,
    };
  },
  useFrame: (callback: typeof mocks.frame) => {
    mocks.frame = callback;
  },
}));
vi.mock('./runtime', () => ({
  createSceneRuntime: (options: { onSelect: typeof mocks.selection }) => {
    mocks.selection = options.onSelect;
    return {
      update: mocks.update,
      tick: mocks.tick,
      dispose: mocks.dispose,
      resetView: vi.fn(),
      capture: vi.fn(),
    };
  },
}));
let resize = (): void => {};
const disconnect = vi.fn();
function setup() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const runtimeRef: RefObject<SceneRuntime | null> = { current: null };
  const props = {
    spec: createExplanation('spatial-assembly'),
    reducedMotion: true,
    runtimeRef,
    onLost: vi.fn(),
    onSelect: vi.fn(),
    onReady: vi.fn(),
  };
  return { props, ...render(<SceneCanvas {...props} />) };
}
afterEach(async () => {
  await act(() => {
    mocks.roots.forEach(({ dom }) => dom.unmount());
  });
  mocks.roots = [];
  mocks.failureCallbacks = [];
  mocks.initializationFails = false;
  mocks.renderFails = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('owns creation, first frame, updates, resizing, context loss and cleanup', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { props, container, unmount, rerender } = setup();
  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  expect(props.onReady).not.toHaveBeenCalled();
  act(() => {
    mocks.frame({}, 0.016);
    mocks.frame({}, 0.016);
    mocks.selection('base');
  });
  expect(props.onReady).toHaveBeenCalledOnce();
  expect(props.onSelect).toHaveBeenCalledWith('base');
  const canvas = container.querySelector('canvas')!;
  expect(canvas.tabIndex).toBe(0);
  const lost = new Event('webglcontextlost', { cancelable: true });
  fireEvent(canvas, lost);
  expect(lost.defaultPrevented).toBe(true);
  expect(props.onLost).toHaveBeenCalledOnce();
  await act(async () => {
    resize();
  });
  expect(mocks.configure).toHaveBeenCalledTimes(2);
  expect(mocks.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({ frameloop: 'demand', dpr: 1 }),
  );
  rerender(<SceneCanvas {...props} reducedMotion={false} />);
  await waitFor(() =>
    expect(mocks.update).toHaveBeenLastCalledWith(props.spec, false),
  );
  expect(mocks.failureCallbacks.length).toBeGreaterThan(1);
  expect(new Set(mocks.failureCallbacks).size).toBe(1);
  unmount();
  mocks.failureCallbacks.forEach((callback) => callback());
  expect(props.onLost).toHaveBeenCalledOnce();
  expect(mocks.unmount).toHaveBeenCalledOnce();
  expect(mocks.rendererDispose).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalled();
  fireEvent(canvas, new Event('webglcontextlost'));
  expect(props.onLost).toHaveBeenCalledOnce();
  consoleError.mockRestore();
});
it('reports a synchronous WebGL creation failure', () => {
  mocks.initializationFails = true;
  const { props } = setup();
  expect(props.onLost).toHaveBeenCalledOnce();
  expect(mocks.configure).not.toHaveBeenCalled();
});
it('catches asynchronous configuration rejection', async () => {
  mocks.configure.mockRejectedValueOnce(new Error('Cannot configure renderer'));
  const { props } = setup();
  await waitFor(() => expect(props.onLost).toHaveBeenCalledOnce());
});
it('catches a scene render error at the graphics boundary', async () => {
  mocks.renderFails = true;
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { props } = setup();
  await waitFor(() => expect(props.onLost).toHaveBeenCalledOnce());
  error.mockRestore();
});
it('discards configuration that completes or rejects after disposal', async () => {
  let complete: () => void = () => {};
  mocks.configure.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const { props, unmount } = setup();
  unmount();
  await act(async () => {
    complete();
    resize();
  });
  expect(props.onReady).not.toHaveBeenCalled();
  expect(props.onLost).not.toHaveBeenCalled();
});
