/** Serializable local recipes. No executable text, remote assets, or persistence claims. */
export const EXPLANATION_VERSION = 1;
export const PART_IDS = ['base', 'board', 'core', 'cover'] as const;
export type PartId = (typeof PART_IDS)[number];
export type RecipeId = 'spatial-assembly' | 'two-link-arm';

export interface ExplanationOrigin {
  projectId: string;
  sourceVersionId: string | null;
  questionId: string | null;
  lessonId: string | null;
}
export interface AssemblyParameters {
  separation: number;
  selectedPart: PartId;
}
export interface ArmParameters {
  firstLength: number;
  secondLength: number;
  shoulderDegrees: number;
  elbowDegrees: number;
}
interface ExplanationIdentity {
  id: string;
  version: typeof EXPLANATION_VERSION;
  assetVersion: 'original-geometry-1';
  origin: ExplanationOrigin | null;
  caption: string;
}
export type ExplanationSpec = ExplanationIdentity &
  (
    | { recipe: 'spatial-assembly'; parameters: AssemblyParameters }
    | { recipe: 'two-link-arm'; parameters: ArmParameters }
  );
export interface Point3 {
  x: number;
  y: number;
  z: number;
}
export type SceneMeasurement =
  | { kind: 'part-positions'; positions: Record<PartId, Point3> }
  | { kind: 'endpoint'; endpoint: Point3; units: 'model units' };
export interface ExplanationCapture {
  id: string;
  explanation: ExplanationSpec;
  capturedAt: string;
  attribution: 'app-measured';
  retention: 'session-only';
  measurement: SceneMeasurement;
  camera: { position: Point3; target: Point3 };
}
export const ARM_LIMITS = {
  firstLength: { min: 0.5, max: 3, step: 0.1, label: 'First link length' },
  secondLength: { min: 0.5, max: 3, step: 0.1, label: 'Second link length' },
  shoulderDegrees: { min: -180, max: 180, step: 1, label: 'Shoulder angle' },
  elbowDegrees: { min: -180, max: 180, step: 1, label: 'Elbow angle' },
} as const;
export const DEFAULT_ARM: ArmParameters = {
  firstLength: 2,
  secondLength: 1.5,
  shoulderDegrees: 30,
  elbowDegrees: 60,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}
function isBounded(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
  );
}
function isValidOrigin(value: unknown): boolean {
  if (value === null) return true;
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'projectId',
      'sourceVersionId',
      'questionId',
      'lessonId',
    ])
  )
    return false;
  return (
    isUuid(value.projectId) &&
    ['sourceVersionId', 'questionId', 'lessonId'].every(
      (key) => value[key] === null || isUuid(value[key]),
    )
  );
}
export function isExplanationSpec(value: unknown): value is ExplanationSpec {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'id',
      'version',
      'assetVersion',
      'origin',
      'caption',
      'recipe',
      'parameters',
    ])
  )
    return false;
  const validIdentity =
    isUuid(value.id) &&
    value.version === EXPLANATION_VERSION &&
    value.assetVersion === 'original-geometry-1' &&
    isValidOrigin(value.origin);
  const plainCaption =
    typeof value.caption === 'string' &&
    value.caption.length > 0 &&
    value.caption.length <= 400 &&
    ![...value.caption].some((character) => {
      const point = character.codePointAt(0);
      return (
        point !== undefined &&
        (point < 32 || character === '<' || character === '>')
      );
    });
  if (!validIdentity || !plainCaption || !isRecord(value.parameters))
    return false;
  const parameters = value.parameters;
  if (value.recipe === 'spatial-assembly') {
    const allowedParts: readonly unknown[] = PART_IDS;
    return (
      exactKeys(parameters, ['separation', 'selectedPart']) &&
      isBounded(parameters.separation, 0, 1) &&
      allowedParts.includes(parameters.selectedPart)
    );
  }
  if (
    value.recipe !== 'two-link-arm' ||
    !exactKeys(parameters, Object.keys(ARM_LIMITS))
  )
    return false;
  return Object.entries(ARM_LIMITS).every(([key, limit]) =>
    isBounded(parameters[key], limit.min, limit.max),
  );
}
