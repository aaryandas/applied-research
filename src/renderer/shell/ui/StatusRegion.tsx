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
 * 'status' announces at the next pause, 'alert' interrupts. Each prop also
 * applies its tone class — `alert` is `.ui-status--error`, `busy` is
 * `.ui-status--busy` beside `.ui-busy` — so the announced state and the visible
 * one cannot drift apart.
 *
 * This is only the live-region mount. The dot+label indicator is `.ui-status`
 * and is opt-in via `className`, so a nested `EmptyState` keeps its own layout.
 *
 * While `aria-busy="true"` assistive technology may withhold the region's
 * content, so text rendered mid-flight is not necessarily announced. That is
 * what you want for a result that is still settling, but a caller who needs an
 * in-progress message spoken should put it in a region that is not busy.
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
      className={[
        tone === 'alert' ? 'ui-status--error' : null,
        busy ? 'ui-status--busy ui-busy' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
