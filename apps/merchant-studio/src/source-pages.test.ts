// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canAddStandardPages, listStorePages, openPagesPanel, previewPages } from './source-pages';

const file = (path: string, content = 'x') => ({ path, content });
const PAGE = '// @pagosya-page\nexport default function P() { return null; }';
const SHELL = "export function Footer() { return <footer><p>Pie</p></footer>; }\nexport default function Shell() { return null; }";
const base = [file('components/home.tsx'), file('components/product.tsx'), file('components/checkout.tsx'), file('components/Shell.tsx', SHELL)];

afterEach(() => { document.body.innerHTML = ''; });

describe('listStorePages', () => {
  it('lists the commerce pages, the standard pages and hand-made pages, each with its address and file', () => {
    const pages = listStorePages([...base, file('components/pages/faq.tsx', PAGE), file('components/catalog/search.tsx', PAGE), file('components/page-historia.tsx')]);
    expect(pages.map(page => page.file)).toEqual(['components/home.tsx', 'components/product.tsx', 'components/checkout.tsx', 'components/pages/faq.tsx', 'components/catalog/search.tsx', 'components/page-historia.tsx']);
    expect(pages[0]).toMatchObject({ label: 'Inicio', url: 'index.html' });
    expect(pages[3]).toMatchObject({ label: 'Preguntas frecuentes', url: 'faq.html', standard: true });
    expect(pages[4]).toMatchObject({ label: 'Búsqueda', url: 'buscar.html' });
    expect(pages[5]).toMatchObject({ label: 'Historia', url: 'historia.html', standard: false });
  });

  it('ignores shared components that only live in a page folder, and files that are not React source', () => {
    const pages = listStorePages([...base, file('components/pages/Hero.tsx', PAGE), file('components/account/row.tsx', 'export default function R() { return null; }'), file('styles/globals.css', 'body{}'), file('index.html', '<html>')]);
    expect(pages.map(page => page.file)).toEqual(['components/home.tsx', 'components/product.tsx', 'components/checkout.tsx']);
  });
});

describe('canAddStandardPages', () => {
  it('is true for a store with a Shell and no standard pages yet', () => {
    expect(canAddStandardPages(base)).toBe(true);
  });
  it('is false once the pages and the footer slot are there, and without a Shell', () => {
    const withPages = [...base.filter(f => f.path !== 'components/Shell.tsx'), file('components/Shell.tsx', SHELL.replace('</footer>', '<nav data-pagosya-pages /></footer>')), ...['about', 'contact', 'shipping', 'faq', 'refund-policy', 'privacy', 'terms', 'cookies', 'not-found'].map(name => file(`components/pages/${name}.tsx`, PAGE)), file('components/catalog/collections.tsx', PAGE), file('components/catalog/search.tsx', PAGE), ...['auth/login', 'auth/register', 'auth/forgot-password', 'auth/reset-password', 'account/orders', 'account/addresses', 'account/profile', 'account/subscriptions'].map(key => file(`components/${key}.tsx`, PAGE))];
    expect(canAddStandardPages(withPages)).toBe(false);
    expect(canAddStandardPages([file('components/home.tsx')])).toBe(false);
  });
});

describe('openPagesPanel', () => {
  const version = (files = base) => ({ revision: 3, snapshot: { files } }) as never;
  const api = (result: unknown = { revision: 4 }) => ({ addStandardPages: vi.fn(async () => result) }) as never;

  it('shows every page and asks YAPI to change the chosen one', async () => {
    const onAsk = vi.fn();
    await openPagesPanel(api(), 's1', version([...base, file('components/pages/faq.tsx', PAGE)]), { onAsk, onAdded: vi.fn() });
    const dialog = document.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Preguntas frecuentes');
    expect(dialog.textContent).toContain('faq.html');
    (dialog.querySelector('[data-ask-page="components/pages/faq.tsx"]') as HTMLButtonElement).click();
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0][0]).toContain('Preguntas frecuentes');
    expect(onAsk.mock.calls[0][0]).toContain('components/pages/faq.tsx');
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('offers to add the standard pages and reloads the studio when they were added', async () => {
    const add = api();
    const onAdded = vi.fn();
    await openPagesPanel(add, 's1', version(), { onAsk: vi.fn(), onAdded });
    (document.querySelector('[data-add-standard-pages]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect((add as any).addStandardPages).toHaveBeenCalledWith('s1', 3);
  });

  it('does not offer it when there is nothing to add, and shows the reason when adding fails', async () => {
    const full = [...base.filter(f => f.path !== 'components/Shell.tsx'), file('components/Shell.tsx', SHELL.replace('</footer>', '<nav data-pagosya-pages /></footer>')), ...['about', 'contact', 'shipping', 'faq', 'refund-policy', 'privacy', 'terms', 'cookies', 'not-found'].map(name => file(`components/pages/${name}.tsx`, PAGE)), file('components/catalog/collections.tsx', PAGE), file('components/catalog/search.tsx', PAGE), ...['auth/login', 'auth/register', 'auth/forgot-password', 'auth/reset-password', 'account/orders', 'account/addresses', 'account/profile', 'account/subscriptions'].map(key => file(`components/${key}.tsx`, PAGE))];
    await openPagesPanel(api(), 's1', version(full), { onAsk: vi.fn(), onAdded: vi.fn() });
    expect(document.querySelector('[data-add-standard-pages]')).toBeNull();
    document.body.innerHTML = '';
    const failing = { addStandardPages: vi.fn(async () => { throw new Error('Este sitio ya tiene las páginas estándar'); }) } as never;
    await openPagesPanel(failing, 's1', version(), { onAsk: vi.fn(), onAdded: vi.fn() });
    (document.querySelector('[data-add-standard-pages]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('ya tiene las páginas'));
  });

  it('escapes the names of hand-made pages', async () => {
    await openPagesPanel(api(), 's1', version([...base, file('components/page-a.tsx')]), { onAsk: vi.fn(), onAdded: vi.fn() });
    expect(document.querySelector('dialog img')).toBeNull();
  });
});

describe('previewPages', () => {
  it('names each address and puts the commerce pages first', () => {
    const files = ['zeta.html', 'nosotros.html', 'checkout.html', 'index.html', 'styles/x.css', 'product.html'].map(path => ({ path, content: '' }));
    expect(previewPages(files)).toEqual([
      { url: 'index.html', label: 'Inicio' }, { url: 'product.html', label: 'Producto' }, { url: 'checkout.html', label: 'Pago' },
      { url: 'nosotros.html', label: 'Nosotros' }, { url: 'zeta.html', label: 'Zeta' },
    ]);
  });
});

describe('account gate pages', () => {
  const gate = (path: string) => ({ path, content: '// @pagosya-page\nexport default function P() { return null; }\n' });
  it('are listed as standard pages with their address', () => {
    const pages = listStorePages([gate('components/auth/login.tsx'), gate('components/account/orders.tsx')]);
    expect(pages).toEqual([
      { file: 'components/auth/login.tsx', label: 'Ingresar', url: 'acceso-ingresar.html', standard: true },
      { file: 'components/account/orders.tsx', label: 'Mis pedidos', url: 'cuenta-pedidos.html', standard: true },
    ]);
  });
  it('are named in the preview picker', () => {
    expect(previewPages([{ path: 'acceso-ingresar.html', content: '' }, { path: 'cuenta-pedidos.html', content: '' }]).map(p => p.label).sort()).toEqual(['Ingresar', 'Mis pedidos']);
  });
  it('make "Agregar páginas estándar" available when only they are missing', () => {
    const shell = { path: 'components/Shell.tsx', content: 'export function Footer() { return <footer><nav data-pagosya-pages /></footer>; }\nexport default function Shell() { return null; }\n' };
    const existing = ['pages/about', 'pages/contact', 'pages/shipping', 'pages/faq', 'pages/refund-policy', 'pages/privacy', 'pages/terms', 'pages/cookies', 'pages/not-found', 'catalog/collections', 'catalog/search'].map(key => gate(`components/${key}.tsx`));
    expect(canAddStandardPages([shell, ...existing])).toBe(true);
  });
});
