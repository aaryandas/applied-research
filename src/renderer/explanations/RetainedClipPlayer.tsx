import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactElement,
  type SetStateAction,
} from 'react';
import { useSceneVisibility } from './useSceneVisibility';
import {
  claimClipPlayback,
  clipNotation,
  clipStageCaptionVtt,
  isOpaqueMediaUrl,
  stageAt,
  type ClipPlaybackStatus,
  type RetainedClipMediaAccess,
  type RetainedClipView,
} from './retained-clip';
import './retained-clip-player.css';

interface PlayerProps {
  readonly clip: RetainedClipView | null;
  readonly priorClip?: RetainedClipView | null;
  readonly status: ClipPlaybackStatus;
  readonly access: RetainedClipMediaAccess;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly onCancel?: () => void;
}

type OpenedMedia =
  | {
      readonly mediaId: string;
      readonly kind: 'ready';
      readonly objectUrl: string;
    }
  | {
      readonly mediaId: string;
      readonly kind: 'error';
      readonly message: string;
    };

function publicClip(clip: RetainedClipView | null): RetainedClipView | null {
  if (!clip) return null;
  const serialized = JSON.stringify(clip);
  if (
    serialized.includes('artifactPath') ||
    serialized.includes('file://') ||
    serialized.includes('http://') ||
    serialized.includes('https://')
  ) {
    return null;
  }
  return clip;
}

function openFailureMessage(
  status: 'missing' | 'corrupt' | 'unauthorized',
): string {
  if (status === 'unauthorized') {
    return 'This clip is not available to this account.';
  }
  if (status === 'corrupt') {
    return 'The retained clip could not be verified.';
  }
  return 'The retained clip is missing.';
}

function idleStatusMessage(
  status: ClipPlaybackStatus,
  error: string | null,
): string {
  if (status === 'queued') return 'Queued behind the isolated renderer.';
  if (status === 'rendering') return 'Rendering the installed recipe.';
  if (status === 'verifying') return 'Verifying the delivered clip.';
  if (status === 'cancelled') return 'The render was cancelled.';
  return error ?? 'No retained clip is available.';
}

function NoClipStatus({
  status,
  error,
  onRetry,
  onCancel,
}: {
  readonly status: ClipPlaybackStatus;
  readonly error: string | null;
  readonly onRetry: (() => void) | undefined;
  readonly onCancel: (() => void) | undefined;
}): ReactElement {
  return (
    <section className="retained-clip">
      <output className="retained-clip__status">
        {idleStatusMessage(status, error)}
      </output>
      {onCancel && (status === 'queued' || status === 'rendering') && (
        <button type="button" onClick={onCancel}>
          Cancel render
        </button>
      )}
      {onRetry && status === 'failed' && (
        <button type="button" onClick={onRetry}>
          Retry render
        </button>
      )}
    </section>
  );
}

function displayedClip(
  clip: RetainedClipView | null,
  priorClip: RetainedClipView | null,
  status: ClipPlaybackStatus,
): RetainedClipView | null {
  if (status === 'ready' || status === 'offline-ready') {
    return publicClip(clip);
  }
  return publicClip(priorClip ?? clip);
}

export function RetainedClipPlayer({
  clip,
  priorClip = null,
  status,
  access,
  error = null,
  onRetry,
  onCancel,
}: PlayerProps): ReactElement {
  const displayed = displayedClip(clip, priorClip, status);
  const mediaId = displayed?.mediaId ?? null;
  const [opened, setOpened] = useState<OpenedMedia | null>(null);

  useEffect(() => {
    if (!mediaId) return undefined;
    let cancelled = false;
    let revoked: string | null = null;
    void access.open(mediaId).then((result) => {
      if (cancelled) {
        if (result.status === 'ready') access.revoke(result.objectUrl);
        return;
      }
      if (result.status !== 'ready' || !isOpaqueMediaUrl(result.objectUrl)) {
        setOpened({
          mediaId,
          kind: 'error',
          message: openFailureMessage(
            result.status === 'ready' ? 'missing' : result.status,
          ),
        });
        return;
      }
      revoked = result.objectUrl;
      setOpened({ mediaId, kind: 'ready', objectUrl: result.objectUrl });
    });
    return () => {
      cancelled = true;
      if (revoked) access.revoke(revoked);
    };
  }, [access, mediaId]);

  if (!displayed || !mediaId) {
    return (
      <NoClipStatus
        status={status}
        error={error}
        onRetry={onRetry}
        onCancel={onCancel}
      />
    );
  }

  const current = opened?.mediaId === mediaId ? opened : null;
  const openError = current?.kind === 'error' ? current.message : null;
  const objectUrl = current?.kind === 'ready' ? current.objectUrl : null;

  return (
    <ClipSession
      key={mediaId}
      clip={displayed}
      objectUrl={objectUrl}
      openError={openError}
      status={status}
      error={error}
      usingPrior={Boolean(priorClip) && displayed === priorClip}
      onRetry={onRetry}
    />
  );
}

interface PlaybackKeyAction {
  readonly event: KeyboardEvent<HTMLVideoElement>;
  readonly enlarged: boolean;
  readonly jump: (seconds: number) => void;
  readonly setEnlarged: Dispatch<SetStateAction<boolean>>;
}

function handlePlaybackKeys(action: PlaybackKeyAction): void {
  const { event, enlarged, jump, setEnlarged } = action;
  if (event.target !== event.currentTarget) return;
  const element = event.currentTarget;
  if (event.key === ' ' || event.key === 'k') {
    event.preventDefault();
    if (element.paused) void element.play();
    else element.pause();
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    jump(Math.min(element.duration || 10, element.currentTime + 1));
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    jump(Math.max(0, element.currentTime - 1));
  }
  if (event.key === 'Home') {
    event.preventDefault();
    jump(0);
  }
  if (event.key === 'Escape' && enlarged) {
    event.preventDefault();
    setEnlarged(() => false);
  }
  if (event.key === 'f' || event.key === 'e') {
    event.preventDefault();
    setEnlarged((value) => !value);
  }
}

function ClipSession({
  clip,
  objectUrl,
  openError,
  status,
  error,
  usingPrior,
  onRetry,
}: {
  readonly clip: RetainedClipView;
  readonly objectUrl: string | null;
  readonly openError: string | null;
  readonly status: ClipPlaybackStatus;
  readonly error: string | null;
  readonly usingPrior: boolean;
  readonly onRetry: (() => void) | undefined;
}): ReactElement {
  const host = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const readyAt = useRef<number | null>(null);
  const { visible, reducedMotion } = useSceneVisibility(host);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [enlarged, setEnlarged] = useState(false);
  const [playbackStartMs, setPlaybackStartMs] = useState<number | null>(null);
  const labelId = useId();
  const failedOpen = Boolean(openError && usingPrior);
  const [captionUrl, setCaptionUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(
      new Blob([clipStageCaptionVtt(clip)], { type: 'text/vtt' }),
    );
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setCaptionUrl(url);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [clip]);

  useEffect(() => {
    if (objectUrl) readyAt.current = performance.now();
  }, [objectUrl]);

  useEffect(() => {
    const element = video.current;
    if (!element) return undefined;
    const pause = (): void => {
      element.pause();
    };
    const release = claimClipPlayback(pause);
    const onPlay = (): void => {
      claimClipPlayback(pause);
      setPaused(false);
      setPlaybackStartMs((current) => {
        if (current !== null) return current;
        return performance.now() - (readyAt.current ?? performance.now());
      });
    };
    const onPause = (): void => setPaused(true);
    const onTime = (): void => setCurrentTime(element.currentTime);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element.addEventListener('timeupdate', onTime);
    element.addEventListener('seeked', onTime);
    return () => {
      release();
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('seeked', onTime);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!visible) video.current?.pause();
  }, [visible]);

  const jump = (seconds: number): void => {
    const element = video.current;
    if (!element) return;
    element.pause();
    element.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const stage = stageAt(clip, currentTime);
  const busy =
    status === 'queued' || status === 'rendering' || status === 'verifying';

  return (
    <section
      className={`retained-clip${enlarged ? ' retained-clip--enlarged' : ''}`}
      ref={host}
      aria-label="Retained explanation clip"
    >
      <div className="retained-clip__stage">
        <video
          ref={video}
          aria-labelledby={labelId}
          src={objectUrl ?? undefined}
          controls={false}
          preload="metadata"
          playsInline
          tabIndex={0}
          onKeyDown={(event) =>
            handlePlaybackKeys({ event, enlarged, jump, setEnlarged })
          }
        >
          {captionUrl ? (
            <track
              kind="captions"
              src={captionUrl}
              srcLang="en"
              label="Named stages"
              default
            />
          ) : null}
        </video>
      </div>
      <h2 id={labelId}>{clip.title}</h2>
      <p className="retained-clip__caption">
        {stage.name}
        {reducedMotion ? ' · starts paused (reduced motion)' : ''}
      </p>
      <p className="retained-clip__notation">{clipNotation(clip)}</p>
      <div className="retained-clip__controls">
        <button
          type="button"
          aria-pressed={!paused}
          onClick={() => {
            const element = video.current;
            if (!element) return;
            if (element.paused) void element.play();
            else element.pause();
          }}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
        <input
          type="range"
          min={0}
          max={clip.durationSeconds}
          step={0.05}
          value={currentTime}
          aria-label="Clip position"
          onInput={(event) => jump(Number(event.currentTarget.value))}
        />
        <button
          type="button"
          aria-pressed={enlarged}
          onClick={() => setEnlarged((value) => !value)}
        >
          {enlarged ? 'Resume inline' : 'Enlarge'}
        </button>
      </div>
      <div
        className="retained-clip__stages"
        role="toolbar"
        aria-label="Named stages"
      >
        {clip.stages.map((item) => (
          <button
            key={`${item.name}-${item.seconds}`}
            type="button"
            aria-pressed={stage.name === item.name}
            onClick={() => jump(item.seconds)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {(error || openError) && (
        <p className="retained-clip__error" role="alert">
          {openError ?? error}
          {failedOpen ? ' Previous clip is still available.' : ''}
        </p>
      )}
      {busy && (
        <output className="retained-clip__status">
          A newer render is in progress.
        </output>
      )}
      {onRetry &&
        (status === 'failed' ||
          status === 'corrupt' ||
          status === 'missing') && (
          <button type="button" onClick={onRetry}>
            Retry render
          </button>
        )}
      <p className="retained-clip__timings">
        Queue {Math.round(clip.timings.queueMs)} ms · compute{' '}
        {Math.round(clip.timings.computeMs)} ms · verify{' '}
        {Math.round(clip.timings.verifyMs)} ms · transfer{' '}
        {Math.round(clip.timings.transferMs)} ms
        {playbackStartMs !== null
          ? ` · playback started after ${Math.round(playbackStartMs)} ms in this view`
          : ''}
      </p>
      <details className="retained-clip__provenance">
        <summary>Renderer identity</summary>
        <pre>
          {clip.renderer.name} {clip.renderer.version}
          {'\n'}
          {clip.recipe} · {clip.recipeHash}
          {'\n'}
          sha256 {clip.sha256}
          {'\n'}
          origin {clip.origin?.projectId ?? 'unbound'}
        </pre>
      </details>
    </section>
  );
}
