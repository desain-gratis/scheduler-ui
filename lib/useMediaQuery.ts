import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query. Mobile first: it starts as `false` (the smallest layout) and
 * switches after mount, so server/static HTML and the first client render always agree.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}
