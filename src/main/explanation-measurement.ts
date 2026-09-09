import {
  ARM_LIMITS,
  DEFAULT_ARM,
  PART_IDS,
  type ArmParameters,
  type AssemblyParameters,
  type Point3,
  type SceneMeasurement,
} from '../contracts/explanations';

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Rest positions and explode offsets of the original assembly recipe. */
export const ASSEMBLY_LAYOUT = {
  base: { y: -1.05, offset: -1.15 },
  board: { y: -0.48, offset: -0.35 },
  core: { y: 0.12, offset: 0.55 },
  cover: { y: 0.94, offset: 1.4 },
} as const;

export function measureArmEndpoint(parameters: ArmParameters): Point3 {
  const shoulder = parameters.shoulderDegrees * DEGREES_TO_RADIANS;
  const elbow =
    (parameters.shoulderDegrees + parameters.elbowDegrees) * DEGREES_TO_RADIANS;
  return {
    x:
      parameters.firstLength * Math.cos(shoulder) +
      parameters.secondLength * Math.cos(elbow),
    y:
      parameters.firstLength * Math.sin(shoulder) +
      parameters.secondLength * Math.sin(elbow),
    z: 0,
  };
}

export function measureAssemblyPositions(
  parameters: AssemblyParameters,
): Record<(typeof PART_IDS)[number], Point3> {
  const positions = {} as Record<(typeof PART_IDS)[number], Point3>;
  for (const id of PART_IDS) {
    const layout = ASSEMBLY_LAYOUT[id];
    positions[id] = {
      x: 0,
      y: layout.y + layout.offset * parameters.separation,
      z: 0,
    };
  }
  return positions;
}

export function recomputeSceneMeasurement(
  parameters: AssemblyParameters | ArmParameters,
): SceneMeasurement | null {
  if ('selectedPart' in parameters) {
    return {
      kind: 'part-positions',
      positions: measureAssemblyPositions(parameters),
    };
  }
  if (!isArmParameters(parameters)) return null;
  return {
    kind: 'endpoint',
    endpoint: measureArmEndpoint(parameters),
    units: 'model units',
  };
}

function isArmParameters(value: ArmParameters): boolean {
  return (Object.keys(ARM_LIMITS) as (keyof ArmParameters)[]).every((key) => {
    const number = value[key];
    const limit = ARM_LIMITS[key];
    return (
      typeof number === 'number' &&
      Number.isFinite(number) &&
      number >= limit.min &&
      number <= limit.max
    );
  });
}

export { DEFAULT_ARM };
