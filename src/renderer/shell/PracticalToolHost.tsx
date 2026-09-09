import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { DesktopBridge } from '../../contracts/desktop';
import type { ToolState } from '../../contracts/workspace';
import type { PracticalToolAdapter } from '../practical/tool-adapter';

export function PracticalToolHost({
  bridge,
  adapter,
  beforeExternal,
}: Readonly<{
  bridge: Pick<DesktopBridge, 'resizeTool' | 'onToolState'>;
  adapter: PracticalToolAdapter;
  beforeExternal(): Promise<boolean>;
}>): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ToolState>({
    url: '',
    title: '',
    loading: true,
    error: '',
  });
  const [message, setMessage] = useState('');
  useEffect(() => bridge.onToolState(setState), [bridge]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = (): void => {
      const bounds = element.getBoundingClientRect();
      const x = Math.max(0, Math.min(window.innerWidth, Math.round(bounds.x)));
      const y = Math.max(0, Math.min(window.innerHeight, Math.round(bounds.y)));
      void bridge
        .resizeTool({
          x,
          y,
          width: Math.max(
            0,
            Math.floor(Math.min(bounds.right, window.innerWidth) - x),
          ),
          height: Math.max(
            0,
            Math.floor(Math.min(bounds.bottom, window.innerHeight) - y),
          ),
        })
        .catch(() =>
          setMessage(
            'The embedded tool could not be positioned. Open it externally to continue.',
          ),
        );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', resize, true);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', resize, true);
      void adapter.close().catch(() => {});
    };
  }, [bridge, adapter]);
  return (
    <section aria-label="Selected practical tool">
      <p role="status">
        {message ||
          state.error ||
          (state.loading ? 'Loading tool…' : state.title)}
      </p>
      <button
        onClick={() =>
          void adapter
            .close()
            .catch(() => setMessage('The tool could not close.'))
        }
      >
        Close tool
      </button>
      <button
        onClick={() =>
          void beforeExternal()
            .then((ready) => {
              if (!ready) throw new Error('Save first');
              return adapter.openExternal();
            })
            .catch(() => setMessage('The external tool could not open.'))
        }
      >
        Open selected tool externally
      </button>
      <div className="tool-host" ref={host} />
    </section>
  );
}
