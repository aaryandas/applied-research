import { describe, expect, it } from 'vitest';
import {
  admitClipObjectUrl,
  isOpaqueClipObjectUrl,
  missingClipMedia,
  opaqueClipObjectUrl,
} from './explanation-clip-media';

describe('explanation clip media contract', () => {
  it('admits only opaque ar-media clip URLs from main', async () => {
    expect(opaqueClipObjectUrl('24000000-0000-4000-8000-000000000001')).toBe(
      'ar-media://clip/24000000-0000-4000-8000-000000000001',
    );
    expect(() => opaqueClipObjectUrl('not-a-uuid')).toThrow(
      'Clip media identity must be a UUID.',
    );
    expect(
      isOpaqueClipObjectUrl(
        'ar-media://clip/24000000-0000-4000-8000-000000000001',
      ),
    ).toBe(true);
    expect(isOpaqueClipObjectUrl('blob:http://localhost/clip')).toBe(true);
    expect(isOpaqueClipObjectUrl('https://cdn.example/clip.mp4')).toBe(false);
    await expect(missingClipMedia()).resolves.toEqual({ status: 'missing' });
    expect(admitClipObjectUrl({ status: 'missing' })).toEqual({
      status: 'missing',
    });
    expect(
      admitClipObjectUrl({
        status: 'ready',
        objectUrl: 'blob:http://localhost/clip',
      }),
    ).toEqual({ status: 'corrupt' });
    expect(
      admitClipObjectUrl({
        status: 'ready',
        objectUrl: 'http://cdn.example/clip.mp4',
      }),
    ).toEqual({ status: 'corrupt' });
    expect(
      admitClipObjectUrl({
        status: 'ready',
        objectUrl: 'ar-media://clip/24000000-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      status: 'ready',
      objectUrl: 'ar-media://clip/24000000-0000-4000-8000-000000000001',
    });
    expect(
      admitClipObjectUrl({
        status: 'ready',
        objectUrl: 'file:///tmp/secret.mp4',
      }),
    ).toEqual({ status: 'corrupt' });
    expect(
      admitClipObjectUrl({
        status: 'ready',
        objectUrl: 'https://cdn.example/clip.mp4',
      }),
    ).toEqual({ status: 'corrupt' });
  });
});
