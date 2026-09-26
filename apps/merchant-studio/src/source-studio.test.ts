// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountSourceStudio } from './source-studio';
import { checkSourceWebsite } from './source-checks';
import { MerchantStudioApi, SESSION_STORAGE_KEY, type SourceVersion } from './api';

vi.mock('./source-checks', async importOriginal => ({ ...await importOriginal<typeof import('./source-checks')>(), checkSourceWebsite: vi.fn() }));
vi.mock('./source-design-jobs', () => ({ createSourceDesignJobs: () => () => {} }));
vi.mock('./source-visual-tools', () => ({ createSourceVisualTools: () => () => {} }));

const version: SourceVersion = { revision: 2, label: 'Diseño', digest: 'stored', restoredFrom: null, createdAt: '2026-09-19', snapshot: {
  schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' },
  files: [{ path: 'index.html', content: '<h1>Café</h1>' }, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' }],
} };
const passed = [{ label: 'Escritorio y móvil', status: 'passed' as const }];
let app: HTMLDivElement;
beforeEach(() => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, 'owner-session');
  app = document.createElement('div'); document.body.replaceChildren(app);
  vi.spyOn(MerchantStudioApi.prototype, 'listStores').mockResolvedValue([{ id: 's1', name: 'Café', slug: 'cafe' }] as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 2, versions: [version], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [] });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceCatalog').mockResolvedValue({ items: [] });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version);
  vi.spyOn(MerchantStudioApi.prototype, 'estimateSource').mockResolvedValue({ model: 'auto', reason: '', maxCredits: 50, estimate: { minCredits: 1, maxCredits: 2 } });
  vi.mocked(checkSourceWebsite).mockResolvedValue(passed);
});
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); app.remove(); });
const publish = () => app.querySelector<HTMLButtonElement>('#source-publish')!;

it('keeps publishing disabled until the passing result has been persisted for the checked revision', async () => {
  let finish!: () => void;
  const saving = new Promise<Record<string, unknown>>(resolve => { finish = () => resolve({}); });
  const record = vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockReturnValue(saving);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(record).toHaveBeenCalledWith('s1', 2, { passed: true, findings: passed }, expect.any(AbortSignal)));
  expect(publish().disabled).toBe(true);
  finish();
  await vi.waitFor(() => expect(publish().disabled).toBe(false));
});
it('persists failed checks and keeps publishing disabled', async () => {
  const findings = [{ label: 'Móvil', status: 'failed' as const }];
  vi.mocked(checkSourceWebsite).mockResolvedValue(findings);
  const record = vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(record).toHaveBeenCalledWith('s1', 2, { passed: false, findings }, expect.any(AbortSignal)));
  expect(publish().disabled).toBe(true);
});
it('keeps publishing blocked if persisting a passing result fails', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockRejectedValue(new Error('No se pudo guardar la comprobación.'));
  await mountSourceStudio(app);
  // The merchant never reads the diagnostic; the readiness step and a blocked
  // publish button carry the state instead.
  await vi.waitFor(() => expect(app.querySelector('[data-readiness-step=test] span')?.textContent).toBe('Por revisar'));
  expect(publish().disabled).toBe(true);
});
it('discards cancelled checks when another revision loads', async () => {
  let finishOld!: (rows: typeof passed) => void;
  vi.mocked(checkSourceWebsite).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
  const record = vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(checkSourceWebsite).toHaveBeenCalled());
  const oldSignal = vi.mocked(checkSourceWebsite).mock.calls.at(-1)![1]!;
  const next = { ...version, revision: 3 };
  vi.mocked(MerchantStudioApi.prototype.sourceState).mockResolvedValue({ revision: 3, versions: [next], nextBefore: null });
  vi.mocked(MerchantStudioApi.prototype.sourceVersion).mockResolvedValue(next);
  app.querySelector<HTMLButtonElement>('#source-reload')!.click();
  await vi.waitFor(() => expect(record).toHaveBeenCalledWith('s1', 3, { passed: true, findings: passed }, expect.any(AbortSignal)));
  expect(oldSignal.aborted).toBe(true);
  finishOld(passed);
  await vi.waitFor(() => expect(publish().disabled).toBe(false));
  expect(record).toHaveBeenCalledTimes(1);
});

it('sends the tapped Plantilla card as the choice', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'a1', role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', createdAt: '2026-09-26', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'Café' }, { id: 'miga', name: 'Miga', reason: 'Pan' }, { id: 'huerta', name: 'Huerta', reason: 'Verde' }] } },
  ] } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'Usar Miga' }, assistantMessage: { id: 'a2', role: 'ASSISTANT', content: 'Listo' } } as any);
  await mountSourceStudio(app);
  const card = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-choice="miga"]'); expect(found).toBeTruthy(); return found!; });
  card.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalled());
  expect(sent.mock.calls[0][1]).toBe('Usar Miga');
  expect(sent.mock.calls[0].at(-1)).toBe('miga');
});

it('keeps only the latest set of Plantilla cards tappable', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  const set = (ids: string[]) => ids.map(id => ({ id, name: id, reason: 'r' }));
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'a1', role: 'ASSISTANT', content: 'Primeras', createdAt: '2026-09-26', metadata: { templateChoices: set(['tostado', 'miga', 'huella']) } },
    { id: 'a2', role: 'ASSISTANT', content: 'Otras', createdAt: '2026-09-26', metadata: { templateChoices: set(['huerta', 'flora', 'nido']) } },
    { id: 'a3', role: 'ASSISTANT', content: 'Sí, Huerta usa fotos grandes.', createdAt: '2026-09-26', metadata: {} },
  ] } as any);
  await mountSourceStudio(app);
  const card = (id: string) => app.querySelector<HTMLButtonElement>(`[data-template-choice="${id}"]`)!;
  await vi.waitFor(() => expect(card('huerta')).toBeTruthy());
  expect(card('tostado').disabled).toBe(true);
  expect(card('huerta').disabled).toBe(false);
});

it('keeps YAPI template cards choosable while the store is untouched, and not after an edit', async () => {
  for (const [templateRevision, enabled] of [[2, true], [1, false]] as const) {
    const touched = { ...version, snapshot: { ...version.snapshot, brief: { ...version.snapshot.brief, templateId: 'tostado', templateRevision } } } as any;
    vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(touched);
    vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 2, versions: [touched], nextBefore: null });
    vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
      { id: 'a1', role: 'ASSISTANT', content: 'Elegí estas 3 plantillas', createdAt: '2026-09-26', metadata: { templateChoices: [{ id: 'tostado', name: 'Tostado', reason: 'r' }, { id: 'miga', name: 'Miga', reason: 'r' }, { id: 'huerta', name: 'Huerta', reason: 'r' }] } },
    ] } as any);
    app.replaceChildren();
    await mountSourceStudio(app);
    const card = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>('[data-template-choice="miga"]'); expect(found).toBeTruthy(); return found!; });
    await vi.waitFor(() => expect(card.disabled).toBe(!enabled));
  }
});

it('sends the brand, shipping and domain shortcuts to the matching Ajustes section when embedded', async () => {
  history.replaceState(null, '', '/studio/?source=1&embedded=1&store=s1');
  // Embedded means framed by the dashboard: give this window a separate parent.
  const post = vi.fn();
  const realParent = window.parent;
  Object.defineProperty(window, 'parent', { value: { postMessage: post }, configurable: true });
  await mountSourceStudio(app);
  for (const [id, section] of [['source-brand', 'brand'], ['source-shipping', 'shipping'], ['source-domain', 'domain']] as const) {
    const button = await vi.waitFor(() => { const found = app.querySelector<HTMLButtonElement>(`#${id}`); expect(found).toBeTruthy(); return found!; });
    button.click();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'pagosya:workspace', view: 'store-settings', section }), location.origin);
  }
  Object.defineProperty(window, 'parent', { value: realParent, configurable: true });
  history.replaceState(null, '', '/');
});
