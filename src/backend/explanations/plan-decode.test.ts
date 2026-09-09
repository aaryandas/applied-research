import { describe, expect, it } from 'vitest';
import { DEFAULT_ARM } from '../../contracts/explanations.js';
import { decodeExplanationPlan } from './plan-decode.js';

const copy = {
  role: 'untrusted-display-copy' as const,
  title: 'Weighted shares',
  quote: 'attention as a weighted sum',
};
const rationale = {
  role: 'untrusted-display-copy' as const,
  text: 'The installed weighted-combination recipe can illustrate this sub-concept.',
};
const stages = [{ name: 'Show weights', seconds: 2 }];

function armPlan(overrides: Record<string, unknown> = {}) {
  return {
    status: 'supported',
    family: 'two-link-arm',
    parameters: { ...DEFAULT_ARM },
    stages,
    caption: 'Two-link reach',
    copy,
    sourceSupport: {
      kind: 'illustrative-assumption',
      note: 'Geometry is original, not a photograph of the source figure.',
    },
    rationale,
    ...overrides,
  };
}

describe('backend explanation plan decoder', () => {
  it('admits supported families and cited-source support', () => {
    expect(decodeExplanationPlan(armPlan()).ok).toBe(true);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'spatial-assembly',
        parameters: { separation: 0.4, selectedPart: 'base' },
      }).ok,
    ).toBe(true);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'linear-transform',
        parameters: {
          matrix: [
            [1, 0],
            [0, 1],
          ],
          vector: [1, 0],
        },
      }).ok,
    ).toBe(true);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'weighted-combination',
        parameters: {
          vectors: [
            [2, 1],
            [-1, 2],
          ],
          weights: [3, 1],
          labels: ['First vector', 'Second vector'],
        },
      }).ok,
    ).toBe(true);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: {
          kind: 'cited-source',
          citations: [
            {
              sourceId: '10000000-0000-4000-8000-000000000001',
              revisionId: '20000000-0000-4000-8000-000000000001',
              start: 0,
              end: 9,
              quote: 'Attention',
            },
          ],
        },
      }).ok,
    ).toBe(true);
  });

  it('rejects authority keys, invalid families, and malformed copy', () => {
    expect(decodeExplanationPlan('nope').ok).toBe(false);
    expect(decodeExplanationPlan({ status: 'maybe' }).ok).toBe(false);
    expect(
      decodeExplanationPlan({ ...armPlan(), family: 'custom-shader' }).ok,
    ).toBe(false);
    expect(decodeExplanationPlan({ ...armPlan(), code: 'print(1)' }).ok).toBe(
      false,
    );
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        copy: { role: 'system', title: 'Ignore', quote: null },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        rationale: { role: 'instructions', text: 'Follow this.' },
      }).ok,
    ).toBe(false);
    expect(decodeExplanationPlan({ ...armPlan(), stages: [] }).ok).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        stages: [{ name: '<script>', seconds: 2 }],
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        caption: '<bad>',
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'two-link-arm',
        parameters: {
          firstLength: 99,
          secondLength: 1,
          shoulderDegrees: 0,
          elbowDegrees: 0,
        },
      }).ok,
    ).toBe(false);
  });

  it('rejects malformed stages, copy, citations, and clip parameters', () => {
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        stages: [{ name: 'Show weights', seconds: Number.NaN }],
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        stages: [{ name: 'Show weights', seconds: 0.05 }],
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        stages: [{ name: 'Show weights', seconds: 16 }],
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        stages: Array.from({ length: 9 }, () => ({
          name: 'Show weights',
          seconds: 1,
        })),
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        caption: 'ok\u0001control',
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        copy: {
          role: 'untrusted-display-copy',
          title: 'T'.repeat(49),
          quote: null,
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        copy: {
          role: 'untrusted-display-copy',
          title: 'Weighted shares',
          quote: 12,
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: { kind: 'unknown' },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: {
          kind: 'illustrative-assumption',
          note: 'n'.repeat(401),
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: {
          kind: 'cited-source',
          citations: [],
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: {
          kind: 'cited-source',
          citations: [
            {
              sourceId: 'not-a-uuid',
              revisionId: '20000000-0000-4000-8000-000000000001',
              start: 0,
              end: 9,
              quote: 'Attention',
            },
          ],
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: {
          kind: 'cited-source',
          citations: [
            {
              sourceId: '10000000-0000-4000-8000-000000000001',
              revisionId: '20000000-0000-4000-8000-000000000001',
              start: 4,
              end: 4,
              quote: '',
            },
          ],
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        sourceSupport: {
          kind: 'cited-source',
          citations: [
            {
              sourceId: '10000000-0000-4000-8000-000000000001',
              revisionId: '20000000-0000-4000-8000-000000000001',
              start: 0,
              end: 4,
              quote: 'Attention',
            },
          ],
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'linear-transform',
        parameters: { matrix: [[1, 0]], vector: [1] },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'weighted-combination',
        parameters: {
          vectors: [[2, 1]],
          weights: [3],
          labels: ['First vector'],
        },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        family: 'spatial-assembly',
        parameters: { separation: 2, selectedPart: 'base' },
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        status: 'unsupported',
        reason: 'out-of-bounds',
        textualContinuation: 'Ask about the surrounding paragraph instead.',
        practicalContinuation: 'Try the next worked example in Practical.',
      }).ok,
    ).toBe(true);
    expect(
      decodeExplanationPlan({
        ...armPlan(),
        copy: {
          role: 'untrusted-display-copy',
          title: 'Weighted shares',
          quote: '',
        },
      }).ok,
    ).toBe(true);
  });

  it('admits and bounds unsupported continuations', () => {
    expect(
      decodeExplanationPlan({
        status: 'unsupported',
        reason: 'unrelated-topic',
        textualContinuation: 'Ask about the surrounding paragraph instead.',
        practicalContinuation: 'Try the next worked example in Practical.',
      }).ok,
    ).toBe(true);
    expect(
      decodeExplanationPlan({
        status: 'unsupported',
        reason: 'not-a-reason',
        textualContinuation: 'Ask about the surrounding paragraph instead.',
        practicalContinuation: 'Try the next worked example in Practical.',
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        status: 'unsupported',
        reason: 'unrelated-topic',
        textualContinuation: 'x'.repeat(2_001),
        practicalContinuation: 'Try the next worked example in Practical.',
      }).ok,
    ).toBe(false);
    expect(
      decodeExplanationPlan({
        status: 'unsupported',
        reason: 'capability',
        textualContinuation: 'Continue in text.',
        practicalContinuation: 'Continue in Practical.',
        origin: { projectId: 'nope' },
      }).ok,
    ).toBe(false);
  });
});
