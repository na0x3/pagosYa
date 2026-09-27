// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codeTickerLines, highlightCodeLine, mountCodeTicker } from './source-code-ticker';

describe('the lines YAPI shows while it builds', () => {
  it('come from the store’s real source files, each file introduced by its path', () => {
    const lines = codeTickerLines({ files: [
      { path: 'components/home.tsx', content: 'export default function Home() {\n\n  return <main className="pa2">\n    <h1>Un respiro</h1>\n  </main>;\n}' },
      { path: 'assets/hero.jpg', content: 'AAAA', encoding: 'base64' },
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
    ] });
    expect(lines[0]).toBe('// components/home.tsx');
    expect(lines).toContain('  return <main className="pa2">');
    expect(lines).not.toContain('');
    expect(lines.join('\n')).not.toMatch(/AAAA|PAGOSYA_CONFIG/);
  });

  it('are written from the store’s own name and products before it has a site', () => {
    const text = codeTickerLines({ storeName: 'Zoka', items: [{ name: 'Clase de prueba', priceText: 'Bs 50' }, { name: 'Pack 8 clases', price: 320 }] }).join('\n');
    expect(text).toContain('"Zoka"');
    expect(text).toContain('"Clase de prueba"');
    expect(text).toContain('"Bs 50"');
    expect(text).toContain('"Pack 8 clases"');
  });

  it('colour code without ever turning store text into markup', () => {
    const html = highlightCodeLine('  <h1 className="hero">{"<img src=x onerror=alert(1)>"}</h1> // hola');
    expect(html).toContain('<span class="tk-tag">');
    expect(html).toContain('<span class="tk-com">');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('the ticker', () => {
  afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('types lines into a decorative editor panel and stops on destroy', () => {
    vi.useFakeTimers();
    const host = document.createElement('div'); document.body.append(host);
    const ticker = mountCodeTicker(host, ['// components/home.tsx', 'export default function Home() {', '  return <main />;', '}']);
    expect(host.querySelector('.code-ticker')!.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(4000);
    expect(host.querySelector('.code-ticker__file')!.textContent).toBe('components/home.tsx');
    expect(host.querySelector('code')!.textContent).toContain('export default function Home()');
    ticker.destroy();
    expect(host.querySelector('.code-ticker')).toBeNull();
  });

  it('shows the code still for people who reduce motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    const host = document.createElement('div'); document.body.append(host);
    mountCodeTicker(host, ['// styles/globals.css', '.pa2 { color: #2e2a26; }']);
    expect(host.querySelector('code')!.textContent).toContain('.pa2 { color: #2e2a26; }');
  });
});
