import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Raycaster, Vector2, type Camera, type Scene } from 'three';
import type {
  ExplanationCapture,
  ExplanationSpec,
  PartId,
  RecipeId,
} from '../../contracts/explanations';
import {
  createArmModel,
  createAssemblyModel,
  disposeGeometry,
  partIdOf,
} from './geometry';

export interface SceneRuntime {
  update: (spec: ExplanationSpec, reducedMotion: boolean) => void;
  tick: (delta: number) => void;
  capture: () => Pick<ExplanationCapture, 'measurement' | 'camera'>;
  resetView: () => void;
  dispose: () => void;
}
interface RuntimeOptions {
  recipe: RecipeId;
  scene: Scene;
  camera: Camera;
  canvas: HTMLCanvasElement;
  invalidate: () => void;
  onSelect: (part: PartId) => void;
}
const SETTLE_EPSILON = 0.001;
const EXPLODE_RATE = 12;
const MAX_FRAME_SECONDS = 0.05;
const KEY_ROTATION = Math.PI / 24;

export function createSceneRuntime(options: RuntimeOptions): SceneRuntime {
  const { scene, camera, canvas, invalidate } = options;
  const model =
    options.recipe === 'spatial-assembly'
      ? { recipe: 'spatial-assembly' as const, ...createAssemblyModel() }
      : { recipe: 'two-link-arm' as const, ...createArmModel() };
  scene.add(model.root);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minDistance = 4;
  controls.maxDistance = 22;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI - 0.15;
  const armView = options.recipe === 'two-link-arm';
  camera.position.set(armView ? 0 : 6, armView ? 0 : 4, armView ? 13 : 8);
  controls.target.set(0, 0, 0);
  controls.update();
  controls.saveState();
  controls.addEventListener('change', invalidate);
  let current: ExplanationSpec | null = null;
  let separation = 0;
  let pointerStart = { x: 0, y: 0 };
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const pointerDown = (event: PointerEvent): void => {
    pointerStart = { x: event.clientX, y: event.clientY };
    canvas.focus({ preventScroll: true });
  };
  const pointerUp = (event: PointerEvent): void => {
    const moved = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y,
    );
    if (
      event.button !== 0 ||
      moved > 5 ||
      options.recipe !== 'spatial-assembly'
    )
      return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(model.root)[0];
    if (!hit) return;
    const part = partIdOf(hit.object);
    if (part) options.onSelect(part);
  };
  const keyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => controls.rotateLeft(KEY_ROTATION),
      ArrowRight: () => controls.rotateLeft(-KEY_ROTATION),
      ArrowUp: () => controls.rotateUp(KEY_ROTATION),
      ArrowDown: () => controls.rotateUp(-KEY_ROTATION),
      '+': () => controls.dollyIn(1.15),
      '=': () => controls.dollyIn(1.15),
      '-': () => controls.dollyOut(1.15),
      Home: () => controls.reset(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
    controls.update();
    invalidate();
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('keydown', keyDown);
  return {
    update(spec, reducedMotion) {
      current = spec;
      if (
        spec.recipe === 'spatial-assembly' &&
        model.recipe === 'spatial-assembly'
      ) {
        if (reducedMotion) separation = spec.parameters.separation;
        model.apply({ ...spec.parameters, separation });
      } else if (
        spec.recipe === 'two-link-arm' &&
        model.recipe === 'two-link-arm'
      ) {
        model.apply(spec.parameters);
      }
      invalidate();
    },
    tick(delta) {
      if (
        current?.recipe !== 'spatial-assembly' ||
        model.recipe !== 'spatial-assembly'
      )
        return;
      const distance = current.parameters.separation - separation;
      if (distance === 0) return;
      separation =
        Math.abs(distance) < SETTLE_EPSILON
          ? current.parameters.separation
          : separation +
            distance *
              (1 -
                Math.exp(-EXPLODE_RATE * Math.min(delta, MAX_FRAME_SECONDS)));
      model.apply({ ...current.parameters, separation });
      invalidate();
    },
    capture() {
      // Capture the settled requested configuration, never a transitional frame.
      if (
        current?.recipe === 'spatial-assembly' &&
        model.recipe === 'spatial-assembly'
      ) {
        separation = current.parameters.separation;
        model.apply(current.parameters);
        invalidate();
      }
      return {
        measurement: model.measure(),
        camera: {
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          },
          target: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z,
          },
        },
      };
    },
    resetView() {
      controls.reset();
      invalidate();
    },
    dispose() {
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('keydown', keyDown);
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      scene.remove(model.root);
      disposeGeometry(model.root);
    },
  };
}
