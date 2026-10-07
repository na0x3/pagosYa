// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountSettingsShell, SETTINGS_GROUPS, type SettingsSection } from './settings-shell';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

/** An opener like the real panels: it appends its own <dialog> to the host it is given. */
function opener(label: string, delay = 0) {
  return vi.fn(async (section: SettingsSection, host: HTMLElement) => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const panel = document.createElement('dialog');
    panel.setAttribute('open', ''); panel.textContent = `${label}:${section}`;
    host.append(panel);
  });
}
const shell = (options: Partial<Parameters<typeof mountSettingsShell>[1]> = {}) => {
  const open = options.open ?? opener('panel');
  const onClose = options.onClose ?? vi.fn();
  const api = mountSettingsShell(document.body, { initial: 'brand', open, onClose });
  return { api, open, onClose, dialog: () => document.body.querySelector('dialog.settings-shell') as HTMLDialogElement, host: () => document.body.querySelector('[data-settings-host]') as HTMLElement };
};
const item = (section: string) => document.body.querySelector(`[data-settings-section="${section}"]`) as HTMLButtonElement;

it('shows a labelled rail with the store\'s settings sections in a group', () => {
  shell();
  const nav = document.body.querySelector('nav[aria-label]')!;
  expect(nav.textContent).toContain('Tienda');
  expect([...nav.querySelectorAll('[data-settings-section]')].map(button => (button as HTMLElement).dataset.settingsSection)).toEqual(SETTINGS_GROUPS.flatMap(group => group.items.map(entry => entry.id)));
  expect(SETTINGS_GROUPS.flatMap(group => group.items.map(entry => entry.id))).toEqual(['brand', 'shipping', 'domain']);
});

it('opens the initial section into the content area and marks it as current', async () => {
  const { open, host } = shell();
  await vi.waitFor(() => expect(host().textContent).toContain('panel:brand'));
  expect(open).toHaveBeenCalledWith('brand', expect.any(HTMLElement));
  expect(item('brand').getAttribute('aria-current')).toBe('page');
  expect(item('domain').hasAttribute('aria-current')).toBe(false);
  expect(document.body.querySelector('h2')!.textContent).toBe('Marca');
});

it('switching sections replaces the panel and the heading', async () => {
  const { host } = shell();
  await vi.waitFor(() => expect(host().textContent).toContain('panel:brand'));
  item('domain').click();
  await vi.waitFor(() => expect(host().textContent).toContain('panel:domain'));
  expect(host().textContent).not.toContain('panel:brand');
  expect(item('domain').getAttribute('aria-current')).toBe('page');
  expect(item('brand').hasAttribute('aria-current')).toBe(false);
  expect(document.body.querySelector('h2')!.textContent).toBe('Dominios');
});

it('ignores a slow panel that finishes after the merchant already moved on', async () => {
  const slow = vi.fn(async (section: SettingsSection, host: HTMLElement) => {
    if (section === 'brand') await new Promise(resolve => setTimeout(resolve, 30));
    const panel = document.createElement('dialog'); panel.setAttribute('open', ''); panel.textContent = `panel:${section}`; host.append(panel);
  });
  const { host } = shell({ open: slow });
  item('shipping').click();
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(host().textContent).toContain('panel:shipping');
  expect(host().textContent).not.toContain('panel:brand');
});

it('reloads the section when its panel closes itself, for example after saving', async () => {
  const { open, host } = shell();
  await vi.waitFor(() => expect(host().querySelector('dialog')).not.toBeNull());
  host().querySelector('dialog')!.remove();
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(host().querySelector('dialog')).not.toBeNull());
});

it('does not loop when a panel never shows anything', async () => {
  const empty = vi.fn(async () => {});
  shell({ open: empty });
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(empty).toHaveBeenCalledTimes(1);
});

it('says so when a panel fails to open', async () => {
  const broken = vi.fn(async () => { throw new Error('Sin conexión'); });
  const { host } = shell({ open: broken });
  await vi.waitFor(() => expect(host().querySelector('[role="alert"]')!.textContent).toContain('Sin conexión'));
});

it('closes once from the close button and once from the native close event', () => {
  const onClose = vi.fn();
  const { dialog } = shell({ onClose });
  (document.body.querySelector('[data-settings-close]') as HTMLButtonElement).click();
  expect(onClose).toHaveBeenCalledTimes(1);
  dialog().dispatchEvent(new Event('close'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('inline, it draws only the section into the page: no window, rail, close button or repeated title', async () => {
  const open = opener('panel');
  mountSettingsShell(document.body, { initial: 'domain', open, onClose: vi.fn(), inline: true });
  const host = document.body.querySelector('[data-settings-host]') as HTMLElement;
  await vi.waitFor(() => expect(host.textContent).toContain('panel:domain'));
  expect(document.body.querySelector('dialog.settings-shell')).toBeNull();
  expect(document.body.querySelector('.settings-shell__rail, [data-settings-close], h2')).toBeNull();
  // The tab names the section; the page keeps only the one-line description under it.
  expect(document.body.querySelector('.settings-shell--inline')!.textContent).toContain('Compra un nombre para tu tienda');
});

it('inline, a panel that closes itself after saving comes back fresh', async () => {
  const open = opener('panel');
  mountSettingsShell(document.body, { initial: 'brand', open, onClose: vi.fn(), inline: true });
  const host = document.body.querySelector('[data-settings-host]') as HTMLElement;
  await vi.waitFor(() => expect(host.querySelector('dialog')).not.toBeNull());
  host.querySelector('dialog')!.remove();
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
});
