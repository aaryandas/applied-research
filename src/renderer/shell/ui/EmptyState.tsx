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
export function EmptyState({
  title,
  body,
  action,
  unsupported = false,
  className,
}: {
  title: string;
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
      <p className="ui-heading ui-empty-state__title" id={titleId}>
        {title}
      </p>
      {body == null || body === false ? null : (
        <div className="ui-empty-state__body">{body}</div>
      )}
      {action == null || action === false ? null : (
        <div className="ui-empty-state__action">{action}</div>
      )}
    </div>
  );
}
