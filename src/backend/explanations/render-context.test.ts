import { describe, expect, it } from 'vitest';
import type { SourceRevisionLocator } from '../../contracts/learning-api.js';
import {
  constructRenderReceipt,
  decodePlannerRenderContext,
  decodePlannerRenderReceipt,
  RENDER_RECEIPT_VERSION,
} from './render-context.js';
import type { ExplanationPlan } from './plan-decode.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceRevisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const foreignRevisionId = '88888888-8888-4888-8888-888888888888';
const highlightId = '99999999-9999-4999-8999-999999999999';
const pathId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const topicId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const lessonId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const foreignSourceId = '70000000-0000-4000-8000-000000000007';

const origin = {
  sourceRevisionId,
  path: { pathId, pathRevision: 1, topicId, lessonId },
};

const highlightOrigin = {
  sourceRevisionId,
  highlightId,
};

const locator: SourceRevisionLocator = {
  sourceId: '10000000-0000-4000-8000-000000000001',
  revisionId: sourceRevisionId,
  title: 'Attention notes',
  sha256: 'c'.repeat(64),
  format: 'plain-text',
  canonicalizationVersion: 'workspace-plain-v1',
  acquiredAt: '2026-09-09T08:00:00.000Z',
  provenance: { kind: 'human-imported', locator: null },
};

const clipPlan: ExplanationPlan = {
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
  sourceSupport: { kind: 'illustrative-assumption', note: 'Shown.' },
  rationale: { role: 'untrusted-display-copy', text: 'Shows weights.' },
};

function decodeLocator(
  value: unknown,
): { ok: true; value: SourceRevisionLocator } | { ok: false; reason: 'shape' } {
  if (
    value &&
    typeof value === 'object' &&
    'revisionId' in value &&
    (value as SourceRevisionLocator).revisionId === locator.revisionId
  ) {
    return { ok: true, value: locator };
  }
  return { ok: false, reason: 'shape' };
}

describe('planner render context', () => {
  it('freezes path, source-only highlight, and optional lesson without inventing one', () => {
    expect(decodePlannerRenderContext({ projectId, origin })).toEqual({
      ok: true,
      value: { projectId, origin },
    });
    expect(
      decodePlannerRenderContext({ projectId, origin: highlightOrigin }),
    ).toEqual({
      ok: true,
      value: { projectId, origin: highlightOrigin },
    });
    expect(
      decodePlannerRenderContext({
        projectId,
        origin: {
          sourceRevisionId,
          path: { pathId, pathRevision: 1, topicId },
        },
      }),
    ).toEqual({
      ok: true,
      value: {
        projectId,
        origin: {
          sourceRevisionId,
          path: { pathId, pathRevision: 1, topicId },
        },
      },
    });
    expect(
      decodePlannerRenderContext({
        projectId,
        origin: { path: origin.path },
      }).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderContext({
        projectId,
        origin: { ...origin, projectId },
      }).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderContext({
        projectId,
        origin,
        accountId: 'acct',
      }).ok,
    ).toBe(false);
  });

  it('decodes a versioned receipt and refuses a fake grant without clip family or admitted origin', () => {
    const receipt = {
      version: RENDER_RECEIPT_VERSION,
      plannerRequestId: requestId,
      projectId,
      origin,
      sourceLocators: [locator],
      family: 'weighted-combination',
    };
    expect(
      decodePlannerRenderReceipt(receipt, requestId, decodeLocator),
    ).toEqual({ ok: true, value: receipt });
    expect(
      decodePlannerRenderReceipt(
        {
          ...receipt,
          origin: { sourceRevisionId: foreignRevisionId, path: origin.path },
        },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: { projectId, origin },
        plan: {
          status: 'unsupported',
          reason: 'unrelated-topic',
          textualContinuation: 'Text.',
          practicalContinuation: 'Practice.',
        },
        sourceLocators: [locator],
      }),
    ).toBeUndefined();
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: {
          projectId,
          origin: { sourceRevisionId: foreignRevisionId },
        },
        plan: clipPlan,
        sourceLocators: [locator],
      }),
    ).toBeUndefined();
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: { projectId, origin: highlightOrigin },
        plan: clipPlan,
        sourceLocators: [locator],
      }),
    ).toMatchObject({
      origin: highlightOrigin,
      family: 'weighted-combination',
    });
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: { projectId, origin },
        plan: {
          ...clipPlan,
          sourceSupport: {
            kind: 'cited-source',
            citations: [
              {
                sourceId: foreignSourceId,
                revisionId: sourceRevisionId,
                start: 0,
                end: 9,
                quote: 'Attention',
              },
            ],
          },
        },
        sourceLocators: [locator],
      }),
    ).toBeUndefined();
  });

  it('rejects malformed receipts and still freezes optional entry origin', () => {
    const entryOrigin = {
      sourceRevisionId,
      entry: {
        entryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
        revision: 1,
      },
    };
    expect(
      decodePlannerRenderContext({ projectId, origin: entryOrigin }),
    ).toEqual({
      ok: true,
      value: { projectId, origin: entryOrigin },
    });
    expect(
      decodePlannerRenderContext({
        projectId: 'not-a-uuid',
        origin,
      }).ok,
    ).toBe(false);
    expect(decodePlannerRenderContext({ origin }).ok).toBe(false);

    const receipt = {
      version: RENDER_RECEIPT_VERSION,
      plannerRequestId: requestId,
      projectId,
      origin,
      sourceLocators: [locator],
      family: 'weighted-combination' as const,
    };
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, version: 'nope' },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        {
          ...receipt,
          plannerRequestId: '22222222-2222-4222-8222-222222222222',
        },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, projectId: 'not-a-uuid' },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, family: 'spatial-assembly' },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, origin: { path: origin.path } },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, sourceLocators: locator },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, sourceLocators: [] },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        {
          ...receipt,
          sourceLocators: [locator, locator, locator, locator, locator],
        },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      decodePlannerRenderReceipt(
        { ...receipt, sourceLocators: [{ revisionId: foreignRevisionId }] },
        requestId,
        decodeLocator,
      ).ok,
    ).toBe(false);
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: { projectId, origin },
        plan: clipPlan,
        sourceLocators: [],
      }),
    ).toBeUndefined();
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: { projectId, origin },
        plan: clipPlan,
        sourceLocators: [locator, locator, locator, locator, locator],
      }),
    ).toBeUndefined();
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: { projectId, origin },
        plan: {
          status: 'supported',
          family: 'spatial-assembly',
          parameters: { separation: 0.4, selectedPart: 'base' },
          stages: [{ name: 'Assemble', seconds: 2 }],
          caption: 'Assembly',
          copy: clipPlan.copy,
          sourceSupport: clipPlan.sourceSupport,
          rationale: clipPlan.rationale,
        },
        sourceLocators: [locator],
      }),
    ).toBeUndefined();
    expect(
      constructRenderReceipt({
        requestId,
        renderContext: undefined,
        plan: clipPlan,
        sourceLocators: [locator],
      }),
    ).toBeUndefined();
  });
});
