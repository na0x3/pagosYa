import type { SourceDesign } from './source-design';
import { compositionFingerprint } from './source-composition-plan';

/** Compare actual structures, never ask a model to interpret opaque hashes.
 * Keep explicit selections and avoid paid replanning when every viable proposal repeats. */
export function preferFreshComposition(design: SourceDesign, recent: string[]): SourceDesign {
  if (!recent.length || design.selection?.source === 'forced' || !design.concepts[design.selected]?.composition) return design;
  if (!recent.includes(compositionFingerprint(design.concepts[design.selected]))) return design;
  const selected = design.concepts.findIndex(concept => concept.composition && !recent.includes(compositionFingerprint(concept)));
  if (selected < 0) return design;
  return { ...design, selected, selection: { source: 'planner', rationale: `${design.selection?.rationale || 'Product-led alternatives.'} Selected a proposed composition whose structure is absent from recent stores.` } };
}
