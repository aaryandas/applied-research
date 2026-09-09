interface PointerFollowerOptions {
  surface: HTMLElement;
  decoration: HTMLElement;
  viewport: Window;
}

const POINTER_OFFSET = 18;
const MARK_SIZE = 32;
const EDGE_INSET = 8;

/** Local decoration only: no session, context resolver, guest API or request capability. */
export function attachPointerFollower({
  surface,
  decoration,
  viewport,
}: PointerFollowerOptions): () => void {
  const motion = viewport.matchMedia('(prefers-reduced-motion: reduce)');
  let frame: number | null = null;
  let point: { x: number; y: number } | null = null;

  function park(): void {
    if (frame !== null) viewport.cancelAnimationFrame(frame);
    frame = null;
    point = null;
    decoration.style.removeProperty('transform');
    decoration.removeAttribute('data-following');
  }
  function paint(): void {
    frame = null;
    if (!point || motion.matches) return;
    const x = Math.max(
      EDGE_INSET,
      Math.min(
        point.x + POINTER_OFFSET,
        viewport.innerWidth - MARK_SIZE - EDGE_INSET,
      ),
    );
    const y = Math.max(
      EDGE_INSET,
      Math.min(
        point.y + POINTER_OFFSET,
        viewport.innerHeight - MARK_SIZE - EDGE_INSET,
      ),
    );
    decoration.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    decoration.setAttribute('data-following', 'true');
  }
  function move(event: PointerEvent): void {
    if (motion.matches || event.pointerType === 'touch') return;
    point = { x: event.clientX, y: event.clientY };
    if (frame === null) frame = viewport.requestAnimationFrame(paint);
  }
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerleave', park);
  viewport.addEventListener('blur', park);
  viewport.addEventListener('resize', park);
  motion.addEventListener('change', park);
  return () => {
    park();
    surface.removeEventListener('pointermove', move);
    surface.removeEventListener('pointerleave', park);
    viewport.removeEventListener('blur', park);
    viewport.removeEventListener('resize', park);
    motion.removeEventListener('change', park);
  };
}
