import { describe, expect, it } from 'vitest';
import { LINEAR_EXAMPLE } from './fixtures.js';
import { MANIM_IMAGE } from './docker.js';
import { mapWorkerOutcome, workerRenderEngine } from './delivery-engine.js';
import type { RenderOutcome } from './worker.js';

describe('worker delivery mapping', () => {
  it('keeps worker paths internal and preserves verified identity', () => {
    const outcome: RenderOutcome = {
      status: 'succeeded',
      jobId: '00000000-0000-4000-8000-000000000099',
      artifactPath: '/tmp/ar-manim/private/artifact.mp4',
      diagnostics: { stdout: 'AR_RENDER_COMPLETE', stderr: '' },
      artifact: {
        renderer: {
          name: 'manim-community',
          version: '0.21.0',
          image: MANIM_IMAGE,
        },
        recipe: LINEAR_EXAMPLE,
        recipeHash: 'a'.repeat(64),
        sha256: 'b'.repeat(64),
        bytes: 128,
        durationSeconds: 10,
        width: 1280,
        height: 720,
        mediaType: 'video/mp4',
        stages: [{ name: 'Read the inputs', seconds: 0 }],
        endpoint: [2, 1],
        timings: { queueMs: 1, computeMs: 2, verifyMs: 3 },
      },
    };
    const mapped = mapWorkerOutcome(outcome);
    expect(mapped.status).toBe('succeeded');
    if (mapped.status !== 'succeeded') throw new Error('map');
    expect(mapped.artifactPath).toBe(outcome.artifactPath);
    expect(mapped.artifact.endpoint).toEqual([2, 1]);
    expect(JSON.stringify(mapped.artifact)).not.toContain('artifactPath');
    expect(JSON.stringify(mapped.artifact)).not.toContain('/tmp/ar-manim');
  });

  it('forwards invalid, cancelled and failed outcomes without diagnostics', () => {
    expect(mapWorkerOutcome({ status: 'cancelled' })).toEqual({
      status: 'cancelled',
    });
    expect(
      mapWorkerOutcome({ status: 'invalid', reason: 'json' }),
    ).toMatchObject({ status: 'invalid' });
    expect(
      mapWorkerOutcome({
        status: 'failed',
        reason: 'runtime',
        diagnostics: { stdout: '', stderr: 'private' },
      }),
    ).toEqual({ status: 'failed', reason: 'runtime' });
    expect(
      JSON.stringify(mapWorkerOutcome({ status: 'cancelled' })),
    ).not.toContain('diagnostics');
  });

  it('adapts the worker engine without exposing diagnostics', async () => {
    const engine = workerRenderEngine({
      render: async () => ({ status: 'cancelled' }),
      release: async () => undefined,
      close: async () => undefined,
    } as never);
    expect(await engine.render('{}')).toEqual({ status: 'cancelled' });
    await engine.release('job');
    await engine.close();
  });
});
