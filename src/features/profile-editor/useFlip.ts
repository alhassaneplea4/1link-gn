import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Animation FLIP des éléments `[data-flip-id]` d'une liste lors d'un changement d'ordre.
 * N'anime que `transform` ; désactivée si l'utilisateur préfère réduire les animations.
 */
export function useFlip(listRef: RefObject<HTMLElement | null>, orderKey: string) {
  const prev = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-flip-id]'));
    const next = new Map<string, number>();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const el of items) {
      const id = el.dataset.flipId!;
      const top = el.offsetTop;
      next.set(id, top);
      const before = prev.current.get(id);
      if (!reduce && before !== undefined && before !== top && typeof el.animate === 'function') {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      }
    }
    prev.current = next;
  }, [listRef, orderKey]);
}
