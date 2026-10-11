import { sanitizeHeroHtml, templateHero, heroFontFaces, writeStyleHero, type HeroFacts } from './style-hero';
import { SourceRequestBudget } from '../source-request-budget';

const facts: HeroFacts = { storeName: 'Café Buna', photoPath: 'assets/photo-1.webp', headline: 'Café de altura, tostado aquí', line: 'Granos de Caranavi.', action: 'Ver productos', palette: { paper: '#ffffff', ink: '#161616', accent: '#8f1d14', accent2: '#f4efe9' }, fonts: { display: 'outfit', text: 'outfit' }, mode: 'calm' };
afterEach(() => jest.restoreAllMocks());

it('strips scripts, handlers, javascript: links and foreign URLs, and keeps the layout', () => {
  const html = sanitizeHeroHtml('<style>@import url(https://x.y/a.css); .h{background:url(https://evil.test/a.png)} .p{background:url(assets/photo-1.webp)}</style><header data-store-name onclick="x()">Café</header><a href="javascript:alert(1)">Ver</a><script>alert(1)</script><iframe src="x"></iframe><img src="assets/photo-1.webp" onerror="x()">');
  expect(html).not.toMatch(/<script|onclick|onerror|javascript:|<iframe|@import|evil\.test/i);
  expect(html).toContain('url(assets/photo-1.webp)');
  expect(html).toContain('src="assets/photo-1.webp"');
  expect(html).toContain('data-store-name');
});

it('handles scripts with attributes, uppercase tags, unquoted and slash-separated handlers, and rebuilt tags', () => {
  const html = sanitizeHeroHtml('<div data-store-name>x</div><script src=//evil.test/a.js type="module">alert(1)</script ><SCRIPT>alert(2)</SCRIPT><IMG SRC=assets/a.png ONERROR=alert(3)><img/onerror=alert(4) src="assets/a.png"><a HREF=javascript:alert(5)>a</a><scr<script>ipt>alert(6)</scr</script>ipt><svg onload=alert(7)></svg>')!;
  expect(html).not.toMatch(/<script|<\/script|alert|onerror|onload|javascript:|evil\.test/i);
  expect(html).toContain('data-store-name');
});

it('drops srcset and other URL attributes that point outside the local assets', () => {
  const html = sanitizeHeroHtml('<div data-store-name></div><img src="assets/a.png" srcset="assets/a.png 1x, https://evil.test/b.png 2x"><img srcset="assets/a.png 1x, assets/b.png 2x"><img src=https://evil.test/c.png><video poster="https://evil.test/p.png"></video><button formaction="https://evil.test/f">x</button><div style="background:image-set(\'https://evil.test/i.png\' 1x)"></div>')!;
  expect(html).not.toMatch(/evil\.test/);
  expect(html).toContain('srcset="assets/a.png 1x, assets/b.png 2x"');
});

it('checks an attribute glued to a kept one', () => {
  const html = sanitizeHeroHtml('<div data-store-name></div><a src="assets/a.png"href="javascript:alert(1)">Ver</a><a src=\'assets/a.png\'href=\'javascript:alert(1)\'></a><img src="assets/a.png"srcset="https://evil.test/b.png 2x"><a href="page.html"ping="https://evil.test/p"></a><b onclick="a"onfocus=x>t</b>')!;
  expect(html).not.toMatch(/javascript|evil\.test|onfocus|onclick|ping/i);
});

it('sanitises pathological 40 KB inputs in under 200 ms', () => {
  for (const unit of ['url(', 'image-set(', '<script', '<style>', '<div style="', '<a href="', '<set ', 'url("']) {
    const started = Date.now();
    sanitizeHeroHtml(unit.repeat(Math.ceil(39_000 / unit.length)));
    expect(Date.now() - started).toBeLessThan(200);
  }
});

it('fails closed on CSS that can hide an external fetch', () => {
  const wrap = (css: string) => `<div data-store-name></div><style>${css}</style>`;
  for (const bad of [wrap('.a{background:\\75 rl(https://evil.test/a.png)}'), wrap('@\\69mport "https://evil.test/a.css";'), wrap('.a{background:url("https://evil.test/a)b.png")}'), '<div data-store-name></div><style>.a{background:url(https://evil.test/a.png}', '<div data-store-name><p>//evil.test/x</p></div>']) expect(sanitizeHeroHtml(bad)).toBeNull();
  expect(sanitizeHeroHtml('<div data-store-name><a href="//evil.test/x">a</a></div>')).not.toMatch(/evil/);
  expect(sanitizeHeroHtml('<div data-store-name><svg xmlns="http://www.w3.org/2000/svg"></svg></div>')).not.toBeNull();
});

it('removes SVG animation elements that can set an href', () => {
  const html = sanitizeHeroHtml('<div data-store-name></div><svg><a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="href" to="javascript:alert(2)"/><animateMotion/><animateTransform/></a></svg>')!;
  expect(html).not.toMatch(/animate|<set|javascript/i);
});

it('rejects hostile palette values in the template hero', () => {
  const html = templateHero({ ...facts, palette: { paper: 'red;}</style><script>x()</script>', ink: 'url(https://evil.test)', accent: '#12345', accent2: '#ABCDEF' } });
  expect(html).not.toMatch(/evil|<script/);
  expect(html).toContain('#ffffff');
  expect(html).toContain('#111111');
  expect(sanitizeHeroHtml(html)).not.toBeNull();
});

it('fails closed on entity- and escape-encoded fetches in SVG and attributes', () => {
  for (const bad of ['<svg><style>.a{background:&#117;rl(&#47;&#47;evil.test/a.png)}</style></svg><div class="a">', '<svg><style>.b{background:&#92;75 rl(&#92;2f&#92;2f evil.test/b.png)}</style></svg>', '<svg><style>&#64;import "&#47;&#47;evil.test/x.css";</style></svg>', '<svg><rect cursor="\\75 rl(\\68 ttps://evil.test/c.png),auto"/></svg>', '<svg><rect mask="&#117;rl(&#47;&#47;evil.test/m.svg#m)"/></svg>', '<svg><rect fill="&#117;rl(&#47;&#47;evil.test/f.svg#g)"/></svg>']) {
    const html = sanitizeHeroHtml('<div data-store-name></div>' + bad);
    expect(html === null || !/evil|url\(|import/i.test(html)).toBe(true);
  }
});

it('drops encoded style attributes', () => {
  const html = sanitizeHeroHtml('<div data-store-name style="background:&#117;rl(https://evil.test/a.png)" class="a"></div><p style="background:\\75rl(x)">t</p>')!;
  expect(html).not.toMatch(/style|evil/);
});

it('rejects unclosed style tags quickly', () => {
  for (const unit of ['<style', '<style x', '<div>']) {
    const started = Date.now();
    sanitizeHeroHtml(unit.repeat(Math.ceil(39_000 / unit.length)));
    expect(Date.now() - started).toBeLessThan(200);
  }
});

it('survives parse/serialise mutation probes (math, raw-text elements, namespace confusion)', () => {
  const probes = [
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<math><mtext><table><mglyph><style><img src="&#47;&#47;evil.test/m2.png">',
    '<math><mtext><table><mglyph><style><div style="background:url(&#47;&#47;evil.test/m3.png)">x</div>',
    '<math><mtext><table><mglyph><style><embed src="&#47;&#47;evil.test/m4">',
    '<math><mtext><table><malignmark><style><img src=x onerror=alert(5)>',
    '<math><mi><table><mglyph><style><img src=x onerror=alert(6)>',
    '<math><mtext><table><mglyph><xmp><img src=x onerror=alert(7)>',
    '<math><mtext><table><mglyph><noembed><img src=x onerror=alert(8)>',
    '<math><mtext><table><mglyph><style><img src="h&#116;tps:&#47;&#47;evil.test/m9.png">',
    '<math><mtext><table><mglyph><noframes><img src=x onerror=alert(10)>',
    '<math><mtext><table><mglyph><style><meta http-equiv="refresh" content="0;url=&#47;&#47;evil.test/m11">',
    '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
    '<svg><style>&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></svg>',
    '<svg><style><![CDATA[</style><img src=x onerror=alert(1)>]]></style></svg>',
    '<math><style><img src=x onerror=alert(1)></style></math>',
    '<noembed><img src=x onerror=alert(1)></noembed>',
    '<math><mi><xmp>&lt;/xmp&gt;&lt;img src=x onerror=alert(1)&gt;</xmp></mi></math>',
    '<svg><svg><style>.a{fill:red}</style></svg><desc><style><img src=x onerror=alert(1)></style></desc></svg>',
    '<svg><title><style><img src=x onerror=alert(1)></style></title></svg>',
    '<table><style><img src=x onerror=alert(1)></style></table>',
    '<select><style><img src=x onerror=alert(1)></style></select>',
    '<svg><annotation-xml encoding="text/html"><style><img src=x onerror=alert(1)></style></annotation-xml></svg>',
    '<math><annotation-xml encoding="text/html"><style><img src=x onerror=alert(1)></style></annotation-xml></math>',
    '<math><mtext><table><mglyph><svg><mtext><style><path id="</style><img onerror=alert(1) src>">',
    '<plaintext><img src=x onerror=alert(1)>',
    '<applet code="x"></applet><noframes><img src=x onerror=alert(1)></noframes>',
  ];
  for (const probe of probes) {
    const html = sanitizeHeroHtml('<div data-store-name></div>' + probe);
    expect(html === null || !/onerror|alert|evil|<math|<xmp|<noembed|<noframes|<plaintext/i.test(html)).toBe(true);
  }
  const ok = sanitizeHeroHtml(templateHero(facts))!;
  expect(sanitizeHeroHtml(ok)).toBe(ok);
});

it('rejects empty, oversized or nameless answers', () => {
  expect(sanitizeHeroHtml('')).toBeNull();
  expect(sanitizeHeroHtml('<div data-store-name>' + 'x'.repeat(60_000) + '</div>')).toBeNull();
  expect(sanitizeHeroHtml('<div>Café</div>')).toBeNull();
});

it('builds a template hero in the concept fonts and colours, with or without a photo', () => {
  const html = templateHero(facts);
  expect(html).toContain('assets/outfit.ttf');
  expect(html).toContain('#8f1d14');
  expect(html).toContain('Café Buna');
  expect(html).toContain('assets/photo-1.webp');
  expect(templateHero({ ...facts, photoPath: undefined })).not.toContain('<img class="th-photo"');
  expect(templateHero({ ...facts, storeName: '<b>x</b>' })).not.toContain('<b>x</b>');
  expect(sanitizeHeroHtml(templateHero(facts))).not.toBeNull();
});

it('declares each font once with self-hosted files', () => {
  expect(heroFontFaces({ display: 'outfit', text: 'outfit' }).match(/@font-face/g)).toHaveLength(1);
  expect(heroFontFaces({ display: 'young-serif', text: 'instrument' })).toContain('assets/young-serif.ttf');
});

it('falls back to the template hero when the call fails or returns unusable HTML', async () => {
  const base = { facts, concept: { name: 'x' } as any, direction: 'CONCEPT 1 of 4', model: 'gpt-5.6-terra' as const, provider: { endpoint: 'https://api.openai.com/v1/responses', name: 'OpenAI' }, apiKey: 'k', budget: new SourceRequestBudget(200), signal: new AbortController().signal };
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ html: '' }) }] }] })));
  expect((await writeStyleHero({ ...base, attempts: [] })).source).toBe('template');
  jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('down'));
  const attempts: any[] = [];
  expect((await writeStyleHero({ ...base, attempts })).source).toBe('template');
  expect(attempts[0]).toMatchObject({ status: 'FAILED', failureReason: expect.any(String) });
});

it('keeps a usable model hero', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ html: '<header><span data-store-name>Café Buna</span></header><section><h1>Hola</h1></section>' }) }] }] })));
  const out = await writeStyleHero({ facts, concept: { name: 'x' } as any, direction: 'd', model: 'gpt-5.6-terra', provider: { endpoint: 'https://api.openai.com/v1/responses', name: 'OpenAI' }, apiKey: 'k', budget: new SourceRequestBudget(200), signal: new AbortController().signal, attempts: [] });
  expect(out).toEqual({ html: expect.stringContaining('<h1>Hola</h1>'), source: 'model' });
});

it('records every hero call for metering, on success and on the template fallback', async () => {
  const base = { facts, concept: { name: 'x' } as any, direction: 'd', model: 'gpt-5.6-terra' as const, provider: { endpoint: 'https://api.openai.com/v1/responses', name: 'OpenAI' }, apiKey: 'k', budget: new SourceRequestBudget(200), signal: new AbortController().signal, attempts: [] };
  const ok = { status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ html: '<header><span data-store-name>Café Buna</span></header><section><h1>Hola</h1></section>' }) }] }] };
  const record = jest.fn().mockResolvedValue(undefined);
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(ok)));
  expect((await writeStyleHero({ ...base, record })).source).toBe('model');
  expect(record).toHaveBeenLastCalledWith(ok, expect.objectContaining({ status: 'COMPLETED', durationMs: expect.any(Number) }));
  jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('down'));
  expect((await writeStyleHero({ ...base, record })).source).toBe('template');
  expect(record).toHaveBeenLastCalledWith(null, expect.objectContaining({ status: 'FAILED' }));
  // A metering failure never costs the merchant the card.
  record.mockRejectedValueOnce(new Error('metering down'));
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(ok)));
  expect((await writeStyleHero({ ...base, record })).source).toBe('model');
  expect(record).toHaveBeenCalledTimes(3);
});
