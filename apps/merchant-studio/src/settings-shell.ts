import './settings-shell.css';
import { escapeHtml as escape } from './studio-ui';

export type SettingsSection = 'brand' | 'shipping' | 'domain';

/** The store settings window: one dialog with a rail of sections on the left and the chosen panel on the right.
 * Each panel is the Studio's existing one (brand, shipping, domain); it draws itself into the host it is given
 * instead of opening its own modal. Only sections that exist are listed. */
export const SETTINGS_GROUPS = [
  { label: 'Tienda', items: [
    { id: 'brand', label: 'Marca', title: 'Marca', description: 'La identidad que se usa en toda tu tienda.' },
    { id: 'shipping', label: 'Envíos y retiro', title: 'Envíos y retiro', description: 'Tarifas y puntos de retiro que se suman al pago.' },
    { id: 'domain', label: 'Dominio', title: 'Dominios', description: 'Compra un dominio o conecta uno que ya tengas.' },
  ] as const },
] as const;
const ITEMS = SETTINGS_GROUPS.flatMap(group => group.items);

export type SettingsShellOptions = {
  initial: SettingsSection;
  /** Draws the section's panel into `host` (a panel appends its own <dialog>). Rejects when it cannot load. */
  open: (section: SettingsSection, host: HTMLElement) => Promise<void>;
  onClose: () => void;
};

export function mountSettingsShell(app: HTMLElement, options: SettingsShellOptions): { select(section: SettingsSection): Promise<void>; close(): void } {
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-shell';
  dialog.setAttribute('aria-label', 'Ajustes de la tienda');
  dialog.innerHTML = `<aside class="settings-shell__rail"><p class="settings-shell__store">Ajustes</p><nav aria-label="Secciones de ajustes">${SETTINGS_GROUPS.map(group => `
    <p class="settings-shell__group">${escape(group.label)}</p>${group.items.map(item => `<button type="button" class="settings-shell__item" data-settings-section="${item.id}">${escape(item.label)}</button>`).join('')}`).join('')}</nav></aside>
    <div class="settings-shell__main" tabindex="-1" autofocus><button type="button" class="settings-shell__close" data-settings-close aria-label="Cerrar ajustes">×</button>
      <header class="settings-shell__head"><h2></h2><p></p></header><div class="settings-shell__host" data-settings-host></div></div>`;
  app.append(dialog);

  const host = dialog.querySelector<HTMLElement>('[data-settings-host]')!;
  const title = dialog.querySelector('h2')!, description = dialog.querySelector('.settings-shell__head p')!;
  let current: SettingsSection = options.initial, token = 0, finished = false, watcher: MutationObserver | null = null;

  const finish = () => { if (finished) return; finished = true; watcher?.disconnect(); options.onClose(); };
  const close = () => {
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    finish();
  };
  dialog.addEventListener('close', finish);
  dialog.querySelector('[data-settings-close]')!.addEventListener('click', close);
  dialog.querySelectorAll<HTMLButtonElement>('[data-settings-section]').forEach(button => button.addEventListener('click', () => void select(button.dataset.settingsSection as SettingsSection)));

  async function select(section: SettingsSection): Promise<void> {
    if (finished) return;
    const mine = ++token;
    current = section;
    watcher?.disconnect(); watcher = null;
    const entry = ITEMS.find(item => item.id === section)!;
    title.textContent = entry.title; description.textContent = entry.description;
    dialog.querySelectorAll<HTMLElement>('[data-settings-section]').forEach(button => {
      if (button.dataset.settingsSection === section) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    // A fresh container per selection: a slow panel that finishes after the merchant moved on draws into a detached one.
    const panel = document.createElement('div');
    panel.className = 'settings-shell__panel';
    host.replaceChildren(panel);
    try { await options.open(section, panel); }
    catch (error) {
      if (mine === token) panel.innerHTML = `<p role="alert" class="settings-shell__error">${escape(error instanceof Error ? error.message : 'No se pudo abrir esta sección.')}</p>`;
      return;
    }
    // A panel removes its own dialog when it finishes (for example after saving): show the section again, fresh.
    if (mine === token && panel.querySelector('dialog')) {
      watcher = new MutationObserver(() => { if (mine === token && !panel.querySelector('dialog')) { watcher?.disconnect(); void select(current); } });
      watcher.observe(panel, { childList: true });
    }
  }

  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  void select(options.initial);
  return { select, close };
}
