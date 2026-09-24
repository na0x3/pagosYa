import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { legacyAuthoredFile, validateLegacySources } from './source-legacy';
import { SourceValidationError } from './source-validation-error';

const file = (path: string, content: string) => ({ path, content });
const site = (js: string) => [file('index.html', '<h1>Casa</h1>'), file('site.js', js)];
const message = (files: Array<{ path: string; content: string }>) => {
  try { validateLegacySources(files as any); return ''; } catch (error) { return String((error as Error).message); }
};

describe('legacy source validation', () => {
  it('leaves a plain storefront alone', () => {
    expect(() => validateLegacySources([
      file('index.html', '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Casa</h1><img src="assets/pan.jpg" alt="Pan"><script src="config.js"></script><script src="site.js"></script></body></html>'),
      file('styles.css', 'body { color: #111 }'),
      file('site.js', 'document.querySelector("h1").addEventListener("click", () => { document.title = "Casa"; });'),
    ] as any)).not.toThrow();
  });

  it('accepts the kit pages it ships itself', () => {
    const pages = ['productos.html', 'coleccion.html', 'product.html', 'checkout.html'].map(path => file(path, readFileSync(kitPath(path), 'utf8')));
    expect(() => validateLegacySources(pages as any)).not.toThrow();
  });

  // Every primitive below turns a string into running code, which is what the
  // React validator already refuses in source-next.ts.
  it.each([
    ['eval', 'eval("alert(1)")'],
    ['window.eval', 'window.eval(payload)'],
    ['new Function', 'const f = new Function("return 1"); f();'],
    ['Function call', 'Function("return 1")()'],
    ['dynamic import', 'import("https://cdn.example.com/x.js")'],
    ['document.write', 'document.write("<b>hola</b>")'],
    ['importScripts', 'importScripts("other.js")'],
    ['string timer', 'setTimeout("steal()", 100)'],
  ])('refuses %s in an authored script', (_label, code) => {
    expect(message(site(code))).toMatch(/site\.js/);
  });

  it('reads inline scripts in a page with the same eyes', () => {
    expect(message([file('index.html', '<h1>Casa</h1><script>eval(location.hash.slice(1))</script>')])).toMatch(/index\.html/);
  });

  // The SEO layer writes JSON-LD into these pages; it is data, not a program.
  it('does not read a data block as a program', () => {
    expect(() => validateLegacySources([file('index.html', '<h1>Casa</h1><script type="application/ld+json">{"@type":"Store","name":"eval"}</script>')] as any)).not.toThrow();
    expect(message([file('index.html', '<h1>Casa</h1><script type="module">eval(1)</script>')])).toMatch(/index\.html/);
  });

  it('looks inside SVG and inside a template, where markup hides from a regex', () => {
    expect(message([file('index.html', '<svg><script>eval(1)</script></svg>')])).toMatch(/index\.html/);
    expect(message([file('index.html', '<template><img src="x" onerror="eval(1)"></template>')])).toMatch(/index\.html/);
    expect(message([file('index.html', '<template><base href="https://evil.example/"></template>')])).toMatch(/index\.html/);
  });

  it('allows a timer with a real function', () => {
    expect(() => validateLegacySources(site('setTimeout(() => close(), 100)') as any)).not.toThrow();
  });

  it.each(['<base href="https://evil.example/">', '<object data="x.swf"></object>', '<embed src="x.swf">'])('refuses %s', markup => {
    expect(message([file('index.html', `<h1>Casa</h1>${markup}`)])).toMatch(/index\.html/);
  });

  it('allows a map iframe and refuses any other frame', () => {
    expect(() => validateLegacySources([file('index.html', '<h1>Casa</h1><iframe src="https://www.openstreetmap.org/export/embed.html" title="Mapa"></iframe>')] as any)).not.toThrow();
    expect(message([file('index.html', '<h1>Casa</h1><iframe src="https://evil.example/frame"></iframe>')])).toMatch(/index\.html/);
    expect(message([file('index.html', '<h1>Casa</h1><iframe srcdoc="<script>steal()</script>"></iframe>')])).toMatch(/index\.html/);
  });

  it('refuses a script or a stylesheet loaded from somewhere else', () => {
    expect(message([file('index.html', '<h1>Casa</h1><script src="https://cdn.example.com/a.js"></script>')])).toMatch(/cdn\.example\.com/);
    expect(message([file('index.html', '<h1>Casa</h1><script src="//cdn.example.com/a.js"></script>')])).toMatch(/cdn\.example\.com/);
    expect(message([file('index.html', '<h1>Casa</h1><link rel="stylesheet" href="https://fonts.example.com/f.css">')])).toMatch(/fonts\.example\.com/);
  });

  it('refuses a javascript: destination however it is spelled', () => {
    expect(message([file('index.html', '<a href="javascript:steal()">Ver</a>')])).toMatch(/index\.html/);
    expect(message([file('index.html', '<a href="  JaVaScRiPt:steal()">Ver</a>')])).toMatch(/index\.html/);
  });

  it('refuses an @import in authored CSS', () => {
    expect(message([file('styles.css', '@import url("https://fonts.example.com/f.css");\nbody { color: #111 }')])).toMatch(/styles\.css/);
  });

  // commerce.js, privacy.js and retention.js are replaced with the installed kit
  // on every render (source-runtime.ts), so their stored bytes are not a surface.
  it('does not judge the platform runtime files', () => {
    for (const path of ['commerce.js', 'privacy.js', 'retention.js', 'video.js', 'motion.js', 'config.js']) {
      expect(legacyAuthoredFile(path)).toBe(false);
      expect(() => validateLegacySources([file(path, 'eval("platform")')] as any)).not.toThrow();
    }
  });

  it('ignores compiled output and binary assets', () => {
    expect(legacyAuthoredFile('_compiled/home.js')).toBe(false);
    expect(() => validateLegacySources([{ path: 'assets/logo.png', content: 'eval', encoding: 'base64' }] as any)).not.toThrow();
  });

  it('keeps the repair detail in English and the merchant copy in Spanish', () => {
    const thrown = (() => { try { validateLegacySources(site('eval("x")') as any); return null; } catch (error) { return error as SourceValidationError; } })();
    expect(thrown).toBeInstanceOf(SourceValidationError);
    expect(thrown!.diagnostic).toMatch(/compiles a string into running code/);
    expect(thrown!.message).toBe('site.js: no uses eval().');
    expect(thrown!.message).not.toMatch(/compiles|running code/);
  });

  it('names several problems at once so one save fixes them all', () => {
    const reported = message([file('index.html', '<h1>Casa</h1><base href="/"><embed src="x.swf">'), file('site.js', 'eval(1)')]);
    expect(reported).toMatch(/index\.html/);
    expect(reported).toMatch(/site\.js/);
  });

  it('never fails a page it cannot parse as a whole document', () => {
    expect(() => validateLegacySources([file('index.html', '<h1>Casa<')] as any)).not.toThrow();
  });
});
