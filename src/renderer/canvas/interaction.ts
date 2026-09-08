/** Keep node and viewport shortcuts out of nested interactive controls. */
export function isInteractiveTarget(event: {
  target: EventTarget | null;
}): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest(
      'button,input,textarea,select,a,[contenteditable="true"]',
    ) !== null
  );
}
