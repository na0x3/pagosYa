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
