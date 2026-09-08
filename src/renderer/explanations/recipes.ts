import {
  DEFAULT_ARM,
  EXPLANATION_VERSION,
  type ArmParameters,
  type ExplanationSpec,
  type ExplanationCapture,
  type Point3,
  type RecipeId,
} from '../../contracts/explanations';

export const PARTS = {
  base: {
    name: 'Base plate',
    description: 'The lower plate supports the stack.',
    y: -1.05,
    offset: -1.15,
    color: '#91a2ad',
  },
  board: {
    name: 'Circuit board',
    description: 'The board sits above the mounting posts.',
    y: -0.48,
    offset: -0.35,
    color: '#7bc7c9',
  },
  core: {
    name: 'Beacon core',
    description: 'The central body sits inside the upper shell.',
    y: 0.12,
    offset: 0.55,
    color: '#fbd094',
  },
  cover: {
    name: 'Upper shell',
    description: 'The shell lifts away to expose the core.',
    y: 0.94,
    offset: 1.4,
    color: '#c9b7d5',
  },
} as const;
export const DEGREES_TO_RADIANS = Math.PI / 180;

export function forwardEndpoint(parameters: ArmParameters): Point3 {
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
export function createExplanation(recipe: RecipeId): ExplanationSpec {
  const identity = {
    id: crypto.randomUUID(),
    version: EXPLANATION_VERSION,
    assetVersion: 'original-geometry-1' as const,
    origin: null,
  } as const;
  if (recipe === 'spatial-assembly')
    return {
      ...identity,
      recipe,
      caption:
        'Beacon module · an original illustrative assembly. Separate the layers to inspect how the parts fit; this is not a manufactured device.',
      parameters: { separation: 0, selectedPart: 'core' },
    };
  return {
    ...identity,
    recipe,
    caption:
      'A planar two-link arm. Shoulder angle is measured from +X; elbow angle is relative to the first link. Lengths are model units. No dynamics, collision or joint-limit physics.',
    parameters: { ...DEFAULT_ARM },
  };
}
export function formatPoint(point: Point3): string {
  const format = (number: number): string =>
    (Math.abs(number) < 0.0005 ? 0 : number).toFixed(3);
  return `X ${format(point.x)} · Y ${format(point.y)} · Z ${format(point.z)}`;
}

export function describeCapture(capture: ExplanationCapture): string {
  if (capture.measurement.kind === 'endpoint')
    return formatPoint(capture.measurement.endpoint);
  if (capture.explanation.recipe !== 'spatial-assembly')
    return 'Part positions recorded';
  const percentage = Math.round(
    capture.explanation.parameters.separation * 100,
  );
  return `Separation ${percentage}% · all four part positions recorded`;
}
