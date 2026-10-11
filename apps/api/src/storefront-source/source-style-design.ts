/** The style planner's output (spec 2026-10-11 Elige tu estilo): four concepts, one per drawn slot, each with its card text. */
import { BadGatewayException } from '@nestjs/common';
import { validateSourceConcept, type SourceDesign, type SourceDesignConcept } from './source-design';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

export const STYLE_CARD_PROPERTIES = {
  cardName: { type: 'string', minLength: 1, maxLength: 40 },
  vibe: { type: 'string', minLength: 1, maxLength: 500 },
  inspiration: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 140 } },
};

export function styleConceptsSchema(base: any): any {
  const schema = structuredClone(base);
  schema.minItems = 4; schema.maxItems = 4;
  Object.assign(schema.items.properties, structuredClone(STYLE_CARD_PROPERTIES));
  schema.items.required = [...schema.items.required, 'cardName', 'vibe', 'inspiration'];
  return schema;
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Lenient on purpose: one bad concept costs one card, never the three good ones. Throws only when none survives. */
export function validateStyleDesign(value: any, modes: Array<'calm' | 'bold'>, options: { narrative: boolean; seed?: string; repairs?: string[] }): { design: SourceDesign; dropped: string[] } {
  const dropped: string[] = [];
  const kept: SourceDesignConcept[] = [];
  const openings = new Set<string>();
  const raw: any[] = Array.isArray(value?.concepts) ? value.concepts.slice(0, modes.length) : [];
  raw.forEach((concept, slot) => {
    try {
      if (!text(concept?.cardName, 40) || !text(concept?.vibe, 500) || !Array.isArray(concept?.inspiration) || concept.inspiration.length < 1 || concept.inspiration.length > 5 || !concept.inspiration.every((line: unknown) => text(line, 140))) throw new Error('cardName, vibe e inspiration son obligatorios.');
      const result = validateSourceConcept(concept, slot, true, options.narrative, { seed: options.seed, repairs: options.repairs, requireComposition: true });
      const opening = result.opening.toLowerCase().replace(/\s+/g, ' ').trim();
      if (openings.has(opening)) throw new Error('opening repetido.');
      openings.add(opening);
      kept.push({ ...result, card: { slot, mode: modes[slot], name: concept.cardName.trim(), vibe: concept.vibe.trim(), inspiration: concept.inspiration.map((line: string) => line.trim()) } });
    } catch (error) { dropped.push(`concepts[${slot}]: ${(error instanceof Error ? error.message : 'inválido').slice(0, 200)}`); }
  });
  if (!kept.length) throw new BadGatewayException('YAPI no logró armar estilos válidos en este intento.');
  const recommended = kept.findIndex(concept => concept.card!.slot === value?.selection?.index);
  const rationale = typeof value?.selection?.rationale === 'string' && value.selection.rationale.trim().length <= 400 ? value.selection.rationale.trim() || null : null;
  return { design: { concepts: kept, selected: Math.max(0, recommended), selection: { source: 'planner', rationale: recommended >= 0 ? rationale : null } }, dropped };
}

/** The two bold cards never share a display font (spec): the second bold one takes the first catalogue display font no card uses. */
export function distinctBoldDisplays(design: SourceDesign): SourceDesign {
  const bold = design.concepts.map((concept, index) => ({ concept, index })).filter(({ concept }) => concept.card?.mode === 'bold' && concept.dna?.type);
  if (bold.length < 2 || bold[0].concept.dna!.type.display !== bold[1].concept.dna!.type.display) return design;
  const used = new Set(design.concepts.flatMap(concept => concept.dna?.type ? [concept.dna.type.display, concept.dna.type.text] : []));
  const font = SOURCE_FONT_CATALOG.find(entry => entry.role !== 'text' && !used.has(entry.id));
  if (!font) return design;
  const { concept, index } = bold[1];
  const concepts = [...design.concepts];
  concepts[index] = { ...concept, dna: { ...concept.dna!, type: { ...concept.dna!.type, display: font.id } } };
  return { ...design, concepts };
}
