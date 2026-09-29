// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { mountTemplatesPage } from './source-templates-page';

const templates = [{ id: 'tostado', name: 'Tostado', category: 'comida', description: 'Café.', tags: [], order: 1 }, { id: 'miga', name: 'Miga', category: 'comida', description: 'Pan.', tags: [], order: 2 }];
const version = (templateRevision?: number) => ({ revision: 3, label: 'x', digest: 'd', restoredFrom: null, createdAt: '2026-09-26', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'V', primaryAction: 'C', visualDirection: 'P', ...(templateRevision ? { templateId: 'tostado', templateRevision } : {}) }, files: [] } });
let app: HTMLDivElement; let post: ReturnType<typeof vi.fn>; let realParent: Window;
beforeEach(() => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, 'owner-session');
  history.replaceState(null, '', '/studio/?embedded=1&library=templates&store=s1');
  app = document.createElement('div'); document.body.replaceChildren(app);
  post = vi.fn(); realParent = window.parent;
  Object.defineProperty(window, 'parent', { value: { postMessage: post }, configurable: true });
  vi.spyOn(MerchantStudioApi.prototype, 'listTemplates').mockResolvedValue(templates as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 3, versions: [], nextBefore: null } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'templatePreview').mockResolvedValue({ schemaVersion: 1, brief: {} as any, files: [{ path: 'index.html', content: '<h1>x</h1>' }] } as any);
});
afterEach(() => { Object.defineProperty(window, 'parent', { value: realParent, configurable: true }); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });

it('shows the gallery on the page itself, not in a dialog, with no close button', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  await mountTemplatesPage(app);
  await vi.waitFor(() => expect(app.querySelectorAll('[data-template-pick]')).toHaveLength(2));
  expect(document.querySelector('dialog')).toBeNull();
  expect(app.querySelector('[data-template-close]')).toBeNull();
});

it('lets the page scroll inside the dashboard frame over the dashboard background', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  await mountTemplatesPage(app);
  // style.css pins html/body to the viewport with overflow hidden for the editor; the gallery page opts out.
  expect(document.documentElement.classList.contains('tpl-page-doc')).toBe(true);
});

it('tells the dashboard its height so the frame grows with the gallery (one scroll, no gap)', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  let observed: () => void = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { observed = callback; } observe() {} disconnect() {} });
  await mountTemplatesPage(app);
  Object.defineProperty(app, 'scrollHeight', { value: 5200, configurable: true });
  observed();
  expect(post).toHaveBeenCalledWith({ type: 'pagosya:resource-height', storeId: 's1', height: 5200 }, location.origin);
  vi.unstubAllGlobals();
});

it('asks the dashboard for the whole screen while a template is open, and gives it back on Volver', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  await mountTemplatesPage(app);
  const card = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-pick="miga"]'); expect(found).toBeTruthy(); return found!; });
  card.click();
  expect(post).toHaveBeenCalledWith({ type: 'pagosya:template-focus', storeId: 's1', open: true }, location.origin);
  expect(document.documentElement.classList.contains('tpl-focus')).toBe(true);
  app.querySelector<HTMLButtonElement>('[data-template-back]')!.click();
  expect(post).toHaveBeenLastCalledWith({ type: 'pagosya:template-focus', storeId: 's1', open: false }, location.origin);
  expect(document.documentElement.classList.contains('tpl-focus')).toBe(false);
});

it('applies the chosen template at the current revision and tells the dashboard', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version(3) as any);
  const apply = vi.spyOn(MerchantStudioApi.prototype, 'applyTemplate').mockResolvedValue({ revision: 4, label: 'Plantilla: Miga' } as any);
  await mountTemplatesPage(app);
  const card = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-pick="miga"]'); expect(found).toBeTruthy(); return found!; });
  card.click();
  expect(app.textContent).not.toContain('historial');
  app.querySelector<HTMLButtonElement>('[data-template-apply]')!.click();
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'pagosya:template-applied', storeId: 's1', revision: 4 }, location.origin));
  expect(apply).toHaveBeenCalledWith('s1', 'miga', 3);
});

it('Editar applies at once on an untouched store and opens the editor', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version(3) as any);
  const apply = vi.spyOn(MerchantStudioApi.prototype, 'applyTemplate').mockResolvedValue({ revision: 4, label: 'Plantilla: Miga' } as any);
  await mountTemplatesPage(app);
  const edit = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-edit="miga"]'); expect(found).toBeTruthy(); return found!; });
  edit.click();
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'pagosya:template-applied', storeId: 's1', revision: 4 }, location.origin));
  expect(apply).toHaveBeenCalledWith('s1', 'miga', 3);
});

it('Editar asks on the card before replacing the merchant\'s own design, and Cancelar keeps it', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  const apply = vi.spyOn(MerchantStudioApi.prototype, 'applyTemplate').mockResolvedValue({ revision: 4, label: 'Plantilla: Miga' } as any);
  await mountTemplatesPage(app);
  const edit = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-edit="miga"]'); expect(found).toBeTruthy(); return found!; });
  edit.click();
  expect(apply).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(app.querySelector('[data-template-edit-confirm="miga"]'));
  app.querySelector<HTMLButtonElement>('[data-template-edit-cancel]')!.click();
  expect(app.querySelector('[data-template-edit-confirm]')).toBeNull();
  app.querySelector<HTMLButtonElement>('[data-template-edit="miga"]')!.click();
  app.querySelector<HTMLButtonElement>('[data-template-edit-confirm="miga"]')!.click();
  await vi.waitFor(() => expect(apply).toHaveBeenCalledWith('s1', 'miga', 3));
});

it('Ver opens the template on the store\'s catalog in a new tab, cut off from this page', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  const tab = { opener: window } as unknown as Window;
  const open = vi.spyOn(window, 'open').mockReturnValue(tab);
  await mountTemplatesPage(app);
  const view = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-view="tostado"]'); expect(found).toBeTruthy(); return found!; });
  view.click();
  expect(open).toHaveBeenCalledWith(`${location.origin}/?source=1&browser=1&store=s1&template=tostado`, '_blank');
  expect(tab.opener).toBeNull();
});

it('search narrows the cards while the field keeps its focus', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version() as any);
  await mountTemplatesPage(app);
  const search = await vi.waitFor(() => { const found = app.querySelector<HTMLInputElement>('[data-template-search]'); expect(found).toBeTruthy(); return found!; });
  search.focus();
  search.value = 'pan'; search.dispatchEvent(new Event('input'));
  expect([...app.querySelectorAll('[data-template-card]')].map(card => card.getAttribute('data-template-card'))).toEqual(['miga']);
  expect(document.activeElement).toBe(search);
});
