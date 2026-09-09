import { describe, expect, it, vi } from 'vitest';
import {
  claimClipPlayback,
  clipNotation,
  clipStageCaptionVtt,
  isOpaqueMediaUrl,
  stageAt,
  type RetainedClipView,
} from './retained-clip';

const clip: RetainedClipView = {
  mediaId: '00000000-0000-4000-8000-000000000001',
  requestId: '00000000-0000-4000-8000-000000000002',
  attemptId: '00000000-0000-4000-8000-000000000003',
  recipe: 'linear-transform',
  title: 'A shear moves every point',
  recipeHash: 'a'.repeat(64),
  sha256: 'b'.repeat(64),
  durationSeconds: 10,
  stages: [
    { name: 'Read the inputs', seconds: 0 },
    { name: 'Transform continuously', seconds: 2 },
    { name: 'Read the endpoint', seconds: 5 },
  ],
  endpoint: [2, 1],
  renderer: {
    name: 'manim-community',
    version: '0.21.0',
    image: 'manimcommunity/manim:v0.21.0@sha256:pinned',
  },
  origin: null,
  timings: { queueMs: 1, computeMs: 2, verifyMs: 3, transferMs: 4 },
};

describe('retained clip notation', () => {
  it('names the current stage and endpoint without exposing paths', () => {
    expect(clipNotation(clip)).toBe('A v = (2, 1)');
    expect(stageAt(clip, 0).name).toBe('Read the inputs');
    expect(stageAt(clip, 2.2).name).toBe('Transform continuously');
    expect(stageAt(clip, 9.5).name).toBe('Read the endpoint');
    expect(JSON.stringify(clip)).not.toContain('artifactPath');
    expect(JSON.stringify(clip)).not.toContain('file:');
    expect(JSON.stringify(clip)).not.toContain('https://');
    expect(clipNotation({ ...clip, recipe: 'weighted-combination' })).toBe(
      'result = (2, 1)',
    );
    expect(
      isOpaqueMediaUrl('ar-media://clip/00000000-0000-4000-8000-000000000001'),
    ).toBe(true);
    expect(isOpaqueMediaUrl('file:///tmp/secret.mp4')).toBe(false);
    expect(isOpaqueMediaUrl('https://example.test/clip.mp4')).toBe(false);
    const first = vi.fn();
    const second = vi.fn();
    claimClipPlayback(first);
    const release = claimClipPlayback(second);
    expect(first).toHaveBeenCalled();
    release();
    const late = vi.fn();
    let nested = false;
    const mutator = vi.fn(() => {
      if (nested) return;
      nested = true;
      claimClipPlayback(late);
    });
    claimClipPlayback(mutator);
    claimClipPlayback(vi.fn());
    expect(late).not.toHaveBeenCalled();
    expect(clipStageCaptionVtt(clip)).toContain('WEBVTT');
    expect(clipStageCaptionVtt(clip)).toContain('Read the inputs');
    expect(clipStageCaptionVtt(clip)).toContain('00:00:02.000');
    expect(clipStageCaptionVtt({ ...clip, stages: [] })).toContain(clip.title);
  });
});
