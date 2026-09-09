import { describe, expect, it } from 'vitest';
import type { SourceRevisionLocator } from '../../contracts/learning-api.js';
import {
  constructRenderReceipt,
  decodePlannerRenderContext,
  decodePlannerRenderReceipt,
  RENDER_RECEIPT_VERSION,
} from './render-context.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceRevisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pathId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const topicId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const lessonId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const origin = {
  sourceRevisionId,
  path: { pathId, pathRevision: 1, topicId, lessonId },
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

function decodeLocator(
  value: unknown,
): { ok: true; value: SourceRevisionLocator } | { ok: false; reason: 'shape' } {
  if (value === locator) return { ok: true, value: locator };
  return { ok: false, reason: 'shape' };
}

describe('planner render context', () => {
  it('freezes full origin/path/revision and rejects sparse or extra authority', () => {
    const decoded = decodePlannerRenderContext({ projectId, origin });
    expect(decoded).toEqual({
      ok: true,
      value: { projectId, origin },
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
        origin: {
          sourceRevisionId,
          path: { pathId, pathRevision: 1, topicId },
        },
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

  it('decodes a versioned receipt and refuses a fake grant without clip family', () => {
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
  });
});
