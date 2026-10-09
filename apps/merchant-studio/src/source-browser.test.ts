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

// Dressed in the merchant's store, a template kept its demo copy beside their name and photos and read as broken.
it('shows the template as designed, not dressed in the store, full window, named after it (Plantillas › Ver)', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&template=miga');
  const preview = vi.spyOn(MerchantStudioApi.prototype, 'templateDemo').mockResolvedValue(snapshot as any);
  const dressed = vi.spyOn(MerchantStudioApi.prototype, 'templatePreview');
  vi.spyOn(MerchantStudioApi.prototype, 'listTemplates').mockResolvedValue([{ id: 'miga', name: 'Miga', category: 'comida', description: 'Pan.', tags: [], order: 1 }]);
  const version = vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion');
  await mountSourceBrowser(app);
  expect(preview).toHaveBeenCalledWith('miga');
  expect(dressed).not.toHaveBeenCalled();
  expect(version).not.toHaveBeenCalled();
  expect(app.querySelector('iframe')!.getAttribute('srcdoc')).toContain('<h1>Miga</h1>');
  expect(document.title).toBe('Miga · Plantilla');
});

it('still opens the template when the list of names cannot be read', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&template=miga');
  vi.spyOn(MerchantStudioApi.prototype, 'templateDemo').mockResolvedValue(snapshot as any);
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
  vi.spyOn(MerchantStudioApi.prototype, 'templateDemo').mockReturnValue(new Promise(() => {}));
  vi.spyOn(MerchantStudioApi.prototype, 'listTemplates').mockResolvedValue([]);
  void mountSourceBrowser(app);
  expect(app.querySelector('[role="status"] .tpl-loader-star')).toBeTruthy();
  expect(app.querySelector('[role="status"]')!.textContent).toContain('Abriendo la plantilla…');
});

// «Ver en navegador» was disabled whenever the editor showed YAPI's draft, with no reason given.
it('opens the draft the editor shows, over its saved revision, keeping the photos the draft does not resend', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&revision=2&draft=1');
  const photo = { path: 'assets/hero.jpg', content: 'aGVybw==', encoding: 'base64' };
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue({ revision: 2, label: 'Plantilla', snapshot: { ...snapshot, files: [...snapshot.files, photo] } } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 2 } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceCatalog').mockResolvedValue({ items: [] } as any);
  const draft = vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: 5, interrupted: true, files: [{ path: 'index.html', content: '<h1>Gelato</h1>' }] });
  await mountSourceBrowser(app);
  expect(draft).toHaveBeenCalledWith('s1');
  const html = app.querySelector('iframe')!.getAttribute('srcdoc')!;
  expect(html).toContain('<h1>Gelato</h1>');
  expect(html).not.toContain('<h1>Miga</h1>');
  expect(document.title).toBe('Borrador de YAPI · Vista previa');
});

it('says the draft is gone instead of showing the saved design under its name', async () => {
  history.replaceState(null, '', '/studio/?source=1&browser=1&store=s1&revision=2&draft=1');
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue({ revision: 2, label: 'Plantilla', snapshot } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 2 } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceCatalog').mockResolvedValue({ items: [] } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
  await mountSourceBrowser(app);
  expect(app.querySelector('[role="alert"]')!.textContent).toContain('Este borrador ya no está disponible');
});
