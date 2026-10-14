jest.mock('./agent-verify', () => ({ verifyAgentDraft: jest.fn(async () => ({ files: [], repairs: [], findings: [] })) }));
jest.mock('./agent-capture', () => ({
  agentPreviewSnapshot: jest.fn(async () => ({ files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"x","productPage":"product.html"};' }] })),
  captureAgentDraft: jest.fn(),
}));
import { AgentWorkspace } from './agent-workspace';
import { AgentToolbox } from './agent-tools';
import { verifyAgentDraft } from './agent-verify';
import { presetFor } from '../source-product-card-presets';
import type { ThemeCheckFailure } from '../product-theme-check';

const box = (checkTheme: (snapshot: any) => Promise<ThemeCheckFailure[]>, extra: Record<string, unknown> = {}) =>
  new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'diseña la ficha de producto', purpose: 'shop', maxScreenshots: 0, checkTheme, ...extra } as never);
const theme = (b: AgentToolbox, args: Record<string, unknown> = { preset: 'workshop' }) => b.run('set_product_card_theme', JSON.stringify({ preset: null, swatch: null, gallery: null, blocks: null, divider: null, enter: null, css: null, ...args }));
const configOf = (snapshot: any) => JSON.parse(snapshot.files.find((f: any) => f.path === 'config.js').content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
const failure: ThemeCheckFailure = { control: 'buy', viewport: 'mobile', reason: 'covered by another element' };

afterEach(() => { (verifyAgentDraft as jest.Mock).mockClear(); });

describe('verify checks the product page theme in a real browser', () => {
  it('does not run the browser check when the theme has no CSS', async () => {
    const check = jest.fn(async () => [failure]);
    const b = box(check);
    await theme(b, { preset: 'plain' });
    expect((await b.run('verify', '{}')).output).toBe('Todo en orden.');
    expect(check).not.toHaveBeenCalled();
  });

  it('checks the draft with the theme applied to its config, and keeps the CSS when it passes', async () => {
    const check = jest.fn(async (_snapshot: any) => [] as ThemeCheckFailure[]);
    const b = box(check);
    await theme(b);
    expect((await b.run('verify', '{}')).output).toBe('Todo en orden.');
    expect(check).toHaveBeenCalledTimes(1);
    const dna = configOf(check.mock.calls[0][0]).dna;
    expect(dna).toMatchObject({ version: 1, ...presetFor('workshop').params });
    expect(dna.productCss).toBe(b.pendingTheme!.productCss);
    expect(b.pendingTheme!.productCss.length).toBeGreaterThan(100);
    expect(b.draftIsClean()).toBe(true);
  });

  it('a failing theme becomes a finding, loses its CSS but keeps its params, and the draft is not clean until verified again', async () => {
    const check = jest.fn(async () => [failure]);
    const b = box(check);
    await theme(b);
    const out = (await b.run('verify', '{}')).output;
    expect(out).toContain('[theme]');
    expect(out).toContain('buy (mobile): covered by another element');
    expect(b.pendingTheme).toEqual({ productCard: presetFor('workshop').params, productCss: '' });
    expect(b.draftIsClean()).toBe(false);
    expect((await b.run('verify', '{}')).output).toBe('Todo en orden.');
    expect(check).toHaveBeenCalledTimes(1);
    expect(b.draftIsClean()).toBe(true);
  });

  it('drops the CSS and says so when the check itself cannot run', async () => {
    const b = box(async () => { throw new Error('sin navegador'); });
    await theme(b);
    const out = (await b.run('verify', '{}')).output;
    expect(out).toContain('[theme]');
    expect(out).toContain('sin navegador');
    expect(b.pendingTheme!.productCss).toBe('');
  });

  it('skips the theme check while other findings exist, so the browser only runs on a buildable draft', async () => {
    (verifyAgentDraft as jest.Mock).mockResolvedValueOnce({ files: [], repairs: [], findings: [{ source: 'typescript', message: 'Missing is not defined' }] });
    const check = jest.fn(async () => [] as ThemeCheckFailure[]);
    const b = box(check);
    await theme(b);
    const out = (await b.run('verify', '{}')).output;
    expect(out).toContain('[typescript]');
    expect(check).not.toHaveBeenCalled();
    expect(b.pendingTheme!.productCss.length).toBeGreaterThan(100);
  });
});

describe('the theme tool only answers requests that concern the product page', () => {
  it('refuses, and stores nothing, when the request does not concern the product page', async () => {
    const b = box(async () => [], { themeAllowed: false });
    const { output } = await theme(b);
    expect(output).toBe('Este pedido no cambia la ficha de producto.');
    expect(b.pendingTheme).toBeNull();
    expect(b.steps).toEqual([]);
  });

  it('works when the request does concern it, and by default', async () => {
    const allowed = box(async () => [], { themeAllowed: true });
    await theme(allowed);
    expect(allowed.pendingTheme).not.toBeNull();
    const byDefault = box(async () => []);
    await theme(byDefault);
    expect(byDefault.pendingTheme).not.toBeNull();
  });
});

describe('verify checks the kit surface CSS (catalog, cards, cart) in a real browser', () => {
  const kitFail = { buy: failure };
  const ok = { catalog: [], card: [], cart: [] };
  const kitBox = (checkKitSurfaces: (snapshot: any) => Promise<any>) => box(async () => [], { checkKitSurfaces });
  const cardArgs = { cardCss: '[data-part="card-media"]{transform:rotate(-2deg)}', cartCss: '[data-part="cart-line"]{border-bottom:1px dashed #333}' };

  it('keeps passing surfaces and checks a snapshot that carries their CSS', async () => {
    const check = jest.fn(async (_snapshot: any) => ok);
    const b = kitBox(check);
    await theme(b, { preset: 'plain', ...cardArgs });
    expect((await b.run('verify', '{}')).output).toBe('Todo en orden.');
    expect(check).toHaveBeenCalledTimes(1);
    expect(configOf(check.mock.calls[0][0]).dna.cardCss).toBe(b.pendingTheme!.cardCss);
    expect(b.pendingTheme!.cardCss).toBeTruthy();
  });

  it('drops only the failing surface and reports it', async () => {
    void kitFail;
    const b = kitBox(async () => ({ ...ok, card: [failure] }));
    await theme(b, { preset: 'plain', ...cardArgs });
    const out = (await b.run('verify', '{}')).output;
    expect(out).toContain('[theme]');
    expect(out).toContain('buy (mobile): covered by another element');
    expect(b.pendingTheme!.cardCss).toBeUndefined();
    expect(b.pendingTheme!.cartCss).toBeTruthy();
    expect(b.draftIsClean()).toBe(false);
  });

  it('drops every kit surface when the check cannot run', async () => {
    const b = kitBox(async () => { throw new Error('sin navegador'); });
    await theme(b, { preset: 'plain', ...cardArgs });
    const out = (await b.run('verify', '{}')).output;
    expect(out).toContain('sin navegador');
    expect(b.pendingTheme!.cardCss).toBeUndefined();
    expect(b.pendingTheme!.cartCss).toBeUndefined();
  });
});
