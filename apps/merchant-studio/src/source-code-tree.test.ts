// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codeFileEditable, codeFileForPage, renderCodeTree } from './source-code-tree';

const files = [
  { path: 'storefront-framework.json', content: '{}' },
  { path: 'components/home.tsx', content: '' },
  { path: 'components/auth/login.tsx', content: '// @pagosya-page\n' },
  { path: 'components/account/orders.tsx', content: '// @pagosya-page\n' },
  { path: 'lib/ui.tsx', content: 'platform' },
  { path: 'config.js', content: 'config' },
  { path: 'assets/photo.png', content: 'aA==', encoding: 'base64' },
];

describe('store code browser', () => {
  it('shows nested pages and platform files and opens the selected page folder', () => {
    document.body.innerHTML = renderCodeTree(files, 'components/account/orders.tsx', false);
    expect(document.querySelector('[data-code-file="lib/ui.tsx"]')).not.toBeNull();
    expect(document.querySelector('[data-code-file="config.js"]')).not.toBeNull();
    const selected = document.querySelector('[data-code-file="components/account/orders.tsx"]')!;
    expect(selected.getAttribute('aria-current')).toBe('true');
    expect(selected.closest('details')!.open).toBe(true);
    expect(document.querySelector('[data-code-file="assets/photo.png"]')).not.toBeNull();
  });
  it('protects platform and binary files while preserving authored file editing', () => {
    expect(codeFileEditable(files, 'lib/ui.tsx')).toBe(false);
    expect(codeFileEditable(files, 'config.js')).toBe(false);
    expect(codeFileEditable(files, 'assets/photo.png')).toBe(false);
    expect(codeFileEditable(files, 'components/auth/login.tsx')).toBe(true);
  });
  it('opens the source of the selected preview page rather than always home', () => {
    expect(codeFileForPage(files, 'cuenta-pedidos.html')).toBe('components/account/orders.tsx');
    expect(codeFileForPage(files, 'acceso-ingresar.html')).toBe('components/auth/login.tsx');
  });
});
