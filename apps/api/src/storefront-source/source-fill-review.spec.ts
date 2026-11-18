jest.setTimeout(90_000);

import { chromium, type Browser } from 'playwright';
import type { LayoutBlock } from './source-section-library';
import { applyComposerChanges, type ComposerProblem, type ComposerTemplate } from './source-composer';
import { evaluateTemplateRules } from './source-template-qa-rules';
import { fillReviewTemplate, noWorse, reviewChanges, ruleRepairs, runFillReview, type FillReviewDeps, type FillReviewFinding } from './source-fill-review';

const finding = (rule: string, at: number | null, viewport: 'desktop' | 'phone' = 'desktop', severity: 'block' | 'advice' = 'block'): FillReviewFinding =>
  ({ rule, at, viewport, severity, line: `${severity === 'block' ? 'BLOQUEA' : 'CONSEJO'}: ${rule}` });

const photos = ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg', '/v1/uploads/c.jpg', '/v1/uploads/d.jpg'];
const home: LayoutBlock[] = [
  { type: 'cover-split', title: 'Hola', photo: photos[0] },
  { type: 'products-grid', title: 'Productos' },
  { type: 'statement', title: 'Solo palabras', band: 'deep' },
  { type: 'story-split', title: 'Historia', photo: photos[0], look: 'left' },
  { type: 'faq', title: 'Preguntas' },
];
const template: ComposerTemplate = { id: 'demo', name: 'Demo', signature: ['cover-split'], allowed: home.map(block => block.type), looks: { 'story-split': ['left', 'right'] } };

describe('fill review: rule repairs', () => {
  it('fixes what the rules can fix alone, one change per section, and skips advice and page-level findings', () => {
    const changes = ruleRepairs([
      finding('dark-colour-text-band', 2), finding('text-only-band', 2), finding('repeated-photo', 3),
      finding('text-only-band', 4), finding('low-contrast', 1), finding('no-products', null), finding('short-home', null, 'desktop', 'advice'),
    ], home, photos);
    expect(changes).toEqual([
      { problem: 'dark-colour-text-band', at: 2, kind: 'band', value: '' },
      { problem: 'repeated-photo', at: 3, kind: 'photo', value: '1' },
      { problem: 'text-only-band', at: 4, kind: 'remove', value: '' },
    ]);
  });

  it('removes a dark band of words when the colour is not the band\'s own, and leaves a repeated photo alone with no free photo', () => {
    const plain = home.map(block => ({ ...block, band: undefined }));
    expect(ruleRepairs([finding('dark-text-band', 2)], plain, photos)).toEqual([{ problem: 'dark-text-band', at: 2, kind: 'remove', value: '' }]);
    expect(ruleRepairs([finding('repeated-photo', 3)], home, [photos[0]])).toEqual([]);
  });
});

describe('fill review: reviewer changes', () => {
  it('keeps known kinds on real sections, one per section, and only looks the section offers', () => {
    const problems: ComposerProblem[] = [
      { problem: 'x', at: 3, kind: 'look', value: 'right' },
      { problem: 'x', at: 3, kind: 'remove', value: '' },
      { problem: 'x', at: 2, kind: 'swap', value: 'faq' },
      { problem: 'x', at: 9, kind: 'remove', value: '' },
      { problem: 'x', at: 4, kind: 'look', value: 'giant' },
      { problem: 'x', at: 1, kind: 'move', value: '3' },
    ];
    expect(reviewChanges(problems, home, template, new Set([1]))).toEqual([{ problem: 'x', at: 3, kind: 'look', value: 'right' }]);
  });
});

describe('fill review: keep or refuse', () => {
  it('counts by rule and width, so shifted sections are not new findings', () => {
    expect(noWorse([finding('text-only-band', 2), finding('low-contrast', 4, 'phone')], [finding('low-contrast', 3, 'phone')])).toBe(true);
    expect(noWorse([finding('low-contrast', 4, 'phone')], [finding('low-contrast', 4, 'phone'), finding('low-contrast', 1, 'phone')])).toBe(false);
    expect(noWorse([finding('low-contrast', 4, 'desktop')], [finding('low-contrast', 4, 'phone')])).toBe(false);
    expect(noWorse([], [finding('short-home', null, 'desktop', 'advice')])).toBe(true);
  });
});

describe('fill review: the loop', () => {
  const deps = (renders: Array<FillReviewFinding[] | Error>, over: Partial<FillReviewDeps> = {}) => {
    const state = { renders: 0 };
    const out: FillReviewDeps = {
      render: async () => { const next = renders[Math.min(state.renders++, renders.length - 1)]; if (next instanceof Error) throw next; return { findings: next, images: ['data:image/jpeg;base64,AA=='] }; },
      review: async () => ({ problems: [], microUsd: 1000 }),
      apply: (layout, problems) => applyComposerChanges(layout, problems, template, photos),
      repairs: (findings, layout) => ruleRepairs(findings, layout, photos),
      pick: (problems, layout, taken) => reviewChanges(problems, layout, template, taken),
      fatal: error => /cuota/.test(String((error as Error)?.message)),
      trace: () => {},
      maxMicroUsd: 1_000_000,
      ...over,
    };
    return { deps: out, state };
  };

  it('keeps a round that removes a finding and stops when nothing is left to change', async () => {
    const { deps: d, state } = deps([[finding('text-only-band', 4)], []]);
    const result = await runFillReview(home, d);
    expect(result.outcome).toBe('improved');
    expect(result.layout.map(block => block.type)).toEqual(['cover-split', 'products-grid', 'statement', 'story-split']);
    expect(result.applied).toEqual(['quité faq']);
    expect(result.before).toHaveLength(1);
    expect(result.after).toHaveLength(0);
    expect(state.renders).toBe(2);
  });

  it('throws the corrected home away when a rule fires more than before', async () => {
    const result = await runFillReview(home, deps([[finding('text-only-band', 4)], [finding('low-contrast', 1, 'phone')]]).deps);
    expect(result.outcome).toBe('refused');
    expect(result.layout).toBe(home);
    expect(result.changed).toBe(false);
  });

  it('runs at most two rounds', async () => {
    const reviewer = jest.fn(async (layout: LayoutBlock[]) => ({ problems: [{ problem: 'x', at: layout.length - 1, kind: 'remove' as const, value: '' }], microUsd: 10 }));
    const result = await runFillReview(home, deps([[finding('photo-group', 3)]], { review: reviewer }).deps);
    expect(result.rounds).toBe(2);
    expect(reviewer).toHaveBeenCalledTimes(2);
    expect(result.applied).toEqual(['quité faq', 'quité story-split']);
  });

  it('stops at the cost cap', async () => {
    const reviewer = jest.fn(async () => ({ problems: [{ problem: 'x', at: 4, kind: 'remove' as const, value: '' }], microUsd: 2_000_000 }));
    const result = await runFillReview(home, deps([[], []], { review: reviewer }).deps);
    expect(reviewer).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('improved');
  });

  it('keeps the home as it was when the first render fails, and goes on with the rule repairs when the reviewer fails', async () => {
    const skipped = await runFillReview(home, deps([new Error('sandbox')]).deps);
    expect(skipped).toMatchObject({ outcome: 'skipped', changed: false, layout: home });
    const reviewer = jest.fn(async () => { throw new Error('timeout'); });
    const repaired = await runFillReview(home, deps([[finding('text-only-band', 4)], []], { review: reviewer }).deps);
    expect(repaired.applied).toEqual(['quité faq']);
  });

  it('lets a spent quota and a cancel stop the build', async () => {
    await expect(runFillReview(home, deps([[]], { review: async () => { throw new Error('cuota agotada'); } }).deps)).rejects.toThrow('cuota');
    const controller = new AbortController(); controller.abort();
    await expect(runFillReview(home, deps([[]], { signal: controller.signal }).deps)).rejects.toThrow('canceló');
  });

  it('never moves or removes the cover or the product grid, whatever is asked', async () => {
    const reviewer = async () => ({ problems: [{ problem: 'x', at: 0, kind: 'remove' as const, value: '' }, { problem: 'x', at: 1, kind: 'remove' as const, value: '' }], microUsd: 0 });
    const result = await runFillReview(home, deps([[finding('text-only-band', 0), finding('text-only-band', 1)]], { review: reviewer }).deps);
    expect(result.layout.map(block => block.type)).toEqual(home.map(block => block.type));
    expect(result.outcome).toBe('unchanged');
  });
});

describe('fill review: what may change', () => {
  it('without a section-fit entry, uses the home\'s own sections and the template\'s looks', () => {
    const made = fillReviewTemplate('none', 'Ninguna', { layout: [{ type: 'story-split', look: 'right' }], choices: { looks: { faq: ['cards'] } } }, { fit: {}, signature: {} }, home, () => true);
    expect(made.signature).toEqual(['cover-split']);
    expect(made.allowed).toEqual(home.map(block => block.type));
    expect(made.looks).toEqual({ 'story-split': ['right', 'left'], faq: ['cards'] });
  });
});

describe('template rules: each finding names its section', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser.close(); });
  const picture = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#c96"/></svg>');
  const page = (body: string) => `<!doctype html><html><head><style>body{margin:0;font:16px/1.4 sans-serif;background:#fff;color:#111} section{padding:40px 16px;min-height:120px}</style></head>
    <body><main>${body}</main></body></html>`;

  it('reports a section of words alone by its data-lb-at, at the desktop width', async () => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await tab.setContent(page(`
      <section data-lb-at="0" data-lb="cover-split"><h1 style="font-size:80px">Tienda</h1><img src="${picture}" width="600" height="400" alt=""></section>
      <section data-lb-at="1" data-lb="products-grid"><div data-pagosya-catalog style="height:300px"></div></section>
      <section data-lb-at="2" data-lb="statement"><h2>Una frase sola</h2><p>Sin foto ni productos al lado.</p></section>`));
    const found = await tab.evaluate(evaluateTemplateRules);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'text-only-band', at: 2, severity: 'block' })]));
    expect(found.find(f => f.rule === 'h-overflow')).toBeUndefined();
    await tab.close();
  });

  it('reports a page that scrolls sideways on the phone, on the section that overflows', async () => {
    const tab = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await tab.setContent(page(`
      <section data-lb-at="0" data-lb="cover-split"><h1>Tienda</h1><img src="${picture}" style="width:100%;height:auto" alt=""></section>
      <section data-lb-at="1" data-lb="story-split"><div style="width:620px"><img src="${picture}" width="600" height="400" alt=""></div></section>
      <section data-lb-at="2" data-lb="products-grid"><div data-pagosya-catalog style="height:300px"></div></section>`));
    const found = await tab.evaluate(evaluateTemplateRules);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'h-overflow', at: 1, severity: 'block' })]));
    await tab.close();
  });

  it('does not report a strip that its own box clips (a marquee)', async () => {
    const tab = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await tab.setContent(page(`
      <section data-lb-at="0" data-lb="cover-split"><h1>Tienda</h1><img src="${picture}" style="width:100%;height:auto" alt=""></section>
      <section data-lb-at="1" data-lb="strip-marquee" style="overflow:hidden"><div style="width:2000px;white-space:nowrap">uno dos tres</div></section>
      <section data-lb-at="2" data-lb="products-grid"><div data-pagosya-catalog style="height:300px"></div></section>`));
    const found = await tab.evaluate(evaluateTemplateRules);
    expect(found.find(f => f.rule === 'h-overflow')).toBeUndefined();
    await tab.close();
  });
});
