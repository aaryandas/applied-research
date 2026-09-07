export function isAllowedNavigation(
  target: string,
  rendererUrl: string,
): boolean {
  try {
    const destination = new URL(target);
    const renderer = new URL(rendererUrl);
    destination.hash = '';
    renderer.hash = '';
    return destination.href === renderer.href;
  } catch {
    return false;
  }
}
