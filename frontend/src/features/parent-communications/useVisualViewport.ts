import { useEffect, useState } from 'react';

/**
 * Zone réellement visible de l'écran (`visualViewport`) : elle rétrécit quand le clavier mobile s'ouvre.
 * Une conversation plein écran s'y cale pour que la zone de saisie reste au-dessus du clavier.
 * Sans `visualViewport` (anciens navigateurs, tests) : la fenêtre entière.
 */
export function useVisualViewport(): { height: number; offsetTop: number } {
  const read = () => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
    return {
      height: Math.round(vv?.height ?? (typeof window === 'undefined' ? 0 : window.innerHeight)),
      offsetTop: Math.round(vv?.offsetTop ?? 0),
    };
  };
  const [size, setSize] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setSize(read());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return size;
}
