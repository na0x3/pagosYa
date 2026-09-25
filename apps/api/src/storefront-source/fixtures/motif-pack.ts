import { MOTIF_PACK_PLACEMENTS, type MotifPackPlacement, type SourceRuntimeMotifPack } from '../source-motif-packs';

/** Drawings written exactly as the motif sanitiser serialises them: currentColor only, no ids, a labelled steam part. */
const svg = (viewBox: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const FIXTURE_DRAWINGS = {
  button: svg('0 0 24 24', '<circle cx="12" cy="15" r="4"/><circle cx="6" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="9" r="2"/>'),
  pattern: svg('0 0 96 96', '<g transform="translate(10 10)"><circle cx="12" cy="15" r="4"/><circle cx="6" cy="9" r="2"/></g><circle cx="72" cy="72" r="6"/>'),
  divider: svg('0 0 64 24', '<circle cx="8" cy="12" r="3"/><circle cx="32" cy="12" r="6"/><circle cx="56" cy="12" r="3"/>'),
  sticker: svg('0 0 64 64', '<polygon points="32,4 38,24 60,24 42,38 48,60 32,46 16,60 22,38 4,24 26,24" fill="currentColor" fill-opacity=".12"/>'),
  empty: svg('0 0 64 64', '<g data-part="steam"><path d="M26 18c-3-4 3-6 0-10"/><path d="M36 18c-3-4 3-6 0-10"/></g><path d="M16 26h32v14a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z"/>'),
};
const FILE: Record<MotifPackPlacement, keyof typeof FIXTURE_DRAWINGS> = { button: 'button', pattern: 'pattern', divider: 'divider', sticker: 'sticker', empty: 'empty', product: 'empty', card: 'button', cart: 'button' };
const BEHAVIOR = { button: 'bounce', pattern: 'float', divider: 'grow', sticker: 'sway', empty: 'steam', product: 'grow', card: 'bounce', cart: 'bounce' } as const;

/** The config.js `motifPack` a store with this pack carries (the kit specs boot with it). */
export function fixturePack(placements: MotifPackPlacement[] = [...MOTIF_PACK_PLACEMENTS]): SourceRuntimeMotifPack {
  return { id: 'fixture-paws', motifs: placements.map(placement => ({ placement, behavior: BEHAVIOR[placement], svg: FIXTURE_DRAWINGS[FILE[placement]] })) };
}
