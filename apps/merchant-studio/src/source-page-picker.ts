import { previewPages } from './source-pages';
import { escapeHtml as escape, icon } from './studio-ui';
import './source-page-picker.css';

export function renderPagePicker(files: Array<{ path: string; content: string }>, selected: string, locked: boolean): string {
  const pages = previewPages(files);
  const group = (url: string) => ['index.html', 'product.html', 'checkout.html', 'colecciones.html', 'buscar.html'].includes(url) ? 'Tienda' : /^(acceso|cuenta)-/.test(url) ? 'Cuenta de cliente' : 'Información';
  return `<details class="source-page-menu"><summary aria-label="Elegir página de la vista previa">${icon('eye')}<span>${escape(pages.find(page => page.url === selected)?.label || 'Páginas')}</span><span class="source-menu-chevron" aria-hidden="true"></span></summary><div class="source-page-menu-panel"><header><strong>Páginas de tu tienda</strong><span>${pages.length}</span></header><nav aria-label="Página de la vista previa">${['Tienda', 'Información', 'Cuenta de cliente'].map(label => {
    const entries = pages.filter(page => group(page.url) === label);
    return entries.length ? `<section><h3>${label}</h3>${entries.map(page => `<button type="button" data-preview-page="${escape(page.url)}" ${page.url === selected ? 'aria-current="page"' : ''} ${locked ? 'disabled' : ''}><span>${escape(page.label)}</span>${page.url === selected ? icon('check') : ''}</button>`).join('')}</section>` : '';
  }).join('')}</nav><button type="button" class="source-page-manage" data-manage-pages ${locked ? 'disabled' : ''}>Administrar páginas ${icon('external')}</button></div></details>`;
}

export function bindPagePicker(root: HTMLElement, hooks: { select(page: string): void; manage(): void }): void {
  root.onclick = null;
  const menu = root.querySelector<HTMLDetailsElement>('.source-page-menu');
  if (!menu) return;
  const close = () => { menu.open = false; menu.querySelector('summary')?.focus(); };
  menu.querySelectorAll<HTMLButtonElement>('[data-preview-page]').forEach(button => button.addEventListener('click', () => {
    close(); hooks.select(button.dataset.previewPage!);
    root.querySelector<HTMLElement>('.source-page-menu summary')?.focus();
  }));
  menu.querySelector('[data-manage-pages]')?.addEventListener('click', () => { close(); hooks.manage(); });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  // Listener belongs to this render's root; no document listener survives a rerender.
  root.onclick = event => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  };
}
