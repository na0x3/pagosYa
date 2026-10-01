import type { MerchantStudioApi, SourceVersion } from './api';
import { escapeHtml as escape } from './studio-ui';
import './brand-profile.css';
import './settings-shell.css';

/** The pages of the store being designed, and the way to ask YAPI to change one or to add the standard ones (sub-project 6 of
 * docs/superpowers/specs/2026-09-30-complete-store-pages-program.md). */
export type StorePage = { file: string; label: string; url: string; standard: boolean };

// Label and address of each standard page, keyed like the API's route table (`group/file`).
const STANDARD: Record<string, [string, string]> = {
  'auth/login': ['Ingresar', 'acceso-ingresar.html'], 'auth/register': ['Crear cuenta', 'acceso-registro.html'],
  'auth/forgot-password': ['Recuperar contraseña', 'acceso-olvide-mi-contrasena.html'], 'auth/reset-password': ['Nueva contraseña', 'acceso-restablecer-contrasena.html'],
  'account/orders': ['Mis pedidos', 'cuenta-pedidos.html'], 'account/addresses': ['Mis direcciones', 'cuenta-direcciones.html'],
  'account/profile': ['Mi perfil', 'cuenta-perfil.html'], 'account/subscriptions': ['Mis suscripciones', 'cuenta-suscripciones.html'],
  'pages/about': ['Nosotros', 'nosotros.html'], 'pages/contact': ['Contacto', 'contacto.html'], 'pages/shipping': ['Envíos y entregas', 'envios.html'],
  'pages/faq': ['Preguntas frecuentes', 'faq.html'], 'pages/refund-policy': ['Cambios y devoluciones', 'reembolsos.html'], 'pages/privacy': ['Privacidad', 'privacidad.html'],
  'pages/terms': ['Términos y condiciones', 'terminos.html'], 'pages/cookies': ['Cookies', 'cookies.html'], 'pages/not-found': ['Página no encontrada', '404.html'],
  'catalog/collections': ['Colecciones', 'colecciones.html'], 'catalog/search': ['Búsqueda', 'buscar.html'],
};
const STANDARD_FILES = Object.keys(STANDARD).map(key => `components/${key}.tsx`);
const MARK = /^\s*\/\/\s*@pagosya-page\b/;
const titleCase = (slug: string) => { const words = slug.replace(/-/g, ' '); return words.charAt(0).toUpperCase() + words.slice(1); };

type SourceFile = { path: string; content: string };

export function listStorePages(files: SourceFile[]): StorePage[] {
  const has = (path: string) => files.some(file => file.path === path);
  const pages: StorePage[] = [];
  if (has('components/home.tsx')) pages.push({ file: 'components/home.tsx', label: 'Inicio', url: 'index.html', standard: false });
  if (has('components/product.tsx')) pages.push({ file: 'components/product.tsx', label: 'Producto', url: 'product.html', standard: false });
  if (has('components/checkout.tsx')) pages.push({ file: 'components/checkout.tsx', label: 'Pago', url: 'checkout.html', standard: false });
  for (const file of files) {
    const match = /^components\/(pages|catalog|auth|account)\/([a-z][a-z0-9-]{0,47})\.tsx$/.exec(file.path);
    if (!match || !MARK.test(file.content)) continue;
    const known = STANDARD[`${match[1]}/${match[2]}`];
    pages.push({ file: file.path, label: known?.[0] ?? titleCase(match[2]), url: known?.[1] ?? `${match[2]}.html`, standard: true });
  }
  for (const file of files) {
    const match = /^components\/page-(?!index\.|product\.|checkout\.)([a-z][a-z0-9-]{0,47})\.tsx$/.exec(file.path);
    if (match) pages.push({ file: file.path, label: titleCase(match[1]), url: `${match[1]}.html`, standard: false });
  }
  return pages;
}

/** Every address the preview can open, named for the merchant; commerce pages first, then the rest alphabetically. */
export function previewPages(files: SourceFile[]): Array<{ url: string; label: string }> {
  const names = new Map<string, string>([['index.html', 'Inicio'], ['product.html', 'Producto'], ['checkout.html', 'Pago']]);
  for (const [label, url] of Object.values(STANDARD)) names.set(url, label);
  const order = ['index.html', 'product.html', 'checkout.html'];
  return files.map(file => file.path).filter(path => /^[a-z0-9-]+\.html$/.test(path))
    .map(url => ({ url, label: names.get(url) ?? titleCase(url.replace(/\.html$/, '')) }))
    .sort((a, b) => (order.indexOf(a.url) + 1 || 99) - (order.indexOf(b.url) + 1 || 99) || a.label.localeCompare(b.label));
}

/** True when the store has a Shell to host the standard pages and is missing some of them or their footer link. */
export function canAddStandardPages(files: SourceFile[]): boolean {
  const shell = files.find(file => file.path === 'components/Shell.tsx');
  if (!shell) return false;
  if (STANDARD_FILES.some(path => !files.some(file => file.path === path))) return true;
  const footer = shell.content.slice(Math.max(0, shell.content.indexOf('export function Footer')));
  return !shell.content.includes('data-pagosya-pages') && shell.content.includes('export function Footer') && (footer.match(/<\/footer>/g) ?? []).length === 1;
}

export async function openPagesPanel(api: MerchantStudioApi, storeId: string, version: SourceVersion, hooks: { onAsk(text: string): void; onAdded(): void }) {
  const files = version.snapshot.files as SourceFile[];
  const pages = listStorePages(files);
  const dialog = document.createElement('dialog');
  dialog.className = 'brand-dialog';
  dialog.setAttribute('aria-label', 'Páginas de tu tienda');
  const rows = pages.map(page => `<article class="settings-row"><div><strong>${escape(page.label)}</strong><p>${escape(page.url)}${page.standard ? ' · página estándar' : ''}</p></div><div class="settings-actions"><button type="button" class="button" data-ask-page="${escape(page.file)}">Pedir un cambio a YAPI</button></div></article>`).join('');
  const add = canAddStandardPages(files)
    ? `<section class="settings-card"><h3>Páginas estándar</h3><p>Agrega nosotros, contacto, envíos, preguntas frecuentes, reembolsos, privacidad, términos, cookies, colecciones y búsqueda, con lo que ya escribiste en Ajustes. Queda como una revisión nueva: no se publica hasta que la publiques.</p><button type="button" class="button button--publish" data-add-standard-pages>Agregar páginas estándar</button></section>`
    : '';
  dialog.innerHTML = `<header><h2>Páginas de tu tienda</h2><button class="button" type="button" data-close-pages>Cerrar</button></header>
    <section class="settings-card"><h3>Tus páginas</h3>${rows || '<p>Esta tienda aún no tiene páginas de React.</p>'}</section>${add}<p role="status" data-pages-status></p>`;
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  const close = () => { if (dialog.open && typeof dialog.close === 'function') dialog.close(); dialog.remove(); };
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.querySelector('[data-close-pages]')!.addEventListener('click', close);
  dialog.querySelectorAll<HTMLButtonElement>('[data-ask-page]').forEach(button => button.addEventListener('click', () => {
    const page = pages.find(entry => entry.file === button.dataset.askPage)!;
    close();
    hooks.onAsk(`En la página ${page.label} (${page.file}): `);
  }));
  const addButton = dialog.querySelector<HTMLButtonElement>('[data-add-standard-pages]');
  addButton?.addEventListener('click', async () => {
    const status = dialog.querySelector<HTMLElement>('[data-pages-status]')!;
    addButton.disabled = true; status.setAttribute('role', 'status'); status.textContent = 'Agregando las páginas…';
    try { await api.addStandardPages(storeId, version.revision); close(); hooks.onAdded(); }
    catch (error) { status.setAttribute('role', 'alert'); status.textContent = error instanceof Error ? error.message : 'No se pudieron agregar las páginas.'; addButton.disabled = false; }
  });
}
