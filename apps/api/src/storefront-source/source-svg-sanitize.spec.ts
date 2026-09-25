import { MOTIF_SVG_MAX_BYTES, sanitizeMotifSvg } from './source-svg-sanitize';
import { LAMP_SVG } from './fixtures/motifs';

/** Sub-project 3, gate 5: a motif drawing is an allow-list SVG. Hostile input comes out clean or is dropped. */

const wrap = (inner: string, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${attrs}>${inner}<path d="M2 2h20"/></svg>`;
const UNSAFE = /<script|foreignObject|<image|<use|<a[\s>]|<style|\son\w+=|href|style=|javascript:|https?:|<set|<animate/i;

describe('sanitizeMotifSvg', () => {
  it('passes a legitimate lamp drawing byte-for-byte, local gradient references included', () => {
    expect(sanitizeMotifSvg(LAMP_SVG)).toEqual({ svg: LAMP_SVG, removed: [] });
  });

  it.each([
    ['a script element', wrap('<script>alert(1)</script>')],
    ['a script with CDATA', wrap('<script><![CDATA[alert(1)]]></script>')],
    ['foreignObject with HTML', wrap('<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></div></foreignObject>')],
    ['an event handler', wrap('<g onclick="alert(1)"><path d="M1 1h2"/></g>', ' onload="alert(1)"')],
    ['a javascript: link', wrap('<a href="javascript:alert(1)"><path d="M1 1h2"/></a>')],
    ['an xlink javascript: link', wrap('<a xlink:href="javascript:alert(1)"><path d="M1 1h2"/></a>')],
    ['an external image', wrap('<image href="https://evil.test/x.png" width="10" height="10"/>')],
    ['a use reference', wrap('<use href="https://evil.test/sprite.svg#a"/>')],
    ['a style element', wrap('<style>@import url(https://evil.test/x.css);path{fill:red}</style>')],
    ['a style attribute', wrap('<path style="fill:url(https://evil.test/a)" d="M1 1h2"/>')],
    ['an external paint server', wrap('<path fill="url(https://evil.test/p.svg#a)" d="M1 1h2"/>')],
    ['a data: paint server', wrap('<path mask="url(data:image/svg+xml,abc)" d="M1 1h2"/>')],
    ['an animation that sets a handler', wrap('<set attributeName="onmouseover" to="alert(1)"/><animate attributeName="href" to="javascript:alert(1)"/>')],
    ['a closing script tag inside a title', wrap('<title>&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>')],
    ['markup in an attribute value', wrap('<path class="&quot;&gt;&lt;script&gt;" d="M1 1h2"/>')],
    ['a comment and a processing instruction', '<?xml version="1.0"?><!-- x --><!DOCTYPE svg>' + wrap('<!-- <script>alert(1)</script> -->')],
  ])('removes %s and records it', (_label, input) => {
    const result = sanitizeMotifSvg(input);
    expect(result.svg).toBeDefined();
    // The namespace declaration is the one URL a drawing keeps.
    expect(result.svg!.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(UNSAFE);
    expect(result.svg).toContain('<path d="M2 2h20"/>');
    expect(result.svg!.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });

  it('records what it removed', () => {
    const result = sanitizeMotifSvg(wrap('<script>alert(1)</script><path onclick="x()" style="fill:red" d="M1 1h2"/>'));
    expect(result.removed).toEqual(expect.arrayContaining(['<script>', 'onclick', 'style']));
    // Text inside a title is kept only as escaped text.
    expect(sanitizeMotifSvg(wrap('<title>&lt;/script&gt;</title>')).svg).toContain('<title>&lt;/script&gt;</title>');
  });

  it('drops a drawing over the size cap, even when the excess is one huge path', () => {
    const huge = wrap(`<path d="M0 0${' l1 1'.repeat(1500)}"/>`);
    expect(Buffer.byteLength(huge)).toBeGreaterThan(MOTIF_SVG_MAX_BYTES);
    expect(sanitizeMotifSvg(huge)).toEqual({ removed: [], dropped: expect.stringMatching(/6 KB/) });
  });

  it('drops a drawing with nothing to draw, or that is not an SVG', () => {
    expect(sanitizeMotifSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><defs><clipPath id="c"><rect width="4" height="4"/></clipPath></defs><script>1</script></svg>').dropped).toMatch(/nothing to draw/);
    expect(sanitizeMotifSvg('<div><p>hola</p></div>').dropped).toMatch(/not an SVG/);
    expect(sanitizeMotifSvg('').dropped).toMatch(/not an SVG/);
  });

  it('requires a viewBox: derives it from numeric width and height, otherwise drops the drawing', () => {
    expect(sanitizeMotifSvg('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32px"><path d="M1 1h2"/></svg>').svg)
      .toBe('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32px" viewBox="0 0 48 32"><path d="M1 1h2"/></svg>');
    expect(sanitizeMotifSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100%"><path d="M1 1h2"/></svg>').dropped).toMatch(/viewBox/);
    expect(sanitizeMotifSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 10"><path d="M1 1h2"/></svg>').dropped).toMatch(/viewBox/);
  });

  it('keeps data-part only as a short label, and prefixes ids and their references when asked', () => {
    const result = sanitizeMotifSvg(wrap('<g data-part="light"><path d="M1 1h2"/></g><g data-part="x y&quot;"><path d="M1 1h2"/></g>'));
    expect(result.svg).toContain('<g data-part="light">');
    expect(result.svg).not.toContain('x y');
    const prefixed = sanitizeMotifSvg(LAMP_SVG, { idPrefix: 'lampara-' }).svg!;
    expect(prefixed).toContain('id="lampara-glow"');
    expect(prefixed).toContain('fill="url(#lampara-glow)"');
    // Idempotent: a second pass does not prefix again.
    expect(sanitizeMotifSvg(prefixed, { idPrefix: 'lampara-' }).svg).toBe(prefixed);
  });
});
