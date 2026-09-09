import { describe, expect, it } from 'vitest';
import {
  decodeJobStatus,
  decodeSubmitRequest,
  recipeSha256,
  statusLeaksPath,
  WORKER_PROTOCOL,
} from './remote-protocol.js';

describe('remote worker protocol', () => {
  it('accepts a bounded submit and rejects path claims', () => {
    const recipeJson = '{"title":"Linear transform"}';
    const request = {
      protocol: WORKER_PROTOCOL,
      operation: 'submit' as const,
      ownerScope: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recipeJson,
      recipeHash: recipeSha256(recipeJson),
    };
    expect(decodeSubmitRequest(request)).toEqual(request);
    expect(
      decodeSubmitRequest({
        ...request,
        artifactPath: '/tmp/secret.mp4',
      }),
    ).toBeNull();
    expect(statusLeaksPath({ artifactPath: '/tmp/x' })).toBe(true);
  });

  it('rejects status payloads that leak paths', () => {
    expect(
      decodeJobStatus({
        protocol: WORKER_PROTOCOL,
        executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ownerScope: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        recipeHash: 'a'.repeat(64),
        status: 'succeeded',
        reason: null,
        sha256: 'b'.repeat(64),
        bytes: 64,
        verified: null,
        artifactPath: '/tmp/secret.mp4',
      }),
    ).toBeNull();
  });
});
