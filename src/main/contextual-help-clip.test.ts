import { describe, expect, it } from 'vitest';
import { DEFAULT_ARM } from '../contracts/explanations';
import type { ExplanationPlan } from '../contracts/explanation-artifacts';
import {
  isSupportedClipPlan,
  requestClip,
  unavailableClipPlayback,
  type RetainedClipRequestContext,
  type SupportedClipPlan,
} from './contextual-help-clip';

const origin = {
  sourceRevisionId: '30000000-0000-4000-8000-000000000001',
  highlightId: '40000000-0000-4000-8000-000000000001',
};

const weightedPlan: SupportedClipPlan = {
  status: 'supported',
  family: 'weighted-combination',
  parameters: {
    vectors: [
      [2, 1],
      [-1, 2],
    ],
    weights: [3, 1],
    labels: ['First vector', 'Second vector'],
  },
  stages: [{ name: 'Combine', seconds: 2 }],
  caption: 'Weighted sum of two vectors',
  copy: { role: 'untrusted-display-copy', title: 'Weights', quote: null },
  sourceSupport: {
    kind: 'illustrative-assumption',
    note: 'Original geometry.',
  },
  rationale: {
    role: 'untrusted-display-copy',
    text: 'Shows a weighted combination.',
  },
};

const armPlan: Extract<ExplanationPlan, { status: 'supported' }> = {
  status: 'supported',
  family: 'two-link-arm',
  parameters: { ...DEFAULT_ARM },
  stages: [{ name: 'Reach', seconds: 2 }],
  caption: 'Reach',
  copy: { role: 'untrusted-display-copy', title: 'Reach', quote: null },
  sourceSupport: {
    kind: 'illustrative-assumption',
    note: 'Original geometry.',
  },
  rationale: {
    role: 'untrusted-display-copy',
    text: 'Shows planar composition.',
  },
};

describe('requestClip context contract', () => {
  it('admits only linear-transform and weighted-combination plans for AR-54', () => {
    expect(isSupportedClipPlan(weightedPlan)).toBe(true);
    expect(isSupportedClipPlan(armPlan)).toBe(false);
  });

  it('carries reserved identity into requestClip and still returns unavailable', async () => {
    const context: RetainedClipRequestContext = {
      explanationId: '21000000-0000-4000-8000-000000000001',
      attemptId: '22000000-0000-4000-8000-000000000001',
      origin,
      plan: weightedPlan,
      signal: new AbortController().signal,
    };
    await expect(requestClip(context)).resolves.toEqual(
      unavailableClipPlayback(),
    );
    await expect(
      requestClip({
        ...context,
        explanationId: '',
        signal: AbortSignal.abort(),
      }),
    ).resolves.toEqual(unavailableClipPlayback());
  });
});
