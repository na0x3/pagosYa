import { createRequire } from 'node:module';
import { join } from 'node:path';
import { nextStoreFiles } from './fixtures/next-store';
import { compileNextPreview, nextVendorScript } from './source-next';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');

// Every page used to carry its own copy of React, ReactDOM and motion (about 400 KB each); with nine information pages a
// store went over the 8 MiB source limit. They now share one vendor script that each page loads first.
jest.setTimeout(120_000);

describe('compiled pages share one vendor script', () => {
  it('builds the vendor script once per process, because every save, verify and screenshot compiles', async () => {
    const first = nextVendorScript();
    expect(nextVendorScript()).toBe(first);
    expect((await first).length).toBeGreaterThan(100_000);
  });

  it('compiles React, ReactDOM and motion once, and each page script stays small', async () => {
    const out = await compileNextPreview(nextStoreFiles(), 'shop');
    const vendor = out.find(file => file.path === '_compiled/vendor.js');
    expect(vendor).toBeDefined();
    expect(vendor!.content.length).toBeGreaterThan(100_000);
    const pages = out.filter(file => /^_compiled\/(?:home|product|checkout)\.js$/.test(file.path));
    expect(pages).toHaveLength(3);
    for (const page of pages) expect({ path: page.path, small: page.content.length < 150_000 }).toEqual({ path: page.path, small: true });
  });

  it('loads the vendor script before the page script, in a classic deferred script', async () => {
    const out = await compileNextPreview(nextStoreFiles(), 'shop');
    const html = out.find(file => file.path === 'index.html')!.content;
    expect(html).toMatch(/<script src="_compiled\/vendor\.js" defer><\/script><script src="_compiled\/home\.js" defer><\/script>/);
    expect(html).not.toContain('type="module"');
  });

  it('still draws the page in a browser when the vendor script and the page script run in order', async () => {
    const out = await compileNextPreview(nextStoreFiles(), 'shop');
    const code = (path: string) => out.find(file => file.path === path)!.content;
    const dom = new JSDOM('<html><body><div id="pagosya-react-root"></div></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    dom.window.eval(code('_compiled/vendor.js'));
    dom.window.eval(code('_compiled/home.js'));
    expect(dom.window.document.querySelector('#pagosya-react-root h1')).not.toBeNull();
    dom.window.close();
  });

  it('keeps a store with nine information pages well under the source size limit', async () => {
    const { CONTENT_PAGE_FILES } = await import('./source-content-pages');
    const out = await compileNextPreview([...nextStoreFiles(), { path: 'components/Shell.tsx', content: "import type { ReactNode } from 'react';\nexport default function Shell({ children }: { children: ReactNode }) { return <div>{children}</div>; }\n" }, ...CONTENT_PAGE_FILES], 'shop');
    const compiled = out.filter(file => file.path.startsWith('_compiled/')).reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
    expect(out.filter(file => file.path.startsWith('_compiled/pages/'))).toHaveLength(9);
    expect(compiled).toBeLessThan(2_200_000);
  });
});
