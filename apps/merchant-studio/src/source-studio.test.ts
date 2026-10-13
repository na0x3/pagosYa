// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountSourceStudio } from './source-studio';
import { checkSourceWebsite } from './source-checks';
import { ApiError, MerchantStudioApi, SESSION_STORAGE_KEY, type SourceVersion } from './api';

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
  expect(sent.mock.calls[0][9]).toBe('miga');
});

it('does not expose obsolete generic design direction choices', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'a1', role: 'ASSISTANT', content: 'Elige una dirección', createdAt: '2026-09-27', metadata: { directionChoices: [{ id: 'retro-americana', name: 'Retro americana', description: 'd', palette: { background: '#f6ecd6', surface: '#efd9a7', ink: '#2b1d14', accent: '#b5441b' }, fonts: { display: 'bebas-neue', text: 'rubik' } }] } },
  ] } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'Usar Retro americana' }, assistantMessage: { id: 'a2', role: 'ASSISTANT', content: 'Listo' } } as any);
  await mountSourceStudio(app);
  expect(app.querySelector('[data-direction-choice]')).toBeNull();
  expect(sent).not.toHaveBeenCalled();
});

it('shows the store appearing while YAPI builds, from its latest clean draft, and drops the draft when the build ends', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'a1', role: 'ASSISTANT', content: 'Elige una dirección', createdAt: '2026-09-27', metadata: { directionChoices: [{ id: 'retro-americana', name: 'Retro americana', description: 'd', palette: { background: '#f6ecd6', surface: '#efd9a7', ink: '#2b1d14', accent: '#b5441b' }, fonts: { display: 'bebas-neue', text: 'rubik' } }] } },
  ] } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceProgress').mockResolvedValue({ progress: null });
  const drafts = vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: 5, files: [{ path: 'index.html', content: '<!doctype html><h1>Borrador en vivo</h1>' }] });
  let finish: (value: any) => void = () => {};
  vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockReturnValue(new Promise(resolve => { finish = resolve; }) as any);
  await mountSourceStudio(app);
  const composer = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  composer.value = 'Crea mi tienda desde cero';
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const frame = await vi.waitFor(() => { const found = app.querySelector<HTMLIFrameElement>('.is-live-draft iframe'); expect(found?.srcdoc).toContain('Borrador en vivo'); return found!; }, { timeout: 4000 });
  expect(frame).toBeTruthy();
  expect(app.querySelector('[data-live-draft-badge]')?.textContent).toContain('en vivo');
  expect(drafts.mock.calls.at(-1)?.[1]).toBeUndefined();
  finish({ userMessage: { id: 'u', role: 'USER', content: 'Usar Retro americana' }, assistantMessage: { id: 'a2', role: 'ASSISTANT', content: 'Listo' } });
  await vi.waitFor(() => expect(app.querySelector('.is-live-draft')).toBeNull());
});

it('keeps the canvas toolbar to preview, code, ZIP and browser — no Editar diseño', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [] } as any);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-code-tab')).toBeTruthy());
  expect(app.querySelector('#source-visual-edit')).toBeNull();
  expect(app.querySelector('#source-open-browser')).toBeTruthy();
});

it('while YAPI builds nothing animates: no thinking face, stars or code ticker in the chat or the preview', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'a1', role: 'ASSISTANT', content: 'Elige una dirección', createdAt: '2026-09-27', metadata: { directionChoices: [{ id: 'retro-americana', name: 'Retro americana', description: 'd', palette: { background: '#f6ecd6', surface: '#efd9a7', ink: '#2b1d14', accent: '#b5441b' }, fonts: { display: 'bebas-neue', text: 'rubik' } }] } },
  ] } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceProgress').mockResolvedValue({ progress: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
  let finish: (value: any) => void = () => {};
  vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockReturnValue(new Promise(resolve => { finish = resolve; }) as any);
  await mountSourceStudio(app);
  expect(document.querySelector('.star-field')).toBeTruthy();
  const composer = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  composer.value = 'Crea mi tienda desde cero';
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const working = await vi.waitFor(() => { const note = app.querySelector('[data-build-progress]')?.closest('.agent-note'); expect(note).toBeTruthy(); return note!; });
  expect(working.querySelector('.yapi-mark, .is-thinking')).toBeNull();
  expect(app.querySelector('.is-thinking, [data-face]')).toBeNull();
  expect(app.querySelector('[data-build-stars], [data-build-code]')).toBeNull();
  expect(document.querySelector('.star-field, .code-ticker')).toBeNull();
  finish({ userMessage: { id: 'u', role: 'USER', content: 'Usar Retro americana' }, assistantMessage: { id: 'a2', role: 'ASSISTANT', content: 'Listo' } });
});

it('lets the merchant pick a Claude model like any other', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [] } as any);
  await mountSourceStudio(app);
  const select = await vi.waitFor(() => { const found = app.querySelector<HTMLSelectElement>('#source-model'); expect(found).toBeTruthy(); return found!; });
  const options = [...select.options].map(option => option.value);
  expect(options).toEqual(expect.arrayContaining(['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']));
  expect([...select.options].find(option => option.value === 'claude-sonnet-5')!.textContent).toContain('Claude Sonnet 5');
});

it('offers 200 credits per request by default, enough for YAPI to build and check a whole store', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 0, versions: [], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [] } as any);
  await mountSourceStudio(app);
  const limit = await vi.waitFor(() => { const found = app.querySelector<HTMLInputElement>('#source-credit-limit'); expect(found).toBeTruthy(); return found!; });
  expect(limit.value).toBe('200');
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

it('shows no visual-resources or design-improvement tools above the YAPI composer', async () => {
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#agent-command')).toBeTruthy());
  expect(app.querySelector('.source-canvas-tools, [data-source-visual-tools], [data-source-design-jobs]')).toBeNull();
});

it('frees the composer and Ver en navegador as soon as YAPI saves, while the browser checks still run', async () => {
  let finishChecks!: (rows: typeof passed) => void;
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
  const next = { ...version, revision: 3 };
  vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockImplementation(async () => {
    vi.mocked(MerchantStudioApi.prototype.sourceState).mockResolvedValue({ revision: 3, versions: [next], nextBefore: null });
    vi.mocked(MerchantStudioApi.prototype.sourceVersion).mockResolvedValue(next);
    vi.mocked(checkSourceWebsite).mockReturnValueOnce(new Promise(resolve => { finishChecks = resolve; }));
    return { userMessage: { id: 'u', role: 'USER', content: 'Cambia el color' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'Listo' }, revision: next } as any;
  });
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(publish().disabled).toBe(false));
  const composer = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  composer.value = 'Cambia el color'; composer.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(finishChecks).toBeTypeOf('function'));
  await vi.waitFor(() => expect(app.querySelector<HTMLTextAreaElement>('#agent-command')!.disabled).toBe(false));
  expect(app.querySelector<HTMLButtonElement>('#source-open-browser')!.disabled).toBe(false);
  expect(publish().disabled).toBe(true);
  finishChecks(passed);
  await vi.waitFor(() => expect(app.querySelector('.toast')?.textContent).toContain('Comprobaciones terminadas'));
  expect(publish().disabled).toBe(false);
});

it('retries the original page context after navigating the preview', async () => {
  const text = 'Rediseña todo mi sitio';
  const withGallery = { ...version, snapshot: { ...version.snapshot, files: [...version.snapshot.files, { path: 'galeria.html', content: '<h1>Galería</h1>' }] } };
  vi.mocked(MerchantStudioApi.prototype.sourceVersion).mockResolvedValue(withGallery);
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockImplementationOnce(async () => {
    vi.mocked(MerchantStudioApi.prototype.sourceConversation).mockResolvedValue({ messages: [
      { id: 'retry-u', role: 'USER', content: text, metadata: { assetUrls: [] } },
      { id: 'retry-a', role: 'ASSISTANT', content: 'Falló', metadata: { failed: true } },
    ] } as any);
    throw new Error('No se pudo verificar');
  }).mockResolvedValue({ userMessage: { id: 'done-u', role: 'USER', content: text }, assistantMessage: { id: 'done-a', role: 'ASSISTANT', content: 'Listo' } } as any);
  await mountSourceStudio(app);
  const composer = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  composer.value = text; composer.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(app.querySelector('#source-retry-message')).not.toBeNull());
  expect(sent.mock.calls[0][12]).toBe('index.html');
  app.querySelector<HTMLButtonElement>('[data-preview-page="galeria.html"]')!.click();
  app.querySelector<HTMLButtonElement>('#source-retry-message')!.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
  expect(sent.mock.calls[1][12]).toBe('index.html');
});

it.each(['dropdown', 'pages'])('includes the chosen %s navigation in the request', async choice => {
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'Crear tienda' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'Recibido' } } as any);
  await mountSourceStudio(app);
  const select = app.querySelector<HTMLSelectElement>('#source-navigation-choice')!;
  select.value = choice; select.dispatchEvent(new Event('change', { bubbles: true }));
  const input = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  input.value = 'Crear tienda'; input.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(sent).toHaveBeenCalled());
  expect(sent.mock.calls[0][1]).toContain(choice === 'dropdown' ? 'menú Tienda desplegable' : 'páginas separadas dentro del mismo sitio');
  expect(sent.mock.calls[0][1]).toContain(choice === 'dropdown' ? 'No abrir ventanas nuevas' : 'misma pestaña del navegador');
});

it('shows the images and videos a merchant sent as large attachments in their chat message', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [
    { id: 'u1', role: 'USER', content: 'haz el footer como esta foto', createdAt: '2026-10-02', metadata: { assetUrls: ['/v1/uploads/peso.webp', '/v1/uploads/clip.mp4', 'javascript:alert(1)'] } },
  ] } as any);
  await mountSourceStudio(app);
  const attachments = await vi.waitFor(() => { const found = app.querySelector('.message--remote-user .message-attachments'); expect(found).toBeTruthy(); return found!; });
  const image = attachments.querySelector<HTMLImageElement>('img')!;
  expect(image.src).toMatch(/\/v1\/uploads\/peso\.webp$/);
  expect(image.closest('a')?.target).toBe('_blank');
  expect(attachments.querySelector<HTMLVideoElement>('video')?.src).toMatch(/\/v1\/uploads\/clip\.mp4$/);
  expect(attachments.innerHTML).not.toContain('javascript:');
  expect(app.querySelector('.message--remote-user p')?.textContent).toBe('haz el footer como esta foto');
});
it('renders no attachment block for a message without files', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [{ id: 'u1', role: 'USER', content: 'hola', createdAt: '2026-10-02', metadata: { assetUrls: [] } }] } as any);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('.message--remote-user')).toBeTruthy());
  expect(app.querySelector('.message-attachments')).toBeNull();
});

const sketchVersion: SourceVersion = { ...version, snapshot: { ...version.snapshot, files: [...version.snapshot.files, { path: 'sketch.json', content: '{}' }] } };
const sketchBody = { revision: 2, sketch: { palette: { paper: '#ffffff', ink: '#111111', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' }, fonts: { display: 'anton', text: 'manrope' }, scale: 'm', blocks: [{ id: 'intro', type: 'hero', variant: 'photo-right', headline: 'Hola', sub: '', cta: 'Ver', bg: 'paper', size: 'l' }] }, photos: [], fonts: ['anton'] };
const bocetoStore = () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockImplementation(async () => ({ revision: 2, versions: [structuredClone(sketchVersion)], nextBefore: null }));
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockImplementation(async () => structuredClone(sketchVersion));
  vi.spyOn(MerchantStudioApi.prototype, 'getSketch').mockImplementation(async () => structuredClone(sketchBody) as any);
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
};

const openBoceto = async () => {
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-tab')).not.toBeNull());
  app.querySelector<HTMLButtonElement>('#source-boceto-tab')!.click();
  await vi.waitFor(() => expect(app.querySelector('[data-boceto-block="intro"]')).not.toBeNull());
};

it('opens structured drafts in YAPI + preview and makes the canvas optional', async () => {
  bocetoStore();
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-tab')).not.toBeNull());
  expect(app.querySelector('.studio-workspace.is-boceto')).toBeNull();
  expect(app.querySelector('.agent-panel.is-chat-expanded')).not.toBeNull();
  expect(app.querySelector('#source-preview-tab')).not.toBeNull();
  expect(app.querySelector<HTMLButtonElement>('#source-code-tab')!.disabled).toBe(true);
  expect(app.querySelector('#source-publish')).toBeNull();
  expect(app.querySelector('#source-boceto-generate')).not.toBeNull();
  await openBoceto();
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
  expect(app.querySelector('#source-boceto-close')?.textContent).toBe('Editar en Boceto');
  app.querySelector<HTMLButtonElement>('#source-boceto-close')!.click();
  await vi.waitFor(() => expect(app.querySelector('.studio-workspace.is-boceto')).toBeNull());
  expect(app.querySelector('#source-boceto-tab')).not.toBeNull();
  expect(app.querySelector('.agent-panel.is-chat-expanded')).not.toBeNull();
});

it('saves pending canvas changes before returning to YAPI and preview', async () => {
  bocetoStore();
  const save = vi.spyOn(MerchantStudioApi.prototype, 'putSketch').mockImplementation(async (_store, body) => ({ revision: 3, sketch: body.sketch } as any));
  const latest = { ...sketchVersion, revision: 3 };
  await mountSourceStudio(app); await openBoceto();
  ([...app.querySelectorAll('.bct-segment__option')].find(node => node.textContent === 'Rectas') as HTMLElement).click();
  vi.mocked(MerchantStudioApi.prototype.sourceState).mockResolvedValue({ revision: 3, versions: [latest], nextBefore: null });
  vi.mocked(MerchantStudioApi.prototype.sourceVersion).mockResolvedValue(latest);
  app.querySelector<HTMLButtonElement>('#source-boceto-close')!.click();
  await vi.waitFor(() => expect(app.querySelector('.studio-workspace.is-boceto')).toBeNull());
  expect(save).toHaveBeenCalledWith('s1', expect.objectContaining({ revision: 2 }));
  await openBoceto();
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
});

it('keeps the canvas open when saving before returning to YAPI fails', async () => {
  bocetoStore();
  vi.spyOn(MerchantStudioApi.prototype, 'putSketch').mockRejectedValue(new Error('network'));
  await mountSourceStudio(app); await openBoceto();
  ([...app.querySelectorAll('.bct-segment__option')].find(node => node.textContent === 'Rectas') as HTMLElement).click();
  app.querySelector<HTMLButtonElement>('#source-boceto-close')!.click();
  await vi.waitFor(() => expect(app.querySelector('.toast')?.textContent).toContain('No se pudo guardar tu último cambio'));
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
});

it('keeps YAPI on the left while the optional editor selects a block for chat', async () => {
  bocetoStore();
  await mountSourceStudio(app);
  await openBoceto();
  await vi.waitFor(() => expect(app.querySelector('[data-boceto-block="intro"]')).not.toBeNull());
  expect(app.querySelector('.studio-workspace.is-boceto-left-yapi')).not.toBeNull();
  expect(app.querySelector('.studio-workspace.is-boceto-yapi')).toBeNull();
  expect(app.querySelector('[data-boceto-tab="yapi"]')).toBeNull();
  expect(app.querySelector('.bct-panel .bct-layers')).not.toBeNull();
  expect(app.querySelector('#agent-command')).not.toBeNull();
  (app.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  await vi.waitFor(() => expect(app.querySelector('[data-selection-chip]')?.textContent).toContain('Portada'));
});

it('Generar sitio asks first, then builds and leaves the boceto for good', async () => {
  bocetoStore();
  const build = vi.spyOn(MerchantStudioApi.prototype, 'buildSketch').mockResolvedValue({ revision: 3 });
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-generate')).not.toBeNull());
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  expect(app.querySelector('.boceto-confirm')?.textContent).toContain('ya no podrás editarlo por bloques');
  (app.querySelector('[data-boceto-confirm="cancel"]') as HTMLElement).click();
  expect(app.querySelector('.boceto-confirm')).toBeNull();
  expect(build).not.toHaveBeenCalled();
  const site = { ...version, revision: 3 };
  vi.mocked(MerchantStudioApi.prototype.sourceState).mockResolvedValue({ revision: 3, versions: [site], nextBefore: null });
  vi.mocked(MerchantStudioApi.prototype.sourceVersion).mockResolvedValue(site);
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  (app.querySelector('[data-boceto-confirm="go"]') as HTMLElement).click();
  await vi.waitFor(() => expect(build).toHaveBeenCalledWith('s1', { revision: 2 }));
  await vi.waitFor(() => expect(app.querySelector('.studio-workspace.is-boceto')).toBeNull());
  expect(app.querySelector('#source-code-tab')).not.toBeNull();
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-tab')).toBeNull());
  await vi.waitFor(() => expect(app.textContent).toContain('Sitio generado desde tu boceto'));
});

it('Generar sitio on a stale revision keeps the merchant in the boceto with a clear note', async () => {
  bocetoStore();
  vi.spyOn(MerchantStudioApi.prototype, 'buildSketch').mockRejectedValue(new ApiError('El boceto cambió. Recarga.', 409));
  await mountSourceStudio(app);
  await openBoceto();
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-generate')).not.toBeNull());
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  (app.querySelector('[data-boceto-confirm="go"]') as HTMLElement).click();
  await vi.waitFor(() => expect(app.textContent).toContain('El boceto cambió. Revisa la versión más reciente y vuelve a generar.'));
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
});

it('review: Generar sitio stops when the last Boceto change could not be saved', async () => {
  bocetoStore();
  vi.spyOn(MerchantStudioApi.prototype, 'putSketch').mockRejectedValue(new Error('network'));
  const build = vi.spyOn(MerchantStudioApi.prototype, 'buildSketch').mockResolvedValue({ revision: 3 });
  await mountSourceStudio(app);
  await openBoceto();
  await vi.waitFor(() => expect(app.querySelector('[data-boceto-block="intro"]')).not.toBeNull());
  ([...app.querySelectorAll('.bct-segment__option')].find(node => node.textContent === 'Rectas') as HTMLElement).click();
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  (app.querySelector('[data-boceto-confirm="go"]') as HTMLElement).click();
  await vi.waitFor(() => expect(app.querySelector('.toast')?.textContent).toContain('No se pudo guardar tu último cambio'));
  expect(build).not.toHaveBeenCalled();
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
});

it('review: a failed Generar sitio says so where the merchant is looking', async () => {
  bocetoStore();
  vi.spyOn(MerchantStudioApi.prototype, 'buildSketch').mockRejectedValue(new Error('network'));
  await mountSourceStudio(app);
  await openBoceto();
  await vi.waitFor(() => expect(app.querySelector('#source-boceto-generate')).not.toBeNull());
  (app.querySelector('#source-boceto-generate') as HTMLElement).click();
  (app.querySelector('[data-boceto-confirm="go"]') as HTMLElement).click();
  await vi.waitFor(() => expect(app.querySelector('.toast')?.textContent).toContain('No se pudo generar. Inténtalo de nuevo.'));
  expect(app.querySelector('.studio-workspace.is-boceto')).not.toBeNull();
});

it('review: after the Studio clears the chip (Esc), picking the block again brings it back', async () => {
  bocetoStore();
  await mountSourceStudio(app);
  await openBoceto();
  await vi.waitFor(() => expect(app.querySelector('[data-boceto-block="intro"]')).not.toBeNull());
  (app.querySelector('[data-boceto-block="intro"] .bct-block__head') as HTMLElement).click();
  await vi.waitFor(() => expect(app.querySelector('[data-selection-chip]')?.textContent).toContain('Portada'));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await vi.waitFor(() => expect(app.querySelector('[data-selection-chip]')).toBeNull());
  (app.querySelector('[data-boceto-node="copy"]') as HTMLElement).click();
  await vi.waitFor(() => expect(app.querySelector('[data-selection-chip]')?.textContent).toContain('Portada'));
});

// 2026-10-08, store "excess": a design YAPI finished but could not save stayed a preserved draft; the next message rebuilt the template.
const preserved = { at: 5, interrupted: true, files: [{ path: 'index.html', content: '<h1>Gelato</h1>' }], retry: { text: 'Crea mi gelatería', assetUrls: ['/v1/uploads/a.jpg'], currentPage: 'index.html' } };
const answered = { userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'Listo' } } as any;

it('saves a preserved draft by finishing the run it came from', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue(preserved);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue(answered);
  await mountSourceStudio(app);
  const save = await vi.waitFor(() => { const button = app.querySelector<HTMLButtonElement>('#source-save-draft'); expect(button).toBeTruthy(); return button!; });
  expect(app.textContent).toContain('Este borrador todavía no está guardado');
  save.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalled());
  expect(sent.mock.calls[0][1]).toBe('Crea mi gelatería');
  expect(sent.mock.calls[0][2]).toEqual(['/v1/uploads/a.jpg']);
  expect(sent.mock.calls[0].at(-1)).toEqual({ resumeDraft: true });
});

it('builds a new message on the preserved draft: the draft is saved first, then the message goes out', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue(preserved);
  const state = vi.spyOn(MerchantStudioApi.prototype, 'sourceState');
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockImplementation(async () => {
    state.mockResolvedValue({ revision: 3, versions: [{ ...version, revision: 3 }], nextBefore: null });
    vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
    return { ...answered, revision: { revision: 3, label: 'Gelatería' } };
  });
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-save-draft')).toBeTruthy());
  const field = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  field.value = 'Agrega una sección de sabores'; field.dispatchEvent(new Event('input'));
  app.querySelector<HTMLFormElement>('[data-composer]')!.requestSubmit();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
  expect(sent.mock.calls[0][1]).toBe('Crea mi gelatería');
  expect(sent.mock.calls[0].at(-1)).toEqual({ resumeDraft: true });
  expect(sent.mock.calls[1][1]).toContain('Agrega una sección de sabores');
  expect(sent.mock.calls[1].at(-1)).toBeUndefined();
});

it('keeps the new message in the box when the draft could not be saved', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue(preserved);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue(answered);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('#source-save-draft')).toBeTruthy());
  const field = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  field.value = 'Agrega una sección de sabores'; field.dispatchEvent(new Event('input'));
  app.querySelector<HTMLFormElement>('[data-composer]')!.requestSubmit();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(app.querySelector<HTMLTextAreaElement>('#agent-command')!.value).toBe('Agrega una sección de sabores'));
  expect(sent).toHaveBeenCalledTimes(1);
});

const styleCard = (index: number) => ({ index, slot: index, name: `Estilo ${index}`, mode: index < 1 ? 'calm' : 'bold', vibe: 'Vibra', inspiration: ['Uno'], fonts: { display: 'outfit', text: 'manrope', displayFamily: 'Outfit', textFamily: 'Manrope' }, palette: ['#ffffff'], html: '<img src="/v1/uploads/a.jpg">', source: 'model' }) as const;
it('shows the proposed styles in the preview area and sends the picked one as a stylePick', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'AWAITING_STYLE', recommended: 1, cards: [0, 1].map(styleCard) } } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'ok' } } as any);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelectorAll('[data-style-card]')).toHaveLength(2));
  expect(app.querySelector('.source-frame-wrap')).toBeNull();
  const frame = app.querySelector<HTMLIFrameElement>('.style-frame iframe')!;
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('srcdoc')).toContain(`src="${new URL('/api/v1/uploads/a.jpg', location.href).href}"`);
  app.querySelector<HTMLButtonElement>('[data-style-card="1"]')!.click();
  app.querySelector<HTMLButtonElement>('[data-style-use="1"]')!.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
  expect(sent.mock.calls[0][1]).toBe('Usar el estilo «Estilo 1»');
  expect(sent.mock.calls[0].at(-1)).toEqual({ stylePick: { generationId: 'g1', index: 1 } });
});
it('sends Elige tú as an automatic pick and retries a failed build with the same pick', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'AWAITING_STYLE', recommended: 1, cards: [0, 1].map(styleCard) } } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockRejectedValueOnce(new Error('Falló la construcción'))
    .mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'ok' } } as any);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('[data-style-auto]')).not.toBeNull());
  vi.mocked(MerchantStudioApi.prototype.sourceConversation).mockResolvedValue({ messages: [{ id: 'm1', role: 'USER', content: 'Usar el estilo «Estilo 1»', metadata: { assetUrls: [] } }] } as any);
  app.querySelector<HTMLButtonElement>('[data-style-auto]')!.click();
  await vi.waitFor(() => expect(app.querySelector('#source-retry-message')).not.toBeNull());
  expect(sent.mock.calls[0][1]).toBe('Usar el estilo «Estilo 1»');
  expect(sent.mock.calls[0].at(-1)).toEqual({ stylePick: { generationId: 'g1', auto: true } });
  app.querySelector<HTMLButtonElement>('#source-retry-message')!.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
  expect(sent.mock.calls[1][1]).toBe('Usar el estilo «Estilo 1»');
  expect(sent.mock.calls[1].at(-1)).toEqual({ stylePick: { generationId: 'g1', auto: true } });
});
it('after a reload, shows a picked style whose build failed and retries it with the same pick', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'PICKED', picked: 1, recommended: 0, cards: [0, 1].map(styleCard) } } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'ok' } } as any);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelector('[data-style-retry]')).not.toBeNull());
  expect(app.querySelectorAll('[data-style-card]')).toHaveLength(2);
  expect(app.querySelector('[data-style-retry]')!.textContent).toBe('Reintentar con «Estilo 1»');
  app.querySelector<HTMLButtonElement>('[data-style-retry]')!.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
  expect(sent.mock.calls[0][1]).toBe('Usar el estilo «Estilo 1»');
  expect(sent.mock.calls[0].at(-1)).toEqual({ stylePick: { generationId: 'g1', index: 1 } });
});
it('does not drop a pick while code edits are unsaved: the buttons are disabled and the picker stays', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'AWAITING_STYLE', recommended: 1, cards: [0, 1].map(styleCard) } } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage');
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelectorAll('[data-style-card]')).toHaveLength(2));
  app.querySelector<HTMLButtonElement>('#source-code-tab')!.click();
  const code = app.querySelector<HTMLTextAreaElement>('#source-code')!;
  code.value = '<h1>Editado</h1>';
  code.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector<HTMLButtonElement>('#source-preview-tab')!.click();
  const auto = app.querySelector<HTMLButtonElement>('[data-style-auto]')!;
  expect(auto.disabled).toBe(true);
  auto.disabled = false; auto.click();
  app.querySelector<HTMLButtonElement>('[data-style-card="1"]')!.click();
  const use = app.querySelector<HTMLButtonElement>('[data-style-use="1"]')!;
  expect(use.disabled).toBe(true);
  use.disabled = false; use.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(sent).not.toHaveBeenCalled();
  expect(app.querySelector('[data-style-use="1"]')).not.toBeNull();
});
it('stops polling the proposal when the build ends, even if the row still says RUNNING', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'RUNNING', recommended: 0, cards: [] } } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceProgress').mockResolvedValue({ progress: { status: 'running', startedAt: 1, updatedAt: 1, steps: [{ stage: 'styles', label: 'Estilos', startedAt: 1, status: 'running' }] } });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
  let finish: (value: any) => void = () => {};
  vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockReturnValue(new Promise(resolve => { finish = resolve; }) as any);
  const armed = vi.spyOn(window, 'setInterval'), cleared = vi.spyOn(window, 'clearInterval');
  await mountSourceStudio(app);
  const composer = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  composer.value = 'Rediseña mi tienda';
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(armed.mock.calls.some(call => call[1] === 1500)).toBe(true), { timeout: 3000 });
  expect(app.querySelector('.style-pick')?.textContent).toContain('Preparando tus estilos…');
  const id = armed.mock.results[armed.mock.calls.findIndex(call => call[1] === 1500)].value;
  finish({ userMessage: { id: 'u', role: 'USER', content: 'Rediseña mi tienda' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'No se pudo' } });
  await vi.waitFor(() => expect(cleared).toHaveBeenCalledWith(id));
  expect(app.querySelector('.style-pick')).toBeNull();
});
it('does not re-arm the proposal poll once the cards are waiting for the pick', async () => {
  const proposal = vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'AWAITING_STYLE', recommended: 1, cards: [0, 1].map(styleCard) } } as any);
  const progress = vi.spyOn(MerchantStudioApi.prototype, 'sourceProgress').mockResolvedValue({ progress: { status: 'running', startedAt: 1, updatedAt: 1, steps: [{ stage: 'styles', label: 'Estilos', startedAt: 1, status: 'completed' }] } });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceDraftPreview').mockResolvedValue({ at: null });
  let finish: (value: any) => void = () => {};
  vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockReturnValue(new Promise(resolve => { finish = resolve; }) as any);
  const armed = vi.spyOn(window, 'setInterval');
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelectorAll('[data-style-card]')).toHaveLength(2));
  const fetched = proposal.mock.calls.length;
  const composer = app.querySelector<HTMLTextAreaElement>('#agent-command')!;
  composer.value = 'Hola';
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(progress.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
  expect(armed.mock.calls.some(call => call[1] === 1500)).toBe(false);
  expect(proposal.mock.calls.length).toBe(fetched);
  finish({ userMessage: { id: 'u', role: 'USER', content: 'Hola' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'Primero elige un estilo' } });
});

it('shows the polishing note while YAPI reviews, then loads the polished store and its chat line when it lands', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState')
    .mockResolvedValueOnce({ revision: 2, versions: [version], nextBefore: null, reviewPending: true })
    .mockResolvedValue({ revision: 3, versions: [version], nextBefore: null, reviewPending: false });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation')
    .mockResolvedValueOnce({ messages: [] })
    .mockResolvedValue({ messages: [{ id: 'r1', role: 'ASSISTANT', content: 'Pulí tu tienda: Agrandé el título.', metadata: { sourceRevision: 3, label: 'Revisión de YAPI', review: true }, createdAt: '2026-10-12T12:00:00Z' }] } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockImplementation(async (_store: string, revision: number) => ({ ...version, revision }));
  await mountSourceStudio(app);
  expect(app.querySelector('[data-review-note]')?.textContent).toBe('YAPI está puliendo tu tienda…');
  await vi.waitFor(() => expect(app.textContent).toContain('Pulí tu tienda: Agrandé el título.'), { timeout: 9000 });
  expect(app.querySelector('[data-review-note]')).toBeNull();
}, 15000);

// Final review (spec 2026-10-12): the chat job ends when the cards become choosable, so the canvas must show them while
// their heroes still draw, with no request running.
it('shows choosable cards whose heroes are still drawing after the request ended, and sends the pick', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'styleProposal').mockResolvedValue({ proposal: { generationId: 'g1', status: 'RUNNING', pickable: true, recommended: 0, cards: [0, 1].map(styleCard) } } as any);
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'ok' } } as any);
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(app.querySelectorAll('[data-style-card]')).toHaveLength(2));
  app.querySelector<HTMLButtonElement>('[data-style-card="0"]')!.click();
  app.querySelector<HTMLButtonElement>('[data-style-use="0"]')!.click();
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
  expect(sent.mock.calls[0].at(-1)).toEqual({ stylePick: { generationId: 'g1', index: 0 } });
});
