import { useId, type ReactElement, type ReactNode } from 'react';

/**
 * The one "nothing here" block. Surfaces that render an empty panel body use
 * this instead of rendering nothing, so the reason is always stated and always
 * reachable: the region carries the title as its accessible name.
 *
 * It is deliberately not a live region. An empty state replaces the content it
 * stands in for, so the region and its text would be created in the same commit
 * and a screen reader would ignore the announcement. A surface that needs the
 * emptiness announced renders this inside a `StatusRegion`, which owns the
 * stable mount that makes an announcement actually fire.
 */
/** ReactNode admits `true` and `''`; neither deserves a slot box with its margins. */
function absent(slot: ReactNode): boolean {
  return slot == null || typeof slot === 'boolean' || slot === '';
}

export function EmptyState({
  title,
  icon,
  body,
  action,
  unsupported = false,
  className,
}: {
  title: string;
  /** Optional mark above the title; sized by `.ui-empty-state__icon`. */
  icon?: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  unsupported?: boolean;
  className?: string;
}): ReactElement {
  const titleId = useId();
  const classes = ['ui-empty-state'];
  if (unsupported) classes.push('ui-empty-state--unsupported');
  if (className) classes.push(className);

  return (
    <div className={classes.join(' ')} role="group" aria-labelledby={titleId}>
      {absent(icon) ? null : (
        <div className="ui-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="ui-heading ui-empty-state__title" id={titleId}>
        {title}
      </p>
      {absent(body) ? null : <div className="ui-empty-state__body">{body}</div>}
      {absent(action) ? null : (
        <div className="ui-empty-state__action">{action}</div>
      )}
    </div>
  );
}
