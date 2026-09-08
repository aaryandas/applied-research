import { expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Raycaster, Scene, Vector3 } from 'three';
import { createExplanation } from './recipes';
import { createSceneRuntime } from './runtime';

function setup(recipe: 'spatial-assembly' | 'two-link-arm') {
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  const invalidate = vi.fn();
  const onSelect = vi.fn();
  const runtime = createSceneRuntime({
    recipe,
    scene,
    camera,
    canvas,
    invalidate,
    onSelect,
  });
  return { canvas, scene, camera, invalidate, onSelect, runtime };
}
it('orbits and zooms by keyboard only on the focused canvas and resets view', () => {
  const { runtime, canvas, camera, invalidate, scene } = setup('two-link-arm');
  const initial = camera.position.clone();
  for (const key of [
    'ArrowLeft',
    'ArrowUp',
    '+',
    '=',
    '-',
    'ArrowRight',
    'ArrowDown',
  ])
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { key, cancelable: true }),
    );
  expect(camera.position.equals(initial)).toBe(false);
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
  expect(camera.position.distanceTo(initial)).toBeLessThan(1e-10);
  invalidate.mockClear();
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  canvas.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }),
  );
  expect(invalidate).not.toHaveBeenCalled();
  runtime.resetView();
  runtime.tick(0.016);
  runtime.update(createExplanation('two-link-arm'), true);
  expect(runtime.capture().measurement.kind).toBe('endpoint');
  runtime.dispose();
  expect(scene.children).toHaveLength(0);
  invalidate.mockClear();
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  expect(invalidate).not.toHaveBeenCalled();
});
it('animates only until settled; reduced motion and capture use exact requested positions', () => {
  const { runtime, invalidate } = setup('spatial-assembly');
  const spec = createExplanation('spatial-assembly');
  if (spec.recipe !== 'spatial-assembly') throw new Error('Wrong recipe');
  runtime.tick(0.016);
  runtime.update(
    { ...spec, parameters: { separation: 1, selectedPart: 'board' } },
    false,
  );
  for (let frame = 0; frame < 100; frame++) runtime.tick(0.016);
  invalidate.mockClear();
  runtime.tick(0.016);
  expect(invalidate).not.toHaveBeenCalled();
  expect(runtime.capture().measurement).toMatchObject({
    positions: { cover: { y: 2.34 } },
  });
  runtime.update(spec, true);
  invalidate.mockClear();
  runtime.tick(0.016);
  expect(invalidate).not.toHaveBeenCalled();
  runtime.update(
    { ...spec, parameters: { separation: 0.5, selectedPart: 'core' } },
    false,
  );
  expect(runtime.capture().measurement).toMatchObject({
    positions: { core: { y: 0.395 } },
  });
  runtime.dispose();
});
it('raycasts a click but does not select after orbit dragging or on a miss', () => {
  const { runtime, canvas, scene, onSelect } = setup('spatial-assembly');
  runtime.update(createExplanation('spatial-assembly'), true);
  const part = scene.getObjectByName('Base plate')?.children[0];
  if (!(part instanceof Mesh)) throw new Error('Missing original part');
  const raycast = vi
    .spyOn(Raycaster.prototype, 'intersectObject')
    .mockReturnValue([{ distance: 1, point: new Vector3(), object: part }]);
  const pointer = (type: string, x: number, button = 0): void => {
    canvas.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: 10, button }),
    );
  };
  pointer('pointerdown', 10);
  pointer('pointerup', 10);
  expect(onSelect).toHaveBeenCalledWith('base');
  onSelect.mockClear();
  pointer('pointerup', 40);
  pointer('pointerup', 10, 2);
  expect(onSelect).not.toHaveBeenCalled();
  raycast.mockReturnValue([]);
  pointer('pointerup', 10);
  part.userData.partId = 'unknown';
  raycast.mockReturnValue([
    { distance: 1, point: new Vector3(), object: part },
  ]);
  pointer('pointerup', 10);
  expect(onSelect).not.toHaveBeenCalled();
  runtime.dispose();
  raycast.mockRestore();
});
