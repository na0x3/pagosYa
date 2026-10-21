// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: '<!doctype html><html><body><main style="height:5000px">Tienda</main></body></html>' }] };

// Owner 2026-10-21: «every time I update something it reloads from the top». The Studio passes the last position back.
it('a redrawn Studio preview scrolls back to where the merchant was, then reports where it is', async () => {
  const dom = new JSDOM(sourcePreviewDocument(snapshot as any, 'index.html', { scrollY: 1800 }), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; const asked: number[] = []; const posted: any[] = [];
  w.scrollTo = (_x: number, y: number) => { asked.push(y); Object.defineProperty(w, 'scrollY', { value: y, configurable: true }); };
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:preview-scroll') posted.push(event.data); });
  const runtime = [...w.document.scripts].map(script => script.textContent).join('\n');
  w.eval(runtime.slice(runtime.indexOf('(function () {\n  var wanted')));
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(asked[0]).toBe(1800);
  expect(posted.at(-1)).toEqual({ type: 'pagosya:preview-scroll', y: 1800 });
  w.close();
});

it('a published page never carries the scroll keeper, and no position means no scrolling', () => {
  expect(sourcePreviewDocument(snapshot as any, 'index.html', { hosted: true, scrollY: 900 })).not.toContain('pagosya:preview-scroll');
  expect(sourcePreviewDocument(snapshot as any, 'index.html', {})).toContain('var wanted = 0, restoring = wanted > 0');
});
