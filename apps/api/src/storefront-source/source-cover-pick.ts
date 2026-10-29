import type { PhotoFit } from './source-photo-fit';

/** Spec 2026-10-28 §5 (owner: «que elija una buena foto para el header»): the photos that can carry a store's cover, best first,
 *  read from their pixels only — a big real scene over a small product on a plain sweep. A vision call then picks among them. */
export function coverCandidates(photos: Array<{ url: string; fit?: PhotoFit }>): string[] {
  const score = (fit?: PhotoFit) => !fit ? 0 : (fit.plain === 'scene' ? 2 : 0) + (fit.size === 'large' ? 2 : 0) + (fit.shape === 'wide' ? 1 : 0);
  const ranked = [...photos].sort((a, b) => score(b.fit) - score(a.fit));
  // With a real scene at hand, product cut-outs never make the cover; with none, the best of them still does.
  const strong = ranked.filter(photo => photo.fit?.plain === 'scene');
  return (strong.length ? strong : ranked).slice(0, 6).map(photo => photo.url);
}
