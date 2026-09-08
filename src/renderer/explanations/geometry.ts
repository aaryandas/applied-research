import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import {
  PART_IDS,
  type ArmParameters,
  type AssemblyParameters,
  type PartId,
  type Point3,
  type SceneMeasurement,
} from '../../contracts/explanations';
import { DEGREES_TO_RADIANS, PARTS } from './recipes';

function mesh(geometry: BufferGeometry, color: string): Mesh {
  return new Mesh(
    geometry,
    new MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.22 }),
  );
}
function box(size: [number, number, number], color: string): Mesh {
  return mesh(new BoxGeometry(...size), color);
}
function worldPoint(object: Object3D): Point3 {
  const point = object.getWorldPosition(new Vector3());
  return { x: point.x, y: point.y, z: point.z };
}
export function disposeGeometry(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => material.dispose());
  });
  root.clear();
}
export interface AssemblyModel {
  root: Group;
  apply: (parameters: AssemblyParameters) => void;
  measure: () => SceneMeasurement;
}
export function createAssemblyModel(): AssemblyModel {
  const root = new Group();
  const parts = {
    base: new Group(),
    board: new Group(),
    core: new Group(),
    cover: new Group(),
  };
  parts.base.add(box([2.8, 0.22, 2.2], PARTS.base.color));
  for (const x of [-1.12, 1.12])
    for (const z of [-0.83, 0.83]) {
      const post = mesh(
        new CylinderGeometry(0.09, 0.09, 0.42, 16),
        PARTS.base.color,
      );
      post.position.set(x, 0.3, z);
      parts.base.add(post);
    }
  parts.board.add(box([2.48, 0.12, 1.94], PARTS.board.color));
  for (const x of [-0.8, 0, 0.8]) {
    const chip = box([0.36, 0.14, 0.46], '#293f4b');
    chip.position.set(x, 0.12, 0.53);
    parts.board.add(chip);
  }
  const core = mesh(
    new CylinderGeometry(0.64, 0.64, 0.64, 48),
    PARTS.core.color,
  );
  parts.core.add(core);
  const ring = mesh(new TorusGeometry(0.45, 0.06, 12, 48), '#fff9ed');
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.33;
  parts.core.add(ring);
  parts.cover.add(box([2.8, 0.18, 2.2], PARTS.cover.color));
  for (const x of [-1.32, 1.32]) {
    const side = box([0.16, 0.48, 2.2], PARTS.cover.color);
    side.position.set(x, -0.28, 0);
    parts.cover.add(side);
  }
  for (const id of PART_IDS) {
    parts[id].name = PARTS[id].name;
    parts[id].traverse((object) => {
      object.userData.partId = id;
    });
    root.add(parts[id]);
  }
  return {
    root,
    apply(parameters) {
      for (const id of PART_IDS) {
        parts[id].position.y =
          PARTS[id].y + PARTS[id].offset * parameters.separation;
        parts[id].traverse((object) => {
          if (
            object instanceof Mesh &&
            object.material instanceof MeshStandardMaterial
          ) {
            object.material.emissive.set(
              id === parameters.selectedPart ? PARTS[id].color : '#000000',
            );
            object.material.emissiveIntensity =
              id === parameters.selectedPart ? 0.2 : 0;
          }
        });
      }
      root.updateMatrixWorld(true);
    },
    measure() {
      return {
        kind: 'part-positions',
        positions: {
          base: worldPoint(parts.base),
          board: worldPoint(parts.board),
          core: worldPoint(parts.core),
          cover: worldPoint(parts.cover),
        },
      };
    },
  };
}
export interface ArmModel {
  root: Group;
  apply: (parameters: ArmParameters) => void;
  measure: () => SceneMeasurement;
}
export function createArmModel(): ArmModel {
  const root = new Group();
  const shoulder = new Group();
  const elbow = new Group();
  const endpoint = new Group();
  const firstLink = box([1, 0.2, 0.22], '#7bc7c9');
  const secondLink = box([1, 0.17, 0.2], '#fbd094');
  const base = mesh(new CylinderGeometry(0.3, 0.38, 0.3, 32), '#91a2ad');
  base.rotation.x = Math.PI / 2;
  root.add(base, shoulder);
  shoulder.add(firstLink, elbow);
  elbow.add(secondLink, endpoint);
  elbow.add(mesh(new SphereGeometry(0.18, 24, 16), '#eceae4'));
  endpoint.add(mesh(new SphereGeometry(0.14, 24, 16), '#efe6cf'));
  for (const axis of ['x', 'y'] as const) {
    const line = box(
      axis === 'x' ? [12, 0.012, 0.012] : [0.012, 12, 0.012],
      '#60757f',
    );
    line.position.z = -0.25;
    root.add(line);
  }
  return {
    root,
    apply(parameters) {
      shoulder.rotation.z = parameters.shoulderDegrees * DEGREES_TO_RADIANS;
      elbow.rotation.z = parameters.elbowDegrees * DEGREES_TO_RADIANS;
      firstLink.scale.x = parameters.firstLength;
      firstLink.position.x = parameters.firstLength / 2;
      elbow.position.x = parameters.firstLength;
      secondLink.scale.x = parameters.secondLength;
      secondLink.position.x = parameters.secondLength / 2;
      endpoint.position.x = parameters.secondLength;
      root.updateMatrixWorld(true);
    },
    measure() {
      return {
        kind: 'endpoint',
        endpoint: worldPoint(endpoint),
        units: 'model units',
      };
    },
  };
}
export function partIdOf(object: Object3D): PartId | null {
  return PART_IDS.find((id) => id === object.userData.partId) ?? null;
}
