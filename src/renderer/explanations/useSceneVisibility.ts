import { useEffect, useState, type RefObject } from 'react';

export function useSceneVisibility(host: RefObject<HTMLElement | null>): {
  visible: boolean;
  reducedMotion: boolean;
} {
  const [visible, setVisible] = useState(!document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
  );
  useEffect(() => {
    let intersecting = true;
    const update = (): void => setVisible(intersecting && !document.hidden);
    const observer = globalThis.IntersectionObserver
      ? new IntersectionObserver(([entry]) => {
          intersecting = entry?.isIntersecting ?? false;
          update();
        })
      : null;
    if (host.current) observer?.observe(host.current);
    document.addEventListener('visibilitychange', update);
    const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateMotion = (): void => setReducedMotion(media?.matches ?? false);
    media?.addEventListener('change', updateMotion);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      media?.removeEventListener('change', updateMotion);
    };
  }, [host]);
  return { visible, reducedMotion };
}
