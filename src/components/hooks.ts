import { useEffect, useState } from 'react';
import { useGame } from '../game/state/store';

/** prefers-reduced-motion, overridable from Settings. */
export function useReducedMotion(): boolean {
  const setting = useGame((s) => s.settings.reducedMotion);
  const [media, setMedia] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cb = (e: MediaQueryListEvent) => setMedia(e.matches);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }, []);
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return media;
}
