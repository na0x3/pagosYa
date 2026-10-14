import { AgentWorkspace } from './agent-workspace';
import { AgentToolbox, AGENT_TOOLS } from './agent-tools';
import { presetFor } from '../source-product-card-presets';
import { sanitizeProductThemeCss } from '../product-theme-css';

/** The tool never touches files or a browser; the toolbox needs only its context to exist. */
const toolbox = (instruction = 'diseña la ficha de producto') => new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction, purpose: 'shop', maxScreenshots: 0 } as never);
const call = (box: AgentToolbox, args: Record<string, unknown>) => box.run('set_product_card_theme', JSON.stringify({ preset: null, swatch: null, gallery: null, blocks: null, divider: null, enter: null, css: null, ...args }));

describe('set_product_card_theme', () => {
  it('is declared with a strict schema whose enums come from the DNA and the presets', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'set_product_card_theme') as any;
    expect(tool.strict).toBe(true);
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['assurances', 'blocks', 'cardCss', 'cartCss', 'catalogCss', 'css', 'divider', 'enter', 'gallery', 'media', 'preset', 'swatch']);
    expect(tool.parameters.required.sort()).toEqual(Object.keys(tool.parameters.properties).sort());
    expect(tool.parameters.properties.preset.enum).toEqual(expect.arrayContaining(['workshop', 'plain', null]));
    expect(tool.parameters.properties.swatch.enum).toEqual(expect.arrayContaining(['pill', 'photo', null]));
  });

  it('changes nothing, and says so, when every argument is null', async () => {
    const box = toolbox();
    const { output } = await call(box, {});
    expect(output).toMatch(/no cambió/i);
    expect(box.pendingTheme).toBeNull();
    expect(box.steps).toEqual([]);
  });

  it('applies a preset: its params, its sanitized starter CSS, and reports the result', async () => {
    const box = toolbox();
    const { output } = await call(box, { preset: 'workshop' });
    expect(box.pendingTheme).toEqual({ productCard: presetFor('workshop').params, productCss: sanitizeProductThemeCss(presetFor('workshop').css).css });
    expect(output).toContain('workshop');
    for (const value of Object.values(presetFor('workshop').params)) expect(output).toContain(value);
  });

  it('applies overrides on top of the preset', async () => {
    const box = toolbox();
    await call(box, { preset: 'workshop', swatch: 'circle', enter: 'none' });
    expect(box.pendingTheme!.productCard).toEqual({ ...presetFor('workshop').params, swatch: 'circle', enter: 'none' });
  });

  it('keeps the safe CSS, drops the rest and tells the agent what was dropped', async () => {
    const box = toolbox();
    const { output } = await call(box, { css: '[data-part="title"]{color:#111;pointer-events:none}' });
    expect(box.pendingTheme!.productCss).toContain('color: #111');
    expect(box.pendingTheme!.productCss).not.toContain('pointer-events');
    expect(output).toContain('pointer-events');
  });

  it('each call replaces the whole theme', async () => {
    const box = toolbox();
    await call(box, { preset: 'workshop' });
    await call(box, { preset: 'boutique' });
    expect(box.pendingTheme!.productCard).toEqual(presetFor('boutique').params);
  });

  it('rejects an unknown preset or an invalid setting without changing the pending theme', async () => {
    const box = toolbox();
    await call(box, { preset: 'workshop' });
    const before = box.pendingTheme;
    expect((await call(box, { preset: 'hexagon' })).output).toMatch(/^Herramienta o argumentos inválidos/);
    expect((await call(box, { swatch: 'hexagon' })).output).toMatch(/^Herramienta o argumentos inválidos/);
    expect(box.pendingTheme).toBe(before);
  });

  it('records a merchant-facing step that carries the choice, never the CSS', async () => {
    const box = toolbox();
    await call(box, { preset: 'workshop', css: '[data-part="title"]{color:#111}' });
    expect(box.steps.map(s => s.kind)).toEqual(['set_product_card_theme']);
    expect(box.steps[0].label).toMatch(/ficha de producto/i);
    expect(box.steps[0].label).not.toContain('[data-part');
    expect(box.steps[0].label).not.toContain('color');
  });
});
