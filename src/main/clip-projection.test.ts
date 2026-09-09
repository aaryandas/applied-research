import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SupportedExplanationPlan } from '../contracts/explanation-artifacts';
import {
  clipResultFromRetained,
  isSupportedClipPlan,
  recipeJsonFromClipPlan,
} from './clip-projection';
import type { RetainedClipRecord } from './retained-media-store';

const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PINNED =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';

function linearPlan(
  overrides: Partial<
    Extract<SupportedExplanationPlan, { family: 'linear-transform' }>
  > = {},
): Extract<SupportedExplanationPlan, { family: 'linear-transform' }> {
  return {
    status: 'supported',
    family: 'linear-transform',
    parameters: {
      matrix: [
        [1, 1],
        [0, 1],
      ],
      vector: [1, 1],
    },
    stages: [{ name: 'Show shear', seconds: 2 }],
    caption: 'A shear moves every point',
    copy: {
      role: 'untrusted-display-copy',
      title: 'Shear',
      quote: null,
    },
    sourceSupport: {
      kind: 'illustrative-assumption',
      note: 'Illustration only.',
    },
    rationale: {
      role: 'untrusted-display-copy',
      text: 'The installed linear-transform recipe can illustrate this.',
    },
    ...overrides,
  };
}

describe('clip recipe projection', () => {
  it('maps only installed clip parameters and keeps revision-bearing origin off the recipe JSON', () => {
    const origin = {
      sourceRevisionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      highlightId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      path: {
        pathId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        pathRevision: 3,
        topicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      entry: {
        entryId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        revision: 2,
      },
    };
    const mapped = recipeJsonFromClipPlan({
      plan: linearPlan(),
      requestId: REQUEST,
      projectId: PROJECT,
      origin,
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error('map');
    const parsed = JSON.parse(mapped.json) as {
      origin: Record<string, unknown>;
      title: string;
      id: string;
    };
    expect(parsed.id).toBe(REQUEST);
    expect(parsed.origin).toEqual({
      projectId: PROJECT,
      sourceVersionId: origin.sourceRevisionId,
      questionId: null,
      lessonId: origin.highlightId,
    });
    expect(parsed.origin).not.toHaveProperty('path');
    expect(parsed.origin).not.toHaveProperty('entry');
    expect(JSON.stringify(parsed)).not.toContain('artifactPath');
  });

  it('uses fixed ASCII titles and labels when planner copy cannot enter the recipe', () => {
    const mapped = recipeJsonFromClipPlan({
      plan: linearPlan({ caption: '剪切变换' }),
      requestId: REQUEST,
      projectId: PROJECT,
      origin: { sourceRevisionId: PROJECT },
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error('map');
    expect(JSON.parse(mapped.json).title).toBe('Linear transform');
  });

  it('rejects unsupported mathematics instead of clamping it', () => {
    const mapped = recipeJsonFromClipPlan({
      plan: linearPlan({
        parameters: {
          matrix: [
            [99, 0],
            [0, 1],
          ],
          vector: [1, 1],
        },
      }),
      requestId: REQUEST,
      projectId: PROJECT,
      origin: {},
    });
    expect(mapped.ok).toBe(false);
  });

  it('projects a verified retained clip into the existing result fields', () => {
    const plan = linearPlan();
    const bytes = 64;
    const record: RetainedClipRecord = {
      mediaId: randomUUID(),
      requestId: REQUEST,
      attemptId: randomUUID(),
      accountId: REQUEST,
      recipe: 'linear-transform',
      version: 1,
      assetVersion: 'original-manim-1',
      title: 'Linear transform',
      recipeHash: 'a'.repeat(64),
      sha256: 'b'.repeat(64),
      bytes,
      durationSeconds: 10,
      width: 1280,
      height: 720,
      mediaType: 'video/mp4',
      stages: [{ name: 'Read the inputs', seconds: 0 }],
      endpoint: [2, 1],
      renderer: {
        name: 'manim-community',
        version: '0.21.0',
        image: PINNED,
      },
      origin: {
        projectId: PROJECT,
        sourceVersionId: null,
        questionId: null,
        lessonId: null,
      },
      timings: { queueMs: 1, computeMs: 2, verifyMs: 3, transferMs: 4 },
    };
    const result = clipResultFromRetained(record, plan);
    expect(result).toEqual({
      kind: 'clip',
      family: 'linear-transform',
      assetVersion: 'original-manim-1',
      media: { kind: 'app-retained-media', artifactId: record.mediaId },
      verified: {
        sha256: record.sha256,
        mediaType: 'video/mp4',
        bytes,
        width: 1280,
        height: 720,
        durationSeconds: 10,
        stages: plan.stages,
        renderer: record.renderer,
      },
    });
    expect(JSON.stringify(result)).not.toContain(record.accountId);
    expect(JSON.stringify(result)).not.toContain('artifactPath');
    expect(isSupportedClipPlan(plan)).toBe(true);
  });

  it('maps weighted labels, rejects bad identity, and refuses mismatched retained clips', () => {
    const weighted: Extract<
      SupportedExplanationPlan,
      { family: 'weighted-combination' }
    > = {
      status: 'supported',
      family: 'weighted-combination',
      parameters: {
        vectors: [
          [2, 1],
          [-1, 2],
        ],
        weights: [3, 1],
        labels: ['第一', '第二'],
      },
      stages: [{ name: 'Show weights', seconds: 2 }],
      caption: 'Weights become shares',
      copy: {
        role: 'untrusted-display-copy',
        title: 'Weights',
        quote: null,
      },
      sourceSupport: {
        kind: 'illustrative-assumption',
        note: 'Illustration only.',
      },
      rationale: {
        role: 'untrusted-display-copy',
        text: 'The installed weighted-combination recipe can illustrate this.',
      },
    };
    const mapped = recipeJsonFromClipPlan({
      plan: weighted,
      requestId: REQUEST,
      projectId: PROJECT,
      origin: {},
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) throw new Error('map');
    expect(JSON.parse(mapped.json).parameters.labels).toEqual(['v1', 'v2']);
    expect(
      recipeJsonFromClipPlan({
        plan: linearPlan(),
        requestId: 'nope',
        projectId: PROJECT,
        origin: {},
      }).ok,
    ).toBe(false);
    const record: RetainedClipRecord = {
      mediaId: 'not-a-uuid',
      requestId: REQUEST,
      attemptId: REQUEST,
      accountId: REQUEST,
      recipe: 'weighted-combination',
      version: 1,
      assetVersion: 'original-manim-1',
      title: 'Weighted combination',
      recipeHash: 'a'.repeat(64),
      sha256: 'b'.repeat(64),
      bytes: 64,
      durationSeconds: 10,
      width: 1280,
      height: 720,
      mediaType: 'video/mp4',
      stages: [{ name: 'Show weights', seconds: 2 }],
      endpoint: [1, 1],
      renderer: {
        name: 'manim-community',
        version: '0.21.0',
        image: PINNED,
      },
      origin: null,
      timings: { queueMs: 1, computeMs: 2, verifyMs: 3, transferMs: 4 },
    };
    expect(clipResultFromRetained(record, weighted)).toBeNull();
    expect(isSupportedClipPlan(weighted)).toBe(true);
    const ascii = recipeJsonFromClipPlan({
      plan: {
        ...weighted,
        parameters: {
          ...weighted.parameters,
          labels: ['First vector', 'Second vector'],
        },
      },
      requestId: REQUEST,
      projectId: PROJECT,
      origin: { sourceRevisionId: 'not-a-uuid', highlightId: 'also-bad' },
    });
    expect(ascii.ok).toBe(true);
    if (!ascii.ok) throw new Error('ascii');
    expect(JSON.parse(ascii.json).parameters.labels).toEqual([
      'First vector',
      'Second vector',
    ]);
    expect(JSON.parse(ascii.json).origin.sourceVersionId).toBeNull();
    expect(JSON.parse(ascii.json).origin.lessonId).toBeNull();
    const mismatch = {
      ...record,
      mediaId: REQUEST,
      recipe: 'linear-transform' as const,
    };
    expect(clipResultFromRetained(mismatch, weighted)).toBeNull();
    expect(
      clipResultFromRetained(
        { ...mismatch, recipe: 'weighted-combination', sha256: 'nope' },
        weighted,
      ),
    ).toBeNull();
  });
});
