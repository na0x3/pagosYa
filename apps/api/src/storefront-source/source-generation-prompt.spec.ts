import { outputSchema } from './source-generation-prompt';

describe('the change label YAPI writes', () => {
  it('asks for one short, plain sentence for the merchant, with no technical words', () => {
    const label = outputSchema.properties.label as { description?: string };
    expect(label.description).toMatch(/comercio/);
    expect(label.description).toMatch(/CTA/);
    expect(label.description).toMatch(/sin términos técnicos/i);
  });
});
