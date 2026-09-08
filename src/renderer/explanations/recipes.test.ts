import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { DEFAULT_ARM, isExplanationSpec } from '../../contracts/explanations';
import { createExplanation, formatPoint, forwardEndpoint } from './recipes';
import {
  createArmModel,
  createAssemblyModel,
  disposeGeometry,
  partIdOf,
} from './geometry';

describe('bounded reusable recipe contract', () => {
  it('retains identity and exact origin without inferring a source', () => {
    for (const recipe of ['spatial-assembly', 'two-link-arm'] as const) {
      const spec = createExplanation(recipe);
      expect(isExplanationSpec(JSON.parse(JSON.stringify(spec)))).toBe(true);
      expect(spec.origin).toBeNull();
      const origin = {
        projectId: crypto.randomUUID(),
        sourceVersionId: crypto.randomUUID(),
        questionId: null,
        lessonId: null,
      };
      expect(isExplanationSpec({ ...spec, origin })).toBe(true);
      expect(
        isExplanationSpec({
          ...spec,
          origin: { ...origin, projectId: 'wrong' },
        }),
      ).toBe(false);
    }
  });
  it('rejects malformed, executable, out-of-range and unknown plans', () => {
    const spec = createExplanation('two-link-arm');
    for (const value of [
      null,
      [],
      {},
      { ...spec, id: '' },
      { ...spec, version: 2 },
      { ...spec, recipe: 'custom-code' },
      { ...spec, caption: '<script>x</script>' },
      { ...spec, caption: '\n' },
      { ...spec, caption: 'x'.repeat(401) },
      { ...spec, origin: {} },
      { ...spec, parameters: null },
      { ...spec, assetUrl: 'https://unrestricted.test' },
    ])
      expect(isExplanationSpec(value)).toBe(false);
    for (const firstLength of [NaN, Infinity, -1, 0, 3.01, '2'])
      expect(
        isExplanationSpec({
          ...spec,
          parameters: { ...DEFAULT_ARM, firstLength },
        }),
      ).toBe(false);
    for (const firstLength of [0.5, 3])
      expect(
        isExplanationSpec({
          ...spec,
          parameters: { ...DEFAULT_ARM, firstLength },
        }),
      ).toBe(true);
    const assembly = createExplanation('spatial-assembly');
    for (const parameters of [
      { separation: 2, selectedPart: 'base' },
      { separation: 0, selectedPart: 'unknown' },
      { separation: 0, selectedPart: 'base', shader: 'x' },
    ])
      expect(isExplanationSpec({ ...assembly, parameters })).toBe(false);
  });
});

describe('independent world-transform measurements', () => {
  const cases = [
    { shoulderDegrees: 0, elbowDegrees: 0, expected: [3.5, 0] },
    { shoulderDegrees: 90, elbowDegrees: 0, expected: [0, 3.5] },
    { shoulderDegrees: 0, elbowDegrees: 90, expected: [2, 1.5] },
    { shoulderDegrees: 90, elbowDegrees: 90, expected: [-1.5, 2] },
    { shoulderDegrees: -90, elbowDegrees: 90, expected: [1.5, -2] },
    { shoulderDegrees: 180, elbowDegrees: 180, expected: [-0.5, 0] },
  ];
  it.each(cases)(
    'measures a known endpoint at $shoulderDegrees / $elbowDegrees degrees',
    ({ shoulderDegrees, elbowDegrees, expected }) => {
      const parameters = { ...DEFAULT_ARM, shoulderDegrees, elbowDegrees };
      const model = createArmModel();
      model.apply(parameters);
      const measurement = model.measure();
      expect(measurement.kind).toBe('endpoint');
      if (measurement.kind !== 'endpoint') throw new Error('Wrong measurement');
      expect(measurement.endpoint.x).toBeCloseTo(expected[0]!, 12);
      expect(measurement.endpoint.y).toBeCloseTo(expected[1]!, 12);
      expect(measurement.endpoint.z).toBe(0);
      expect(forwardEndpoint(parameters).x).toBeCloseTo(expected[0]!, 12);
      expect(forwardEndpoint(parameters).y).toBeCloseTo(expected[1]!, 12);
      disposeGeometry(model.root);
    },
  );
  it('agrees across bounded lengths and angles while measuring a hierarchical arm', () => {
    const model = createArmModel();
    for (const firstLength of [0.5, 1.7, 3])
      for (const secondLength of [0.5, 2.1, 3])
        for (const shoulderDegrees of [-180, -73, 0, 42, 180])
          for (const elbowDegrees of [-180, -37, 0, 123, 180]) {
            const parameters = {
              firstLength,
              secondLength,
              shoulderDegrees,
              elbowDegrees,
            };
            model.apply(parameters);
            const measured = model.measure();
            if (measured.kind !== 'endpoint')
              throw new Error('Wrong measurement');
            const reference = forwardEndpoint(parameters);
            expect(measured.endpoint.x).toBeCloseTo(reference.x, 12);
            expect(measured.endpoint.y).toBeCloseTo(reference.y, 12);
          }
    disposeGeometry(model.root);
  });
  it('selects original parts, explodes and returns to exact assembled positions', () => {
    const model = createAssemblyModel();
    model.apply({ separation: 0, selectedPart: 'base' });
    const assembled = model.measure();
    model.apply({ separation: 1, selectedPart: 'cover' });
    const exploded = model.measure();
    expect(exploded).not.toEqual(assembled);
    if (exploded.kind !== 'part-positions')
      throw new Error('Wrong measurement');
    expect(exploded.positions.cover.y).toBeCloseTo(2.34);
    expect(exploded.positions.base.y).toBeCloseTo(-2.2);
    const cover = model.root.getObjectByName('Upper shell');
    expect(partIdOf(cover!)).toBe('cover');
    expect(partIdOf(new Group())).toBeNull();
    model.apply({ separation: 0, selectedPart: 'base' });
    expect(model.measure()).toEqual(assembled);
    disposeGeometry(model.root);
  });
  it('disposes every material and geometry, including multi-material meshes', () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const materials = [new MeshStandardMaterial(), new MeshStandardMaterial()];
    const dispose = vi.spyOn(geometry, 'dispose');
    const disposed = materials.map((material) => vi.spyOn(material, 'dispose'));
    root.add(new Mesh(geometry, materials));
    disposeGeometry(root);
    expect(dispose).toHaveBeenCalledOnce();
    disposed.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    expect(root.children).toHaveLength(0);
    expect(formatPoint({ x: -0.00001, y: 1.23456, z: 0 })).toBe(
      'X 0.000 · Y 1.235 · Z 0.000',
    );
  });
});
