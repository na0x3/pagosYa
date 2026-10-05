import { z } from 'zod';
/** Compile the provider JSON vocabulary into the repository's Zod runtime validation. This
 * validates responses locally even when a provider ignores strict structured output. */
const cache = new WeakMap<object, z.ZodTypeAny>();
export function structuredOutputSchema(schema: Record<string, unknown>): z.ZodTypeAny {
  const cached = cache.get(schema); if (cached) return cached;
  let parser: z.ZodTypeAny;
  if (Array.isArray(schema.anyOf)) {
    const choices = schema.anyOf.map(choice => structuredOutputSchema(choice as Record<string, unknown>));
    parser = z.union(choices as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  } else if (Array.isArray(schema.enum)) {
    const allowed = schema.enum;
    parser = z.unknown().refine(value => allowed.includes(value), 'Unknown enum value');
  } else if (schema.type === 'object') {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const object = z.object(Object.fromEntries(Object.entries(properties).map(([key, value]) => {
      const property = structuredOutputSchema(value); return [key, required.has(key) ? property : property.optional()];
    })));
    parser = schema.additionalProperties === false ? object.strict() : object.passthrough();
  } else if (schema.type === 'array') {
    let array = z.array(structuredOutputSchema(schema.items as Record<string, unknown>)).max(typeof schema.maxItems === 'number' ? schema.maxItems : 100);
    if (typeof schema.minItems === 'number') array = array.min(schema.minItems);
    parser = array;
  } else if (schema.type === 'boolean') parser = z.boolean();
  else if (schema.type === 'number' || schema.type === 'integer') parser = schema.type === 'integer' ? z.number().finite().int() : z.number().finite();
  else if (schema.type === 'string') parser = z.string().max(80000);
  else parser = z.unknown();
  cache.set(schema, parser); return parser;
}
