import { z } from 'zod';
import { sectionCompositions } from '@pagosya/shared-types';
import { SOURCE_SKETCH_COMPOSITIONS, sketchCompositionFit } from '../source-composition-registry';
import type { DesignInput } from './design-engine';
import { syncDesignSpec } from './design-document';
import type { StoreSketch, SketchContext } from '../sketch/sketch-schema';
export const DESIGN_CRITIC_PROMPT = `You are Yapi's Critic Agent. Review the structured boceto for this brand once. Look for weak hierarchy, repetitive composition, monotonous spacing, excessive centered content and impossible media layouts. Respect merchant content and global direction. Return at most three targeted layout patches using registered composition variants, widths, alignment and scale. Do not generate HTML, React, CSS or new copy. Do not change products, prices, photos, claims or policies. Empty patches are valid when the boceto is coherent. This is a structural critique, not a browser inspection. Avoid changing a deliberate minimalist design just to increase variety.`;
export const designCritiqueSchema = z.object({
  summary: z.string().max(500),
  patches: z.array(z.object({ sectionId: z.string().max(80), composition: z.string().max(40), width: z.enum(['bleed', 'wide', 'narrow', 'offset-left', 'offset-right']), alignment: z.enum(['start', 'center', 'end']), size: z.enum(['s', 'm', 'l', 'xl']), reason: z.string().max(300) }).strict()).max(3),
}).strict();
export const DESIGN_CRITIC_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'patches'], properties: {
    summary: { type: 'string' }, patches: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false,
      required: ['sectionId', 'composition', 'width', 'alignment', 'size', 'reason'], properties: {
        sectionId: { type: 'string' }, composition: { type: 'string' }, width: { type: 'string', enum: ['bleed', 'wide', 'narrow', 'offset-left', 'offset-right'] }, alignment: { type: 'string', enum: ['start', 'center', 'end'] }, size: { type: 'string', enum: ['s', 'm', 'l', 'xl'] }, reason: { type: 'string' },
      } } },
  },
};
export function applyDesignCritique(input: StoreSketch, raw: unknown, ctx: SketchContext, inputData?: DesignInput): StoreSketch {
  const parsed = designCritiqueSchema.safeParse(raw); if (!parsed.success) return input;
  const sketch = structuredClone(input), patched = new Set<string>();
  for (const patch of parsed.data.patches) {
    const block = sketch.blocks.find(b => b.id === patch.sectionId);
    if (!block || patched.has(block.id) || !sectionCompositions(block.type).includes(patch.composition)) continue;
    const metadata = SOURCE_SKETCH_COMPOSITIONS.find(entry => entry.type === block.type && entry.variant === patch.composition);
    if (metadata && inputData && !sketchCompositionFit(metadata, { style: sketch.design?.artDirection.style, density: sketch.design?.artDirection.layoutDensity, text: inputData.prompt, catalogItems: inputData.products.length, assets: inputData.assets, newsletterEnabled: inputData.newsletterEnabled }).eligible) continue;
    if (patch.composition === 'immersive' && (!('photo' in block) || !block.photo)) continue;
    block.composition = patch.composition; block.width = patch.width; block.align = patch.alignment; block.size = patch.size;
    patched.add(block.id);
  }
  if (sketch.design) {
    if (!sketch.design.generation.stages.includes('critic')) sketch.design.generation.stages.push('critic');
    sketch.design = syncDesignSpec(sketch.design, sketch, ctx);
  }
  return sketch;
}
