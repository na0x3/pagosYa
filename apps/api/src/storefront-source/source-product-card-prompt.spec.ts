import { productCardDirection, productCommerceDirection, productCommerceRecipe, PRESET_IDS, PRODUCT_CARD_PRESETS } from './source-product-card-presets';
import { COSMETIC_PARTS } from './product-theme-css';
import { SOURCE_DNA_DIRECTION } from './source-dna';
import { SOURCE_PRODUCT_PRESENTATION_DIRECTION } from './source-design';
import { agentInstructions } from './agent/agent-prompt';

describe('product card guidance for the model', () => {
  const direction = productCardDirection();

  it('names every preset with when it fits, generated from the presets themselves', () => {
    for (const id of PRESET_IDS) {
      expect(direction).toContain(id);
      expect(direction).toContain(PRODUCT_CARD_PRESETS[id].when);
    }
  });

  it('lists every cosmetic part the CSS may target', () => {
    for (const part of COSMETIC_PARTS) expect(direction).toContain(part);
    expect(direction).toContain('[data-part="gallery"]');
  });

  it('says what is protected, what the limits are, and that block content is never invented', () => {
    expect(direction).toMatch(/price/i);
    expect(direction).toMatch(/buy button/i);
    expect(direction).toMatch(/seal/i);
    expect(direction).toContain('20 rules');
    expect(direction).toContain('3000');
    expect(direction).toMatch(/never invent/i);
    expect(direction).toMatch(/opacity/i);
  });

  it('stays compact enough for the planner\'s output budget', () => {
    expect(direction.length).toBeLessThan(2600);
  });

  it('reaches the design DNA direction and the product presentation direction', () => {
    expect(SOURCE_DNA_DIRECTION).toContain(direction);
    expect(SOURCE_PRODUCT_PRESENTATION_DIRECTION).toContain('productCard');
    expect(SOURCE_PRODUCT_PRESENTATION_DIRECTION).toContain('productCss');
  });

  it('tells the agent about set_product_card_theme and when to use it', () => {
    const prompt = agentInstructions('STABLE', 'shop', false);
    expect(prompt).toContain('set_product_card_theme');
    expect(prompt).toMatch(/ficha|product page|product card/i);
  });
});

it('sends executable commerce recipes to the planner instead of only preset names', () => {
  const direction = productCommerceDirection();
  expect(SOURCE_DNA_DIRECTION).toContain(direction);
  for (const id of PRESET_IDS) {
    const recipe = productCommerceRecipe(id);
    expect(direction).toContain(`${id}: ${Object.values(recipe.surfaces).join('/')} ; ${Object.values(recipe.productCard).join('/')}`);
    expect(direction).toContain(recipe.decision);
  }
  expect(direction).toContain('one coherent card family per store');
  expect(direction).toContain('requires real variants');
  expect(direction).toContain('actual alternate images');
  expect(direction.length).toBeLessThan(2900);
});
