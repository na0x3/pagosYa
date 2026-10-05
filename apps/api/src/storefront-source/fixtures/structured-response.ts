/** Complete provider response fixtures against the real strict schema, so mocks exercise the
 * same contract as production. Missing fixture content is neutral, never merchant evidence. */
export function completeStructuredFixture(value: unknown, schema: Record<string, any>): any {
  if (schema.anyOf) {
    const raw = value as Record<string, unknown>;
    const branch = schema.anyOf.find((candidate: any) => candidate.properties?.type?.enum?.includes(raw?.type)) || schema.anyOf[0];
    return completeStructuredFixture(value, branch);
  }
  if (schema.enum) return schema.enum.includes(value) ? value : schema.enum[0];
  if (schema.type === 'object') {
    const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(schema.properties).map(([key, property]) => [key, completeStructuredFixture(raw[key], property as Record<string, any>)]));
  }
  if (schema.type === 'array') return (Array.isArray(value) ? value : []).map(item => completeStructuredFixture(item, schema.items));
  if (schema.type === 'boolean') return typeof value === 'boolean' ? value : false;
  if (schema.type === 'number') return typeof value === 'number' ? value : 0;
  return typeof value === 'string' ? value : '';
}
