import { designEmailKit, EMAIL_KIT_MAX_CREDITS, EMAIL_KIT_MODEL, emailKitPrompt, type DesignInput } from './email-kit-designer';
import { SourceRequestBudget } from '../storefront-source/source-request-budget';

const input: DesignInput = { storeName: 'Café Illimani', mode: 'twin', brand: '{"accent":"#c2410c"}', stylesheet: ':root{--ink:#111}', homepage: '<h1>Café</h1>', products: ['Café de altura'] };
const reply = (output: object, status = 200) => jest.fn(async () => new Response(JSON.stringify({ status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }], usage: { input_tokens: 1000, output_tokens: 2000 } }), { status })) as any;

describe('emailKitPrompt', () => {
  it("asks for the website's twin, or a bolder campaign version", () => {
    expect(emailKitPrompt(input)).toMatch(/same palette, typography and mood/i);
    expect(emailKitPrompt({ ...input, mode: 'bold' })).toMatch(/bolder campaign version/i);
  });
  it('states the contract and the rules the validator enforces', () => {
    const prompt = emailKitPrompt(input);
    for (const needle of ['data-email-content', 'data-block="items"', 'data-item', '{cliente}', 'tables and inline styles', 'never write an amount', 'charged automatically']) expect(prompt).toContain(needle);
  });
  it('asks for every new block and the tone marker, editorial like the references', () => {
    const prompt = emailKitPrompt(input);
    for (const needle of ['data-block="announce"', 'data-block="steps"', 'data-step', 'data-block="trust"', 'data-block="quote"', 'data-quote-text', 'data-block="story"',
      'data-block="contact"', 'data-contact', 'data-tone="dark"', 'data-nav-link', 'data-social', 'data-store-address', 'data-policy-link', 'editorial', 'never write a review']) expect(prompt).toContain(needle);
    for (const field of ['announcement', 'storyTitle', 'storyText', 'note', 'recommendTitle', 'helpTitle']) expect(prompt).toContain(field);
  });

  it('a prompt with full-size references stays within the credit ceiling', () => {
    const big: DesignInput = { ...input, brand: 'b'.repeat(10_000), stylesheet: 's'.repeat(40_000), homepage: 'h'.repeat(40_000), products: Array(20).fill('p'.repeat(100)) };
    const prompt = emailKitPrompt(big);
    expect(prompt.length).toBeLessThan(48_000);
    expect(() => new SourceRequestBudget(EMAIL_KIT_MAX_CREDITS).reserve(EMAIL_KIT_MODEL, Math.ceil(prompt.length / 3), 18_000, 6_000)).not.toThrow();
  });

  it('treats the site files as untrusted reference, and caps their size', () => {
    const prompt = emailKitPrompt({ ...input, stylesheet: 'x'.repeat(100_000), homepage: 'y'.repeat(100_000) });
    expect(prompt.length).toBeLessThan(45_000);
    expect(prompt).toMatch(/untrusted/i);
  });
});

describe('designEmailKit', () => {
  const budget = () => new SourceRequestBudget(25);
  it('returns the three parts and records a completed run', async () => {
    const output = { layout: '<html><body><table><tr><td data-email-content></td></tr></table></body></html>', blocks: '<table data-block="note"></table>', copy: '{"order_confirmation":{"headline":"Gracias"}}' };
    const record = jest.fn(async () => undefined);
    const result = await designEmailKit(input, { provider: { endpoint: 'https://x', apiKey: 'k' }, budget: budget(), fetchImpl: reply(output), record });
    expect(result.raw).toEqual(output);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'COMPLETED');
  });
  it('fails in Spanish on a provider error, and records the failure', async () => {
    const record = jest.fn(async () => undefined);
    await expect(designEmailKit(input, { provider: { endpoint: 'https://x', apiKey: 'k' }, budget: budget(), fetchImpl: reply({}, 500), record })).rejects.toThrow(/correos/);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'FAILED');
  });
  it('fails on a response missing a part', async () => {
    await expect(designEmailKit(input, { provider: { endpoint: 'https://x', apiKey: 'k' }, budget: budget(), fetchImpl: reply({ layout: 'x' }) })).rejects.toThrow(/correos/);
  });
});
