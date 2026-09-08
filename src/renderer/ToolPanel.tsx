import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { DesktopBridge } from '../contracts/desktop';
import type { ToolState } from '../contracts/workspace';
import { Icon } from './FieldAtlas';

export function ToolPanel({
  bridge,
  url,
  state,
  onClose,
  onNavigate,
  onError,
}: {
  bridge: Pick<DesktopBridge, 'resizeTool' | 'openExternal'>;
  url: string;
  state: ToolState;
  onClose: () => void;
  onNavigate: (url: string) => void;
  onError: (message: string) => void;
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState(url);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = (): void => {
      const bounds = element.getBoundingClientRect();
      void bridge
        .resizeTool({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.max(0, Math.floor(bounds.width)),
          height: Math.max(0, Math.floor(bounds.height)),
        })
        .catch(() => {});
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [bridge, url, state.loading]);
  return (
    <aside className="tool-panel" aria-label="Embedded source or tool">
      <div className="tool-heading">
        <span>Source & tools</span>
        <button
          className="icon-button"
          aria-label="Close tool"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <form
        className="tool-address"
        onSubmit={(event) => {
          event.preventDefault();
          onNavigate(address);
        }}
      >
        <input
          aria-label="Tool address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <button type="submit" aria-label="Navigate to tool">
          <Icon name="arrow" />
        </button>
      </form>
      <div className="tool-status">
        <span>{state.loading ? 'Loading…' : state.title || 'Ready'}</span>
        <button
          className="text-button"
          onClick={() =>
            void bridge
              .openExternal(state.url || url)
              .catch((error: Error) => onError(error.message))
          }
        >
          Open externally <Icon name="arrow" />
        </button>
      </div>
      {state.error && <p className="tool-error">{state.error}</p>}
      <div className="tool-host" ref={host} data-testid="tool-host" />
      <p className="tool-footnote">
        Page text is shared only when you ask with context or start guidance.
      </p>
    </aside>
  );
}
