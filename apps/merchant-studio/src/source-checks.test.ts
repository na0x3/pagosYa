// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { sourceCheckResult, type SourceCheck } from './source-checks';
import { MerchantStudioApi } from './api';

afterEach(() => vi.unstubAllGlobals());
it('records success, failure and blocking setup findings without treating warnings as failures', () => {
  expect(sourceCheckResult([{ label: 'Escritorio', status: 'passed' }, { label: 'Diseño', status: 'warning' }]).passed).toBe(true);
  for (const rows of [[], [{ label: 'Móvil', status: 'failed' }], [{ label: 'Catálogo', status: 'skipped', blocking: true }]] as SourceCheck[][]) expect(sourceCheckResult(rows).passed).toBe(false);
});
it('bounds persisted findings without losing a failure beyond the retained rows', () => {
  const rows: SourceCheck[] = Array.from({ length: 1000 }, () => ({ label: 'á'.repeat(500), status: 'passed', detail: '🛒'.repeat(500) }));
  rows.push({ label: 'Móvil', status: 'failed' });
  const result = sourceCheckResult(rows);
  expect(result.passed).toBe(false);
  expect(new TextEncoder().encode(JSON.stringify(result.findings)).length).toBeLessThanOrEqual(65536);
  expect(rows).toHaveLength(1001);
});
it('posts only the result and findings to the authenticated revision endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  const body = sourceCheckResult([{ label: 'Móvil', status: 'failed' }]);
  await new MerchantStudioApi('merchant-token').recordSourceChecks('store/id', 4, body);
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer merchant-token');
  expect(fetch).toHaveBeenCalledWith('/api/v1/stores/store%2Fid/source-project/versions/4/checks', expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }));
});

it.each(['service', 'portfolio', 'editorial'] as const)('checks %s pages without inventing catalog or purchase requirements', async sitePurpose => {
  const { checkSourceWebsite } = await import('./source-checks');
  const snapshot = { schemaVersion: 1, brief: { sitePurpose, businessType: 'Studio', audience: 'Visitors', primaryAction: 'Contact', visualDirection: 'Editorial' }, files: [{ path: 'index.html', content: '<html><head></head><body><h1>Studio</h1><a href="#work">Projects</a><section id="work">Selected work</section></body></html>' }] };
  const append = document.body.append.bind(document.body);
  const frames: HTMLIFrameElement[] = [];
  const spy = vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
    append(...nodes);
    const frame = nodes[0] as HTMLIFrameElement; frames.push(frame);
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: frame.contentWindow, data: { type: 'pagosya:source-check-result', results: [{ label: 'Ancho de la página', status: 'passed' }, { label: 'Imágenes cargadas', status: 'passed' }] } })));
  });
  try {
    const result = await checkSourceWebsite(snapshot);
    expect(frames).toHaveLength(4);
    expect(frames.every(frame => frame.srcdoc.includes('(null,false)'))).toBe(true);
    expect(result.some(row => /Catálogo|Compra|Carrito|pago/i.test(row.label))).toBe(false);
    expect(result.filter(row => row.label.includes('Ancho de la página'))).toHaveLength(4);
    expect(sourceCheckResult(result).passed).toBe(true);
  } finally { spy.mockRestore(); }
});
it('keeps shops blocked without products and incomplete checks blocked for every purpose', async () => {
  const { checkSourceWebsite } = await import('./source-checks');
  const snapshot = { schemaVersion: 1, brief: { businessType: 'Shop', audience: 'Visitors', primaryAction: 'Buy', visualDirection: 'Editorial' }, files: [{ path: 'index.html', content: '<html><head></head><body><h1>Shop</h1></body></html>' }] };
  const controller = new AbortController(); controller.abort();
  const rows = await checkSourceWebsite(snapshot, controller.signal);
  expect(rows).toContainEqual(expect.objectContaining({ label: 'Catálogo pendiente', blocking: true }));
  expect(sourceCheckResult(rows).passed).toBe(false);
  const informational = await checkSourceWebsite({ ...snapshot, brief: { ...snapshot.brief, sitePurpose: 'portfolio' } }, controller.signal);
  expect(sourceCheckResult(informational).passed).toBe(false);
  expect(informational).toContainEqual(expect.objectContaining({ label: 'Comprobación interrumpida', blocking: true }));
});
it('noncommerce links cannot use nonexistent cart anchors as exempt application routes', async () => {
  const { sourceLinkChecks } = await import('./source-checks');
  const snapshot = { schemaVersion: 1, brief: { sitePurpose: 'portfolio' as const, businessType: 'Studio', audience: 'Visitors', primaryAction: 'Contact', visualDirection: 'Editorial' }, files: [{ path: 'index.html', content: '<a href="#cart">View work</a>' }] };
  expect(sourceLinkChecks(snapshot)).toContainEqual(expect.objectContaining({ label: 'Enlaces y secciones internas', status: 'failed' }));
});
