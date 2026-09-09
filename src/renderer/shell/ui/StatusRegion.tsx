import type { ReactElement, ReactNode } from 'react';

/**
 * A live region for async results.
 *
 * The element is rendered whether or not there is anything to say: a screen
 * reader ignores content injected into a region that was created in the same
 * commit, so the mount has to already be there when the result lands. Callers
 * therefore render this unconditionally and change `children`, never the
 * region's own existence.
 *
 * `tone` doubles as the ARIA role because the two tones are the two roles:
 * 'status' announces at the next pause, 'alert' interrupts.
 *
 * This is only the live-region mount. The dot+label indicator is `.ui-status`
 * and is opt-in via `className`, so a nested `EmptyState` keeps its own layout.
 */
export function StatusRegion({
  children,
  busy = false,
  tone = 'status',
  className,
}: {
  children?: ReactNode;
  busy?: boolean;
  tone?: 'status' | 'alert';
  className?: string;
}): ReactElement {
  return (
    <div
      role={tone}
      aria-live={tone === 'alert' ? 'assertive' : 'polite'}
      aria-busy={busy}
      className={[busy ? 'ui-busy' : null, className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
