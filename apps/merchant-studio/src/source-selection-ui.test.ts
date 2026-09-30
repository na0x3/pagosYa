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
let app: HTMLDivElement;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(SESSION_STORAGE_KEY, 'owner-session');
  app = document.createElement('div'); document.body.replaceChildren(app);
  vi.spyOn(MerchantStudioApi.prototype, 'listStores').mockResolvedValue([{ id: 's1', name: 'Café', slug: 'cafe' }] as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState').mockResolvedValue({ revision: 2, versions: [version], nextBefore: null });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation').mockResolvedValue({ messages: [] });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceCatalog').mockResolvedValue({ items: [] });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockResolvedValue(version);
  vi.spyOn(MerchantStudioApi.prototype, 'estimateSource').mockResolvedValue({ model: 'auto', reason: '', maxCredits: 50, estimate: { minCredits: 1, maxCredits: 2 } });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVisualFields').mockResolvedValue({ revision: 2, fields: [{ id: 'f1', path: 'x', label: 'Título', kind: 'text', value: 'Hola' }] });
  vi.mocked(checkSourceWebsite).mockResolvedValue([{ label: 'Escritorio y móvil', status: 'passed' as const }]);
});
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); app.remove(); });

const frame = () => app.querySelector<HTMLIFrameElement>('.source-frame-wrap iframe')!;
const post = (data: unknown, source: unknown = frame().contentWindow, origin = 'null') => window.dispatchEvent(new MessageEvent('message', { data, source: source as Window, origin }));
const select = (extra: Record<string, unknown> = {}) => post({ type: 'pagosya:source-select', kind: 'section', sectionId: 'hero', label: 'Hero', ...extra });
const chip = () => app.querySelector<HTMLElement>('[data-selection-chip]');
async function ready() {
  await mountSourceStudio(app);
  await vi.waitFor(() => expect(frame()).toBeTruthy());
  const toggle = app.querySelector<HTMLButtonElement>('#source-select-mode')!;
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  toggle.click();
  expect(app.querySelector('#source-select-mode')!.getAttribute('aria-pressed')).toBe('true');
}

it('shows a chip with the escaped label and removes it with the x, sending no selection afterwards', async () => {
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'ok' } } as any);
  await ready();
  select({ label: '<b>x</b>' });
  expect(chip()!.textContent).toContain('Sección: <b>x</b>');
  expect(chip()!.querySelector('b')).toBeNull();
  chip()!.querySelector<HTMLButtonElement>('button[aria-label="Quitar selección"]')!.click();
  expect(chip()).toBeNull();
  const field = app.querySelector<HTMLTextAreaElement>('#agent-command')!; field.value = 'hola'; field.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await vi.waitFor(() => expect(sent).toHaveBeenCalled());
  expect(sent.mock.calls[0][11]).toBeUndefined();
});

it('ignores selection messages from any other window', async () => {
  await ready();
  post({ type: 'pagosya:source-select', kind: 'section', sectionId: 'hero', label: 'Hero' }, window);
  expect(chip()).toBeNull();
});

it('shows a hint and no chip for a part pagosYa manages', async () => {
  await ready();
  post({ type: 'pagosya:source-select', kind: 'platform', sectionId: '', label: 'Carrito' });
  expect(chip()).toBeNull();
  expect(app.querySelector('[data-selection-hint]')!.textContent).toContain('administra pagosYa');
});

it('sends the selection with the message and clears the chip after a successful send', async () => {
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'USER', content: 'x' }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'ok' } } as any);
  await ready();
  select();
  const field = app.querySelector<HTMLTextAreaElement>('#agent-command')!; field.value = 'hazlo más grande'; field.dispatchEvent(new Event('input', { bubbles: true }));
  app.querySelector('[data-composer]')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await vi.waitFor(() => expect(sent).toHaveBeenCalled());
  expect(sent.mock.calls[0][11]).toEqual({ sectionId: 'hero' });
  await vi.waitFor(() => expect(chip()).toBeNull());
});

it('clears the chip when a new revision arrives', async () => {
  await ready();
  select();
  expect(chip()).toBeTruthy();
  app.querySelector<HTMLButtonElement>('#source-reload')!.click();
  await vi.waitFor(() => expect(chip()).toBeNull());
});

it('clears the chip when the selection is turned off or Escape is pressed in the preview', async () => {
  await ready();
  select();
  post({ type: 'pagosya:source-select', kind: 'section', sectionId: '', label: '' });
  expect(chip()).toBeNull();
  select();
  app.querySelector<HTMLButtonElement>('#source-select-mode')!.click();
  expect(chip()).toBeNull();
  expect(app.querySelector('#source-select-mode')!.getAttribute('aria-pressed')).toBe('false');
});

it('a quick action fills the message box without sending it', async () => {
  const sent = vi.spyOn(MerchantStudioApi.prototype, 'sendSourceMessage');
  await ready();
  select();
  app.querySelector<HTMLButtonElement>('[data-quick-action="move-up"]')!.click();
  expect(app.querySelector<HTMLTextAreaElement>('#agent-command')!.value).toBe('Mueve esta sección una posición hacia arriba.');
  expect(sent).not.toHaveBeenCalled();
});

it('offers Editar texto only when the clicked text matches exactly one text field', async () => {
  await ready();
  select({ text: 'Hola' });
  await vi.waitFor(() => expect(app.querySelector('[data-selection-edit-text]')).toBeTruthy());
  select({ text: 'Otro' });
  await vi.waitFor(() => expect(app.querySelector('[data-selection-edit-text]')).toBeNull());
});
