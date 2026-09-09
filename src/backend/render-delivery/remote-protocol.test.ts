import { describe, expect, it } from 'vitest';
import {
  decodeJobRef,
  decodeJobStatus,
  decodeSubmitRequest,
  publicJobStatus,
  recipeSha256,
  statusLeaksPath,
  WORKER_PROTOCOL,
} from './remote-protocol.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXECUTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PINNED =
  'manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3';

function verified(origin: unknown = null) {
  return {
    renderer: {
      name: 'manim-community',
      version: '0.21.0',
      image: PINNED,
    },
    recipe: {
      recipe: 'linear-transform',
      version: 1,
      assetVersion: 'original-manim-1',
      title: 'Linear transform',
      origin,
    },
    recipeHash: 'a'.repeat(64),
    durationSeconds: 10,
    width: 1280,
    height: 720,
    stages: [{ name: 'Read the inputs', seconds: 2 }],
    endpoint: [2, 1],
    timings: { queueMs: 1, computeMs: 2, verifyMs: 3 },
  };
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    protocol: WORKER_PROTOCOL,
    executionId: EXECUTION,
    ownerScope: OWNER,
    requestId: REQUEST,
    recipeHash: 'a'.repeat(64),
    status: 'succeeded',
    reason: null,
    sha256: 'b'.repeat(64),
    bytes: 64,
    verified: null,
    ...overrides,
  };
}

describe('remote worker protocol', () => {
  it('accepts a bounded submit and rejects invalid or leaking payloads', () => {
    const recipeJson = '{"title":"Linear transform"}';
    const request = {
      protocol: WORKER_PROTOCOL,
      operation: 'submit' as const,
      ownerScope: OWNER,
      requestId: REQUEST,
      recipeJson,
      recipeHash: recipeSha256(recipeJson),
    };
    expect(decodeSubmitRequest(request)).toEqual(request);
    expect(decodeSubmitRequest(null)).toBeNull();
    expect(decodeSubmitRequest({ ...request, protocol: 'other' })).toBeNull();
    expect(decodeSubmitRequest({ ...request, operation: 'status' })).toBeNull();
    expect(decodeSubmitRequest({ ...request, ownerScope: 'nope' })).toBeNull();
    expect(decodeSubmitRequest({ ...request, recipeJson: '' })).toBeNull();
    expect(
      decodeSubmitRequest({ ...request, recipeJson: 'x'.repeat(4097) }),
    ).toBeNull();
    expect(
      decodeSubmitRequest({ ...request, recipeHash: 'c'.repeat(64) }),
    ).toBeNull();
    expect(
      decodeSubmitRequest({ ...request, artifactPath: '/tmp/secret.mp4' }),
    ).toBeNull();
    expect(statusLeaksPath({ href: 'file://tmp' })).toBe(true);
    expect(statusLeaksPath({ image: 'docker' })).toBe(true);
    expect(statusLeaksPath({ ok: true })).toBe(false);
  });

  it('decodes job refs and public status without worker paths', () => {
    const ref = {
      protocol: WORKER_PROTOCOL,
      operation: 'status' as const,
      ownerScope: OWNER,
      executionId: EXECUTION,
    };
    expect(decodeJobRef(ref, 'status')).toEqual(ref);
    expect(decodeJobRef(ref, 'cancel')).toBeNull();
    expect(decodeJobRef(null, 'status')).toBeNull();
    expect(decodeJobRef({ ...ref, protocol: 'x' }, 'status')).toBeNull();
    expect(decodeJobRef({ ...ref, ownerScope: 'nope' }, 'status')).toBeNull();
    const job = decodeJobStatus(status({ reason: 'runtime' }));
    expect(job?.reason).toBe('runtime');
    expect(JSON.stringify(publicJobStatus(job!))).not.toContain('artifactPath');
  });

  it('decodes verified metadata and origin UUID projections', () => {
    const withOrigin = decodeJobStatus(
      status({
        verified: verified({
          projectId: OWNER,
          sourceVersionId: REQUEST,
          questionId: null,
          lessonId: EXECUTION,
        }),
      }),
    );
    expect(withOrigin?.verified?.recipe.origin).toEqual({
      projectId: OWNER,
      sourceVersionId: REQUEST,
      questionId: null,
      lessonId: EXECUTION,
    });
    expect(
      decodeJobStatus(status({ verified: verified(null) }))?.verified?.recipe
        .origin,
    ).toBeNull();
    expect(
      decodeJobStatus(
        status({
          verified: verified({
            projectId: OWNER,
            sourceVersionId: null,
            questionId: EXECUTION,
            lessonId: null,
          }),
        }),
      )?.verified?.recipe.origin?.questionId,
    ).toBe(EXECUTION);
    expect(decodeJobStatus(status({ sha256: 'nope', bytes: 1.5 }))).toEqual(
      expect.objectContaining({ sha256: null, bytes: null }),
    );
    expect(decodeJobStatus({ protocol: WORKER_PROTOCOL })).toBeNull();
    expect(
      decodeJobStatus(status({ verified: { artifactPath: 'x' } })),
    ).toBeNull();
    expect(decodeJobStatus(status({ verified: 'nope' }))).toBeNull();
    expect(
      decodeJobStatus(
        status({
          verified: { ...verified(), renderer: { name: 'other' } },
        }),
      ),
    ).toBeNull();
    expect(
      decodeJobStatus(
        status({
          verified: {
            ...verified(),
            recipe: { ...verified().recipe, recipe: 'other' },
          },
        }),
      ),
    ).toBeNull();
    expect(
      decodeJobStatus(status({ verified: { ...verified(), width: 1 } })),
    ).toBeNull();
    expect(
      decodeJobStatus(status({ verified: { ...verified(), endpoint: [1] } })),
    ).toBeNull();
    expect(
      decodeJobStatus(
        status({
          verified: {
            ...verified(),
            recipe: { ...verified().recipe, origin: 1 },
          },
        }),
      ),
    ).toBeNull();
  });
});
