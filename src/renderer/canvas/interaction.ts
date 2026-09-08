/** Keep node and viewport shortcuts out of nested writing and controls. */
export function isNestedInteraction(event: {
  target: EventTarget | null;
}): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest(
      'button,input,textarea,select,a,fieldset,[contenteditable="true"]',
    ) !== null
  );
}
