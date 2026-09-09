import {
  useLayoutEffect,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ExplanationExperience,
  LocalExplanations,
} from './ExplanationExperience';
import { createExplanation } from './recipes';
import type { ExplanationSpec } from '../../contracts/explanations';
import type { SceneCanvas } from './SceneCanvas';

const state = vi.hoisted(() => ({
  reset: vi.fn(),
  disposed: vi.fn(),
  capture: vi.fn(() => ({
    measurement: {
      kind: 'endpoint' as const,
      endpoint: { x: 2, y: 1.5, z: 0 },
      units: 'model units' as const,
    },
    camera: { position: { x: 0, y: 0, z: 13 }, target: { x: 0, y: 0, z: 0 } },
  })),
}));
vi.mock('./SceneCanvas', () => ({
  SceneCanvas: function FakeScene(props: ComponentProps<typeof SceneCanvas>) {
    const { runtimeRef, onReady } = props;
    useLayoutEffect(() => {
      runtimeRef.current = {
        capture: state.capture,
        resetView: state.reset,
        update: vi.fn(),
        tick: vi.fn(),
        dispose: state.disposed,
      };
      onReady();
      return () => {
        runtimeRef.current = null;
        state.disposed();
      };
    }, [runtimeRef, onReady]);
    return (
      <div data-testid="scene" data-reduced={props.reducedMotion}>
        <button onClick={props.onLost}>Lose context</button>
        <button onClick={() => props.onSelect('board')}>Select mesh</button>
      </div>
    );
  },
}));
function Harness({
  initial,
  active = true,
  plannedParameters,
  onRetainedCapture,
}: {
  initial: ExplanationSpec;
  active?: boolean;
  plannedParameters?: ExplanationSpec['parameters'];
  onRetainedCapture?: ComponentProps<
    typeof ExplanationExperience
  >['onRetainedCapture'];
}): ReactElement {
  const [spec, setSpec] = useState(initial);
  return (
    <ExplanationExperience
      spec={spec}
      active={active}
      onChange={setSpec}
      onCapture={vi.fn()}
      {...(plannedParameters ? { plannedParameters } : {})}
      {...(onRetainedCapture ? { onRetainedCapture } : {})}
    />
  );
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('edits bounded arm parameters, captures provenance, resets and preserves the previous capture', async () => {
  const spec = createExplanation('two-link-arm');
  spec.origin = {
    projectId: crypto.randomUUID(),
    sourceVersionId: crypto.randomUUID(),
    questionId: null,
    lessonId: null,
  };
  render(<Harness initial={spec} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText('Shoulder angle (°)'), {
    target: { value: '0' },
  });
  fireEvent.change(screen.getByLabelText('Elbow angle (°)'), {
    target: { value: '90' },
  });
  expect(
    screen.getByText('Endpoint · X 2.000 · Y 1.500 · Z 0.000'),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('First link length'), {
    target: { value: '0.1' },
  });
  expect(screen.getByRole('alert')).toHaveTextContent('between 0.5 and 3');
  fireEvent.change(screen.getByLabelText('First link length'), {
    target: { value: '' },
  });
  expect(screen.getByLabelText('First link length')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Capture endpoint' }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText('First link length'), {
    target: { value: '2.5' },
  });
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Capture endpoint' }));
  const captured = JSON.parse(
    screen.getByLabelText('Captured scene record').textContent ?? 'null',
  ) as { explanation: ExplanationSpec };
  expect(captured).toMatchObject({
    attribution: 'app-measured',
    retention: 'session-only',
    explanation: {
      id: spec.id,
      origin: spec.origin,
      parameters: { firstLength: 2.5, shoulderDegrees: 0, elbowDegrees: 90 },
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Shoulder angle (°)')).toHaveValue('30');
  expect(state.reset).toHaveBeenCalled();
  expect(screen.getByLabelText('Captured scene record')).toHaveTextContent(
    '"firstLength": 2.5',
  );
});
it('supports part buttons, mesh selection, continuous separation and reassembly', async () => {
  render(<Harness initial={createExplanation('spatial-assembly')} />);
  await screen.findByTestId('scene');
  fireEvent.click(screen.getByRole('button', { name: 'Explode' }));
  expect(screen.getByLabelText('Assembly separation')).toHaveValue('1');
  fireEvent.click(screen.getByRole('button', { name: 'Upper shell' }));
  expect(screen.getByRole('button', { name: 'Upper shell' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select mesh' }));
  expect(screen.getByRole('button', { name: 'Circuit board' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.change(screen.getByLabelText('Assembly separation'), {
    target: { value: '0.4' },
  });
  expect(screen.getByText('Separation · 40%')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reassemble' }));
  expect(screen.getByLabelText('Assembly separation')).toHaveValue('0');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByRole('button', { name: 'Beacon core' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  state.capture.mockReturnValueOnce({
    measurement: {
      kind: 'endpoint',
      endpoint: { x: 0, y: 0, z: 0 },
      units: 'model units',
    },
    camera: { position: { x: 0, y: 0, z: 8 }, target: { x: 0, y: 0, z: 0 } },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Capture assembly' }));
  expect(screen.getByText('Captured · app-measured')).toBeVisible();
});
it('stops on context loss, keeps inputs usable, retries without losing capture and unmounts when inactive', async () => {
  const spec = createExplanation('two-link-arm');
  const { rerender } = render(<Harness initial={spec} />);
  await screen.findByTestId('scene');
  fireEvent.click(screen.getByRole('button', { name: 'Capture endpoint' }));
  expect(screen.getByText('+Y up · +X right · XY plane')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Lose context' }));
  expect(screen.queryByText('+Y up · +X right · XY plane')).toBeNull();
  expect(screen.getByText(/3D view unavailable/)).toBeVisible();
  expect(state.disposed).toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Capture endpoint' }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Shoulder angle (°)'), {
    target: { value: '90' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry 3D view' }));
  await screen.findByTestId('scene');
  expect(screen.getByLabelText('Shoulder angle (°)')).toHaveValue('90');
  expect(screen.getByText('Captured · app-measured')).toBeVisible();
  rerender(<Harness initial={spec} active={false} />);
  expect(screen.queryByTestId('scene')).toBeNull();
  expect(screen.getByText('Scene paused while inactive.')).toBeVisible();
  expect(screen.queryByText('+Y up · +X right · XY plane')).toBeNull();
});
it('rejects unsupported runtime plans without constructing a renderer', () => {
  const spec = createExplanation('two-link-arm');
  render(
    <Harness initial={{ ...spec, version: 2 } as unknown as ExplanationSpec} />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('unsupported recipe');
  expect(screen.queryByTestId('scene')).toBeNull();
});
it('pauses offscreen and hidden documents, and reacts to changed reduced-motion preference', async () => {
  let intersection: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const media = new EventTarget();
  Object.assign(media, { matches: false });
  vi.stubGlobal('matchMedia', () => media);
  const { unmount } = render(
    <Harness initial={createExplanation('two-link-arm')} />,
  );
  await screen.findByTestId('scene');
  act(() => {
    intersection(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
  expect(screen.queryByTestId('scene')).toBeNull();
  act(() => {
    intersection(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    Object.assign(media, { matches: true });
    media.dispatchEvent(new Event('change'));
  });
  expect(await screen.findByTestId('scene')).toHaveAttribute(
    'data-reduced',
    'true',
  );
  Object.defineProperty(document, 'hidden', {
    value: true,
    configurable: true,
  });
  fireEvent(document, new Event('visibilitychange'));
  expect(screen.queryByTestId('scene')).toBeNull();
  Object.defineProperty(document, 'hidden', {
    value: false,
    configurable: true,
  });
  fireEvent(document, new Event('visibilitychange'));
  await screen.findByTestId('scene');
  const sceneBeforeBlur = screen.getByTestId('scene');
  fireEvent.blur(window);
  expect(screen.getByTestId('scene')).toBe(sceneBeforeBlur);
  fireEvent.focus(window);
  await screen.findByTestId('scene');
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
it('retains each scene and capture across local browser/tool switches', async () => {
  const { rerender } = render(<LocalExplanations recipe="two-link-arm" />);
  await screen.findByTestId('scene');
  fireEvent.change(screen.getByLabelText('First link length'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Capture endpoint' }));
  rerender(<LocalExplanations recipe={null} />);
  expect(screen.queryByTestId('scene')).toBeNull();
  rerender(<LocalExplanations recipe="spatial-assembly" />);
  await screen.findByTestId('scene');
  rerender(<LocalExplanations recipe="two-link-arm" />);
  await screen.findByTestId('scene');
  expect(screen.getByLabelText('First link length')).toHaveValue('3');
  expect(screen.getByText('Captured · app-measured')).toBeVisible();
});

it('keeps unfinished drafts across reactivation, blocks capture and resets every field', async () => {
  const { rerender } = render(<LocalExplanations recipe="two-link-arm" />);
  await screen.findByTestId('scene');
  fireEvent.change(screen.getByLabelText('Shoulder angle (°)'), {
    target: { value: '-' },
  });
  fireEvent.change(screen.getByLabelText('First link length'), {
    target: { value: '0.' },
  });
  expect(
    screen.getByRole('button', { name: 'Capture endpoint' }),
  ).toBeDisabled();
  rerender(<LocalExplanations recipe={null} />);
  rerender(<LocalExplanations recipe="two-link-arm" />);
  await screen.findByTestId('scene');
  expect(screen.getByLabelText('Shoulder angle (°)')).toHaveValue('-');
  expect(screen.getByLabelText('First link length')).toHaveValue('0.');
  expect(
    screen.getByRole('button', { name: 'Capture endpoint' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Shoulder angle (°)')).toHaveValue('30');
  expect(screen.getByLabelText('First link length')).toHaveValue('2');
  expect(
    screen.getByRole('button', { name: 'Capture endpoint' }),
  ).toBeEnabled();
  fireEvent.keyDown(screen.getByLabelText('First link length'), {
    key: 'ArrowDown',
  });
  expect(screen.getByLabelText('First link length')).toHaveValue('1.9');
  fireEvent.keyDown(screen.getByLabelText('First link length'), {
    key: 'ArrowUp',
  });
  expect(screen.getByLabelText('First link length')).toHaveValue('2');
});

it('resets a retained scene to the planned parameters instead of DEFAULT_ARM', async () => {
  const spec = createExplanation('two-link-arm');
  spec.parameters = {
    firstLength: 2.5,
    secondLength: 1,
    shoulderDegrees: 10,
    elbowDegrees: 20,
  };
  const planned = {
    firstLength: 1.2,
    secondLength: 0.8,
    shoulderDegrees: 45,
    elbowDegrees: -15,
  };
  const onRetainedCapture = vi.fn();
  render(
    <Harness
      initial={spec}
      plannedParameters={planned}
      onRetainedCapture={onRetainedCapture}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText('Shoulder angle (°)'), {
    target: { value: '90' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Shoulder angle (°)')).toHaveValue('45');
  expect(screen.getByLabelText('First link length')).toHaveValue('1.2');
  fireEvent.click(screen.getByRole('button', { name: 'Capture endpoint' }));
  expect(onRetainedCapture).toHaveBeenCalledWith(
    expect.objectContaining({
      explanationId: spec.id,
      parameters: expect.objectContaining({ shoulderDegrees: 45 }),
    }),
  );
});
