import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetainedClipPlayer } from './RetainedClipPlayer';
import type {
  RetainedClipMediaAccess,
  RetainedClipView,
} from './retained-clip';

const CLIP_A = '00000000-0000-4000-8000-000000000001';
const CLIP_B = '00000000-0000-4000-8000-000000000099';

const clip: RetainedClipView = {
  mediaId: CLIP_A,
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
  origin: {
    projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sourceVersionId: null,
    questionId: null,
    lessonId: null,
  },
  timings: { queueMs: 4, computeMs: 1200, verifyMs: 80, transferMs: 40 },
};

function clipAt(
  mediaId: string,
  overrides: Partial<RetainedClipView> = {},
): RetainedClipView {
  return { ...clip, mediaId, ...overrides };
}

function access(
  result:
    | Awaited<ReturnType<RetainedClipMediaAccess['open']>>
    | (() => Promise<Awaited<ReturnType<RetainedClipMediaAccess['open']>>>) = {
    status: 'ready',
    objectUrl: 'blob:http://localhost/clip',
  },
): RetainedClipMediaAccess {
  return {
    open: vi.fn(async () => (typeof result === 'function' ? result() : result)),
    revoke: vi.fn(),
  };
}

function deferredOpen(): {
  promise: Promise<Awaited<ReturnType<RetainedClipMediaAccess['open']>>>;
  resolve: (
    value: Awaited<ReturnType<RetainedClipMediaAccess['open']>>,
  ) => void;
} {
  let resolve!: (
    value: Awaited<ReturnType<RetainedClipMediaAccess['open']>>,
  ) => void;
  const promise = new Promise<
    Awaited<ReturnType<RetainedClipMediaAccess['open']>>
  >((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

type HarnessMedia = HTMLMediaElement & { _paused?: boolean; _time?: number };

const mediaDescriptors = {
  paused: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused'),
  duration: Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'duration',
  ),
  currentTime: Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'currentTime',
  ),
};

function mockMedia(): void {
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get() {
      return (this as HarnessMedia)._paused !== false;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 10,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get() {
      return (this as HarnessMedia)._time ?? 0;
    },
    set(value: number) {
      (this as HarnessMedia)._time = value;
      this.dispatchEvent(new Event('seeked'));
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HarnessMedia,
  ) {
    this._paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HarnessMedia,
  ) {
    this._paused = true;
    this.dispatchEvent(new Event('pause'));
  });
}

function videoSrc(): string | null {
  return document.querySelector('video')?.getAttribute('src') ?? null;
}

function stubCaptionUrls(): void {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:http://localhost/captions';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => undefined;
  }
}

beforeEach(() => {
  mockMedia();
  stubCaptionUrls();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [name, descriptor] of Object.entries(mediaDescriptors)) {
    if (descriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, name, descriptor);
    }
  }
});

describe('RetainedClipPlayer access refusals', () => {
  it('surfaces unauthorized and corrupt alerts without a video source', async () => {
    const unauthorized = access({ status: 'unauthorized' });
    render(
      <RetainedClipPlayer clip={clip} status="ready" access={unauthorized} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This clip is not available to this account.',
      ),
    );
    expect(videoSrc()).toBeNull();

    cleanup();
    const corrupt = access({ status: 'corrupt' });
    render(<RetainedClipPlayer clip={clip} status="ready" access={corrupt} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The retained clip could not be verified.',
      ),
    );
    expect(videoSrc()).toBeNull();
  });

  it('refuses remote and filesystem URLs returned from open', async () => {
    const remote = access({
      status: 'ready',
      objectUrl: 'https://example.invalid/clip.mp4',
    });
    render(<RetainedClipPlayer clip={clip} status="ready" access={remote} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The retained clip is missing.',
      ),
    );
    expect(videoSrc()).toBeNull();
    expect(remote.revoke).not.toHaveBeenCalled();

    cleanup();
    const fileUrl = access({
      status: 'ready',
      objectUrl: 'file:///tmp/clip.mp4',
    });
    render(<RetainedClipPlayer clip={clip} status="ready" access={fileUrl} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The retained clip is missing.',
      ),
    );
    expect(videoSrc()).toBeNull();
  });
});

describe('RetainedClipPlayer open lifecycle', () => {
  it('revokes a late ready URL after unmount and after clip replacement', async () => {
    const late = deferredOpen();
    const first = access(() => late.promise);
    const { unmount } = render(
      <RetainedClipPlayer clip={clip} status="ready" access={first} />,
    );
    await waitFor(() => expect(first.open).toHaveBeenCalledWith(CLIP_A));
    unmount();
    late.resolve({
      status: 'ready',
      objectUrl: 'blob:http://localhost/late',
    });
    await waitFor(() =>
      expect(first.revoke).toHaveBeenCalledWith('blob:http://localhost/late'),
    );
    expect(first.revoke).toHaveBeenCalledTimes(1);

    const readyA = deferredOpen();
    const media = {
      open: vi.fn(async (mediaId: string) => {
        if (mediaId === CLIP_A) return readyA.promise;
        return {
          status: 'ready' as const,
          objectUrl: 'blob:http://localhost/b',
        };
      }),
      revoke: vi.fn(),
    };
    const view = render(
      <RetainedClipPlayer clip={clip} status="ready" access={media} />,
    );
    await waitFor(() => expect(media.open).toHaveBeenCalledWith(CLIP_A));
    view.rerender(
      <RetainedClipPlayer
        clip={clipAt(CLIP_B, { title: 'Replacement clip' })}
        status="ready"
        access={media}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('Replacement clip')).toBeVisible(),
    );
    await waitFor(() => expect(videoSrc()).toBe('blob:http://localhost/b'));
    readyA.resolve({
      status: 'ready',
      objectUrl: 'blob:http://localhost/a',
    });
    await waitFor(() =>
      expect(media.revoke).toHaveBeenCalledWith('blob:http://localhost/a'),
    );
    expect(videoSrc()).toBe('blob:http://localhost/b');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a late missing result for a replaced clip and revokes the owned URL once', async () => {
    const late = deferredOpen();
    const media = {
      open: vi.fn(async (mediaId: string) => {
        if (mediaId === CLIP_A) return late.promise;
        return {
          status: 'ready' as const,
          objectUrl: 'blob:http://localhost/current',
        };
      }),
      revoke: vi.fn(),
    };
    const view = render(
      <RetainedClipPlayer clip={clip} status="ready" access={media} />,
    );
    await waitFor(() => expect(media.open).toHaveBeenCalledWith(CLIP_A));
    view.rerender(
      <RetainedClipPlayer
        clip={clipAt(CLIP_B)}
        status="ready"
        access={media}
      />,
    );
    await waitFor(() =>
      expect(videoSrc()).toBe('blob:http://localhost/current'),
    );
    late.resolve({ status: 'corrupt' });
    await waitFor(() => expect(media.open).toHaveBeenCalledWith(CLIP_B));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(videoSrc()).toBe('blob:http://localhost/current');
    view.unmount();
    expect(media.revoke).toHaveBeenCalledWith('blob:http://localhost/current');
    expect(media.revoke).toHaveBeenCalledTimes(1);
  });
});

describe('RetainedClipPlayer empty and retry states', () => {
  it('renders queued, verifying, cancelled and failed empty states without opening media', () => {
    const media = access();
    const cancel = vi.fn();
    const retry = vi.fn();
    const view = render(
      <RetainedClipPlayer
        clip={null}
        status="rendering"
        access={media}
        onCancel={cancel}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Rendering the installed recipe.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel render' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Retry render' })).toBeNull();
    expect(document.querySelector('video')).toBeNull();

    view.rerender(
      <RetainedClipPlayer
        clip={null}
        status="verifying"
        access={media}
        onCancel={cancel}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verifying the delivered clip.',
    );
    expect(screen.queryByRole('button', { name: 'Cancel render' })).toBeNull();

    view.rerender(
      <RetainedClipPlayer
        clip={null}
        status="cancelled"
        access={media}
        onCancel={cancel}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'The render was cancelled.',
    );
    expect(screen.queryByRole('button', { name: 'Cancel render' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry render' })).toBeNull();

    view.rerender(
      <RetainedClipPlayer
        clip={null}
        status="failed"
        error="Capacity is exhausted."
        access={media}
        onCancel={cancel}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Capacity is exhausted.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry render' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(media.open).not.toHaveBeenCalled();
  });

  it('keeps a prior ready clip while rendering, opens offline-ready media and retries missing or corrupt', async () => {
    const prior = access({
      status: 'ready',
      objectUrl: 'blob:http://localhost/prior',
    });
    const retry = vi.fn();
    render(
      <RetainedClipPlayer
        clip={clipAt(CLIP_B, { title: 'Newer clip' })}
        priorClip={clip}
        status="rendering"
        access={prior}
        onRetry={retry}
      />,
    );
    await waitFor(() => expect(prior.open).toHaveBeenCalledWith(CLIP_A));
    expect(screen.getByText('A shear moves every point')).toBeVisible();
    expect(videoSrc()).toBe('blob:http://localhost/prior');
    expect(screen.getByRole('status')).toHaveTextContent(
      'A newer render is in progress.',
    );
    expect(screen.queryByText('Previous clip is still available.')).toBeNull();

    cleanup();
    const offline = access({
      status: 'ready',
      objectUrl: 'blob:http://localhost/offline',
    });
    render(
      <RetainedClipPlayer
        clip={clip}
        status="offline-ready"
        access={offline}
      />,
    );
    await waitFor(() => expect(offline.open).toHaveBeenCalledWith(CLIP_A));
    expect(videoSrc()).toBe('blob:http://localhost/offline');

    cleanup();
    const missing = access({ status: 'missing' });
    const missingRetry = vi.fn();
    render(
      <RetainedClipPlayer
        clip={clip}
        status="missing"
        access={missing}
        onRetry={missingRetry}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The retained clip is missing.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry render' }));
    expect(missingRetry).toHaveBeenCalledOnce();

    cleanup();
    const corrupt = access({ status: 'corrupt' });
    const corruptRetry = vi.fn();
    render(
      <RetainedClipPlayer
        clip={clip}
        status="corrupt"
        access={corrupt}
        onRetry={corruptRetry}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The retained clip could not be verified.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry render' }));
    expect(corruptRetry).toHaveBeenCalledOnce();
  });
});

describe('RetainedClipPlayer playback and provenance', () => {
  it('keeps first-play timing, pauses from the keyboard, clamps arrows and shows unbound origin', async () => {
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const media = access();
    const unbound = clipAt(CLIP_A, { origin: null });
    render(<RetainedClipPlayer clip={unbound} status="ready" access={media} />);
    await waitFor(() => expect(videoSrc()).toBe('blob:http://localhost/clip'));
    fireEvent.click(screen.getByText('Renderer identity'));
    expect(screen.getByText(/origin unbound/)).toBeVisible();
    now = 10_240;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(
      screen.getByText(/playback started after 240 ms in this view/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    now = 11_000;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(
      screen.getByText(/playback started after 240 ms in this view/),
    ).toBeVisible();
    const player = document.querySelector('video');
    expect(player).toBeTruthy();
    fireEvent.keyDown(player!, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    fireEvent.input(screen.getByLabelText('Clip position'), {
      target: { value: '0' },
    });
    fireEvent.keyDown(player!, { key: 'ArrowLeft' });
    expect(screen.getByLabelText('Clip position')).toHaveValue('0');
    fireEvent.input(screen.getByLabelText('Clip position'), {
      target: { value: '10' },
    });
    fireEvent.keyDown(player!, { key: 'ArrowRight' });
    expect(screen.getByLabelText('Clip position')).toHaveValue('10');
  });
});
