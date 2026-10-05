import { SOURCE_DNA_SCHEMA, type SourceDesignDna } from '../source-dna';
import { structuredOutputSchema } from './structured-output';
import { z } from 'zod';
import { SECTION_COMPOSITIONS } from '@pagosya/shared-types';
import { SOURCE_FONT_IDS } from '../source-font-catalog';
const text = z.string().trim().min(1).max(500);
const words = z.array(text).max(12);
export const brandDirectionSchema = z.object({
  businessType: text, positioning: text, audience: words, personality: words,
  visualKeywords: words, contentTone: text, pricePositioning: z.enum(['budget', 'mid-market', 'premium', 'luxury']),
  primaryConversionGoal: text, secondaryGoals: words,
}).strict();
export const artDirectionSchema = z.object({
  style: z.enum(['editorial', 'minimal', 'bold-commerce', 'playful', 'luxury', 'organic', 'retro', 'industrial', 'experimental', 'lifestyle']),
  layoutDensity: z.enum(['airy', 'balanced', 'dense']), composition: z.enum(['grid', 'editorial', 'asymmetric', 'modular', 'mixed']),
  imageTreatment: z.enum(['cover', 'contain']), typographyTreatment: text,
  motionLevel: z.enum(['none', 'subtle', 'expressive']), cornerStyle: z.enum(['square', 'soft', 'round']), sectionRhythm: text,
}).strict();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const font = z.string().refine(id => (SOURCE_FONT_IDS as readonly string[]).includes(id), 'Unknown local font');
const sectionType = z.enum(Object.keys(SECTION_COMPOSITIONS) as [keyof typeof SECTION_COMPOSITIONS, ...(keyof typeof SECTION_COMPOSITIONS)[]]);
export const creativePlanSchema = z.object({
  artDirection: artDirectionSchema,
  dna: (structuredOutputSchema(SOURCE_DNA_SCHEMA) as z.ZodType<SourceDesignDna>).optional(),
  palette: z.object({ paper: color, ink: color, accent: color, deep: color, pop: color }).strict(),
  fonts: z.object({ display: font, text: font }).strict(),
  navigation: z.enum(['minimal', 'editorial', 'centered', 'transparent']),
  displayScale: z.number().min(4).max(10), bodyScale: z.number().min(1).max(1.25),
  sections: z.array(z.object({ type: sectionType, composition: z.string(), intent: text, productRefs: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).max(20).default([]) }).strict()).min(3).max(14),
}).strict().superRefine((plan, ctx) => {
  plan.sections.forEach((section, i) => {
    if (!(SECTION_COMPOSITIONS[section.type] as readonly string[]).includes(section.composition))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', i, 'composition'], message: 'Unknown composition for this family' });
  });
});
export type CreativePlan = z.input<typeof creativePlanSchema>;
/** Provider strict schemas are deliberately small and versioned separately from persisted metadata. */
const s = { type: 'string' };
const list = { type: 'array', items: s };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const enumeration = (values: readonly string[]) => ({ type: 'string', enum: values });
export const BRAND_RESPONSE_SCHEMA = object({
  businessType: s, positioning: s, audience: list, personality: list, visualKeywords: list, contentTone: s,
  pricePositioning: enumeration(['budget', 'mid-market', 'premium', 'luxury']), primaryConversionGoal: s, secondaryGoals: list,
});
export const CREATIVE_RESPONSE_SCHEMA = object({
  dna: SOURCE_DNA_SCHEMA,
  artDirection: object({ style: enumeration(['editorial', 'minimal', 'bold-commerce', 'playful', 'luxury', 'organic', 'retro', 'industrial', 'experimental', 'lifestyle']),
    layoutDensity: enumeration(['airy', 'balanced', 'dense']), composition: enumeration(['grid', 'editorial', 'asymmetric', 'modular', 'mixed']),
    imageTreatment: enumeration(['cover', 'contain']), typographyTreatment: s, motionLevel: enumeration(['none', 'subtle', 'expressive']),
    cornerStyle: enumeration(['square', 'soft', 'round']), sectionRhythm: s }),
  palette: object({ paper: s, ink: s, accent: s, deep: s, pop: s }), fonts: object({ display: s, text: s }),
  navigation: enumeration(['minimal', 'editorial', 'centered', 'transparent']), displayScale: { type: 'number' }, bodyScale: { type: 'number' },
  sections: { type: 'array', items: { anyOf: Object.entries(SECTION_COMPOSITIONS).map(([type, variants]) => object({ type: enumeration([type]), composition: enumeration(variants), intent: s, productRefs: { type: 'array', items: s } })) } },
});
