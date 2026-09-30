// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { mountSourceBrowser } from './source-browser';

const snapshot = { schemaVersion: 1, brief: {} as any, files: [{ path: 'index.html', content: '<h1>Miga</h1>' }] };
let app: HTMLDivElement;
beforeEach(() => {
  app = document.createElement('div'); document.body.replaceChildren(app);
  sessionStorage.setItem(SESSION_STORAGE_KEY, 'owner-session');
});
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); history.replaceState(null, '', '/'); });

it('shows a template on the store\'s catalog, full window, named after the template (Plantillas › Ver)', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&template=miga');
  const preview = vi.spyOn(MerchantStudioApi.prototype, 'templatePreview').mockResolvedValue(snapshot as any);
  vi.spyOn(MerchantStudioApi.prototype, 'listTemplates').mockResolvedValue([{ id: 'miga', name: 'Miga', category: 'comida', description: 'Pan.', tags: [], order: 1 }]);
  const version = vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion');
  await mountSourceBrowser(app);
  expect(preview).toHaveBeenCalledWith('s1', 'miga');
  expect(version).not.toHaveBeenCalled();
  expect(app.querySelector('iframe')!.getAttribute('srcdoc')).toContain('<h1>Miga</h1>');
  expect(document.title).toBe('Miga · Plantilla');
});

it('still opens the template when the list of names cannot be read', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&template=miga');
  vi.spyOn(MerchantStudioApi.prototype, 'templatePreview').mockResolvedValue(snapshot as any);
  vi.spyOn(MerchantStudioApi.prototype, 'listTemplates').mockRejectedValue(new Error('down'));
  await mountSourceBrowser(app);
  expect(app.querySelector('iframe')).toBeTruthy();
  expect(document.title).toBe('miga · Plantilla');
});

it('sends a template tab without a session back to Plantillas', async () => {
  sessionStorage.clear();
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&template=miga');
  await mountSourceBrowser(app);
  expect(app.querySelector('[role="alert"]')!.textContent).toBe('Abre esta vista desde «Ver» en Plantillas.');
});

it('shows the jumping star and a message while the template preview is prepared', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&template=miga');
  vi.spyOn(MerchantStudioApi.prototype, 'templatePreview').mockReturnValue(new Promise(() => {}));
  vi.spyOn(MerchantStudioApi.prototype, 'listTemplates').mockResolvedValue([]);
  void mountSourceBrowser(app);
  expect(app.querySelector('[role="status"] .tpl-loader-star')).toBeTruthy();
  expect(app.querySelector('[role="status"]')!.textContent).toContain('Preparando la vista previa con tus productos…');
});
