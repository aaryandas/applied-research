import { describe, expect, it } from 'vitest';
import { DEFAULT_ARM } from '../contracts/explanations';
import {
  measureArmEndpoint,
  measureAssemblyPositions,
  recomputeSceneMeasurement,
} from './explanation-measurement';

describe('main-owned scene measurement', () => {
  it('recomputes the two-link endpoint from parameters, not a renderer string', () => {
    expect(
      measureArmEndpoint({
        ...DEFAULT_ARM,
        shoulderDegrees: 0,
        elbowDegrees: 0,
      }),
    ).toEqual({
      x: 3.5,
      y: 0,
      z: 0,
    });
    const rightAngle = measureArmEndpoint({
      firstLength: 2,
      secondLength: 1.5,
      shoulderDegrees: 0,
      elbowDegrees: 90,
    });
    expect(rightAngle.x).toBeCloseTo(2, 10);
    expect(rightAngle.y).toBeCloseTo(1.5, 10);
    expect(rightAngle.z).toBe(0);
    const measurement = recomputeSceneMeasurement({
      firstLength: 2,
      secondLength: 1.5,
      shoulderDegrees: 90,
      elbowDegrees: 0,
    });
    expect(measurement?.kind).toBe('endpoint');
    if (measurement?.kind === 'endpoint') {
      expect(measurement.endpoint.x).toBeCloseTo(0, 10);
      expect(measurement.endpoint.y).toBeCloseTo(3.5, 10);
      expect(measurement.endpoint.z).toBe(0);
      expect(measurement.units).toBe('model units');
    }
  });

  it('recomputes assembly part positions from planned separation', () => {
    const assembled = measureAssemblyPositions({
      separation: 0,
      selectedPart: 'core',
    });
    expect(assembled.core).toEqual({ x: 0, y: 0.12, z: 0 });
    const exploded = measureAssemblyPositions({
      separation: 1,
      selectedPart: 'cover',
    });
    expect(exploded.cover).toEqual({ x: 0, y: 2.34, z: 0 });
    expect(
      recomputeSceneMeasurement({
        separation: 0.4,
        selectedPart: 'board',
      })?.kind,
    ).toBe('part-positions');
  });
});
