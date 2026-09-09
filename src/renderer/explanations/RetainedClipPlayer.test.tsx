import { useState, type ReactElement } from 'react';
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
  origin: {
    projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sourceVersionId: null,
    questionId: null,
    lessonId: null,
  },
  timings: { queueMs: 4, computeMs: 1200, verifyMs: 80, transferMs: 40 },
};

function access(
  result: Awaited<ReturnType<RetainedClipMediaAccess['open']>> = {
    status: 'ready',
    objectUrl: 'blob:http://localhost/clip',
  },
): RetainedClipMediaAccess {
  return {
    open: vi.fn(async () => result),
    revoke: vi.fn(),
  };
}

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

type HarnessMedia = HTMLMediaElement & { _paused?: boolean; _time?: number };

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RetainedClipPlayer', () => {
  it('plays, scrubs, jumps stages, enlarges at the paused position and keeps prior clips', async () => {
    const media = access();
    const retry = vi.fn();
    const { rerender } = render(
      <RetainedClipPlayer
        clip={clip}
        status="ready"
        access={media}
        onRetry={retry}
      />,
    );
    await waitFor(() => expect(media.open).toHaveBeenCalledWith(clip.mediaId));
    expect(screen.getByText('A v = (2, 1)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.input(screen.getByLabelText('Clip position'), {
      target: { value: '3.5' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Transform continuously' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge' }));
    expect(screen.getByRole('button', { name: 'Resume inline' })).toBeVisible();
    expect(screen.getByLabelText('Clip position')).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: 'Resume inline' }));
    rerender(
      <RetainedClipPlayer
        clip={null}
        priorClip={clip}
        status="failed"
        error="The newer render failed."
        access={media}
        onRetry={retry}
      />,
    );
    expect(screen.getByText('A shear moves every point')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('newer render failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry render' }));
    expect(retry).toHaveBeenCalled();
  });

  it('pauses when hidden, honors reduced motion, and keeps one active playback', async () => {
    const media = access();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    function Pair(): ReactElement {
      const [left] = useState(clip);
      const right = {
        ...clip,
        mediaId: '00000000-0000-4000-8000-000000000099',
      };
      return (
        <>
          <RetainedClipPlayer clip={left} status="ready" access={media} />
          <RetainedClipPlayer clip={right} status="ready" access={media} />
        </>
      );
    }
    render(<Pair />);
    await waitFor(() => expect(media.open).toHaveBeenCalled());
    expect(
      screen.getAllByText(/starts paused \(reduced motion\)/),
    ).toHaveLength(2);
    const playButtons = screen.getAllByRole('button', { name: 'Play' });
    fireEvent.click(playButtons[0]!);
    fireEvent.click(playButtons[1]!);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    fireEvent(document, new Event('visibilitychange'));
  });

  it('refuses filesystem or remote URLs smuggled in clip records', () => {
    const poisoned = {
      ...clip,
      title: 'file:///tmp/secret.mp4',
    };
    render(
      <RetainedClipPlayer clip={poisoned} status="ready" access={access()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No retained clip is available',
    );
  });

  it('starts paused, jumps from the keyboard, and preserves a missing-media error', async () => {
    const media = access();
    render(<RetainedClipPlayer clip={clip} status="ready" access={media} />);
    await waitFor(() => expect(media.open).toHaveBeenCalled());
    const player = document.querySelector('video');
    expect(player).toBeTruthy();
    await waitFor(() =>
      expect(player?.querySelector('track[kind="captions"]')).not.toBeNull(),
    );
    fireEvent.keyDown(player!, { key: 'k' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
    fireEvent.keyDown(player!, { key: 'ArrowLeft' });
    fireEvent.keyDown(player!, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    fireEvent.keyDown(player!, { key: 'ArrowRight' });
    fireEvent.keyDown(player!, { key: 'Home' });
    fireEvent.keyDown(player!, { key: 'e' });
    expect(screen.getByRole('button', { name: 'Resume inline' })).toBeVisible();
    fireEvent.keyDown(player!, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Enlarge' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Enlarge' }), {
      key: ' ',
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enlarge' })).toBeVisible();
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Transform continuously' }),
      { key: ' ' },
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();
    fireEvent.input(screen.getByLabelText('Clip position'), {
      target: { value: '2' },
    });
    fireEvent.keyDown(screen.getByLabelText('Clip position'), {
      key: 'ArrowRight',
    });
    expect(screen.getByLabelText('Clip position')).toHaveValue('2');
    cleanup();
    const missing = access({ status: 'missing' });
    render(
      <RetainedClipPlayer
        clip={clip}
        status="ready"
        access={missing}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('missing'),
    );
    cleanup();
    render(
      <RetainedClipPlayer
        clip={null}
        status="queued"
        access={access()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Queued');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel render' }));
  });
});
