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

describe('hero model', () => {
  const okBody = { status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ html: '<header><span data-store-name>Café Buna</span></header><section><h1>Hola</h1></section>' }) }] }] };
  const base = () => ({ facts, concept: { name: 'x' } as any, direction: 'd', model: 'gpt-5.6-terra' as const, heroModel: 'gpt-5.6-luna' as const, provider: { endpoint: 'https://api.openai.com/v1/responses', name: 'OpenAI' }, apiKey: 'k', budget: new SourceRequestBudget(200), signal: new AbortController().signal, attempts: [] as any[] });
  const sent = (fetchMock: jest.SpyInstance) => fetchMock.mock.calls.map(call => JSON.parse(call[1].body as string));

  it('writes the hero on the fast model with a 4000-token cap, low reasoning and a 120 s timeout, and meters that model', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    const record = jest.fn().mockResolvedValue(undefined);
    const input = { ...base(), record };
    expect((await writeStyleHero(input)).source).toBe('model');
    const [body] = sent(fetchMock);
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body.max_output_tokens).toBeLessThanOrEqual(4000);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(timeout).toHaveBeenCalledWith(120_000);
    expect(input.attempts).toEqual([expect.objectContaining({ model: 'gpt-5.6-luna', status: 'COMPLETED' })]);
    expect(record).toHaveBeenCalledWith(okBody, expect.objectContaining({ model: 'gpt-5.6-luna' }));
  });

  it('retries once on the run model when the provider rejects the fast model', async () => {
    const rejected = { error: { message: "The model 'gpt-5.6-luna' is not supported when using Codex with a ChatGPT account.", type: 'invalid_request_error' } };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(rejected), { status: 400 })).mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    const record = jest.fn().mockResolvedValue(undefined);
    const input = { ...base(), record };
    expect((await writeStyleHero(input)).source).toBe('model');
    expect(sent(fetchMock).map(body => body.model)).toEqual(['gpt-5.6-luna', 'gpt-5.6-terra']);
    expect(input.attempts.map(attempt => [attempt.model, attempt.status])).toEqual([['gpt-5.6-luna', 'FAILED'], ['gpt-5.6-terra', 'COMPLETED']]);
    expect(record.mock.calls.map(call => call[1].model)).toEqual(['gpt-5.6-luna', 'gpt-5.6-terra']);
  });

  it('retries a 404 unknown model only once, and falls back to the template when the run model also fails', async () => {
    const unknown = () => new Response(JSON.stringify({ error: { message: 'Unknown model: gpt-5.6-luna' } }), { status: 404 });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unknown()).mockResolvedValueOnce(unknown());
    expect((await writeStyleHero(base())).source).toBe('template');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a timeout, a server error or a 400 about something else', async () => {
    for (const response of [new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 500 }), new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'reasoning.effort'" } }), { status: 400 })]) {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      expect((await writeStyleHero(base())).source).toBe('template');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockRestore();
    }
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    expect((await writeStyleHero(base())).source).toBe('template');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the run model when no hero model is given', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    const { heroModel, ...input } = base();
    await writeStyleHero(input);
    expect(sent(fetchMock)[0].model).toBe('gpt-5.6-terra');
  });
});

describe('two cards: one calm, one intense (spec amendment "two cards")', () => {
  const okBody = { status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ html: '<header><span data-store-name>Tostadero Yungas</span></header><section><h1>Hola</h1></section>' }) }] }] };
  const bold: HeroFacts = { storeName: 'Tostadero Yungas', photoPath: 'assets/photo-1.webp', eyebrow: 'Café de los Yungas', headline: 'Café de altura', line: 'Tostado cada semana en La Paz.', action: 'Ver cafés', palette: { paper: '#f2b705', ink: '#111111', accent: '#e5371f', accent2: '#fff6d6' }, fonts: { display: 'bricolage', text: 'instrument' }, mode: 'bold' };
  const calm: HeroFacts = { ...facts, buttons: ['outline', 'split', 'pill'], radius: 'soft' };
  const base = (heroFacts: HeroFacts) => ({ facts: heroFacts, concept: { name: 'x' } as any, direction: 'CONCEPT 2 of 2 (bold', model: 'gpt-5.6-terra' as const, heroModel: 'gpt-5.6-luna' as const, provider: { endpoint: 'http://127.0.0.1:4319/v1/responses', name: 'ChatGPT plan' }, apiKey: 'k', budget: new SourceRequestBudget(200), signal: new AbortController().signal, attempts: [] as any[] });
  const sent = (fetchMock: jest.SpyInstance) => fetchMock.mock.calls.map(call => JSON.parse(call[1].body as string));
  const promptOf = (fetchMock: jest.SpyInstance) => sent(fetchMock)[0].input[0].content[0].text as string;
  afterEach(() => jest.useRealTimers());

  it('asks the intense card for every Yungas device, in its own palette and words', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    await writeStyleHero(base(bold));
    const prompt = promptOf(fetchMock);
    expect(prompt).toContain('This card is INTENSE');
    expect(prompt).toMatch(/HEADER \(required\):[^\n]*side rail[^\n]*rotated/);
    expect(prompt).toMatch(/PHOTO \(required\):[^\n]*thick frame[^\n]*rotated[^\n]*hard offset shadow/);
    expect(prompt).toMatch(/STAMP \(required\):[^\n]*<textPath href="#/);
    expect(prompt).toContain('TOSTADERO YUNGAS ·');
    expect(prompt).toMatch(/never invent/i);
    expect(prompt).toMatch(/HEADLINE \(required\):[^\n]*clamp\(64px[^\n]*140px\)[^\n]*line-height 0\.95 or less[^\n]*-0\.04em[^\n]*never break a word/);
    expect(prompt).toMatch(/EYEBROW \(required\):[^\n]*uppercase[^\n]*letter-spacing/);
    expect(prompt).toMatch(/BUTTON \(required\):[^\n]*(pill|block|split)[^\n]*arrow[^\n]*offset shadow[^\n]*#e5371f/);
    expect(prompt).toMatch(/COLOUR \(required\):[^\n]*colour field/);
    expect(prompt).not.toContain('This card is calm');
  });

  it('asks the intense card without a photo for a giant type collage on colour fields', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    await writeStyleHero(base({ ...bold, photoPath: undefined }));
    expect(promptOf(fetchMock)).toMatch(/PHOTO \(required\):[^\n]*no photo[^\n]*giant type collage/i);
  });

  it('asks the calm card for a professional page with a custom button from its family, never a default grey one', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    await writeStyleHero(base(calm));
    const prompt = promptOf(fetchMock);
    expect(prompt).toContain('This card is calm: a normal, professionally made website of this kind.');
    expect(prompt).toMatch(/custom button shape[^\n]*outline, split, pill[^\n]*soft radius[^\n]*never a default grey button/);
    expect(prompt).not.toContain('INTENSE');
  });

  it('writes the intense hero on the run model with 7000 tokens, 200 s and low reasoning; the calm one stays on the fast model', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(okBody))).mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    const boldInput = base(bold);
    expect((await writeStyleHero(boldInput)).source).toBe('model');
    await writeStyleHero(base(calm));
    const [boldBody, calmBody] = sent(fetchMock);
    expect([boldBody.model, boldBody.max_output_tokens, boldBody.reasoning]).toEqual(['gpt-5.6-terra', 7000, { effort: 'low' }]);
    expect(timeout.mock.calls.map(call => call[0])).toEqual([200_000, 120_000]);
    expect([calmBody.model, calmBody.reasoning]).toEqual(['gpt-5.6-luna', { effort: 'low' }]);
    expect(calmBody.max_output_tokens).toBeLessThanOrEqual(4000);
    expect(boldInput.attempts).toEqual([expect.objectContaining({ model: 'gpt-5.6-terra', status: 'COMPLETED' })]);
  });

  it('waits 3 s and retries the same hero call once when the ChatGPT plan rejects it', async () => {
    jest.useFakeTimers();
    const refusal = () => new Response(JSON.stringify({ error: { code: 'chatgpt_authentication_rejected' } }), { status: 401 });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(refusal()).mockResolvedValueOnce(new Response(JSON.stringify(okBody)));
    const input = base(bold);
    const out = writeStyleHero(input);
    await jest.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect((await out).source).toBe('model');
    expect(sent(fetchMock).map(body => body.model)).toEqual(['gpt-5.6-terra', 'gpt-5.6-terra']);
    expect(input.attempts.map(attempt => attempt.status)).toEqual(['FAILED', 'COMPLETED']);
    expect(input.attempts[0].failureReason).toContain('rechazó la autorización');
  });

  it('retries a rejected hero only once, and never an unusable answer', async () => {
    jest.useFakeTimers();
    const limit = () => new Response(JSON.stringify({ error: { code: 'rate_limited' } }), { status: 429 });
    let fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(limit()).mockResolvedValueOnce(limit());
    const out = writeStyleHero(base(bold));
    await jest.advanceTimersByTimeAsync(3000);
    expect((await out).source).toBe('template');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ ...okBody, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ html: '<div>sin nombre</div>' }) }] }] })));
    expect((await writeStyleHero(base(bold))).source).toBe('template');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps an inline SVG stamp: svg, defs, path, text and a textPath pointing at #id survive the sanitiser', () => {
    const stamp = '<div data-store-name>Tostadero Yungas</div><svg viewBox="0 0 200 200" class="stamp"><defs><path id="ring" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0"></path></defs><text font-size="17"><textPath href="#ring">TOSTADERO YUNGAS · LA PAZ ·</textPath></text></svg>';
    const html = sanitizeHeroHtml(stamp)!;
    for (const part of ['<svg', '<defs>', '<path id="ring"', '<text font-size="17">', '<textPath href="#ring">', 'TOSTADERO YUNGAS · LA PAZ ·']) expect(html).toContain(part);
    // Never an external target or a script, also inside the stamp.
    const hostile = sanitizeHeroHtml('<div data-store-name>x</div><svg><defs><path id="r" d="M0 0"></path></defs><text><textPath href="https://evil.test/x.svg#r" onclick="x()">x</textPath><script>alert(1)</script></text></svg>')!;
    expect(hostile).not.toMatch(/evil|onclick|<script|alert/);
    expect(hostile).toContain('<textPath href="#">');
  });

  it('draws the intense template like the reference store: rail with the rotated name, tilted framed photo, textPath stamp, giant headline and an arrow pill with an accent offset shadow', () => {
    const html = templateHero(bold);
    expect(html).toContain('class="ty-rail"');
    expect(html).toMatch(/\.ty-name\{[^}]*rotate\(/);
    expect(html).toMatch(/\.ty-frame\{[^}]*rotate\(-?\d/);
    expect(html).toMatch(/\.ty-frame\{[^}]*box-shadow:\d+px \d+px 0 #/);
    expect(html).toContain('assets/photo-1.webp');
    expect(html).toMatch(/<textPath href="#ty-ring"[^>]*>TOSTADERO YUNGAS · /);
    expect(html).toMatch(/\.ty h1\{[^}]*font-size:min\(140px,calc\(100cqi\/[\d.]+\)\)[^}]*line-height:0?\.9/);
    expect(html).toMatch(/\.ty-cta\{[^}]*border-radius:999px[^}]*box-shadow:6px 6px 0 #e5371f/);
    expect(html).toMatch(/<a class="ty-cta"[^>]*>[^<]*Ver cafés[^<]*<svg/);
    expect(html).toContain('class="ty-eyebrow"');
    expect(html).toContain('Café de los Yungas');
    const clean = sanitizeHeroHtml(html)!;
    expect(clean).not.toBeNull();
    expect(clean).toContain('<textPath href="#ty-ring"');
    expect(clean).toMatch(/rotate\(/);
  });

  it('draws the intense template without a photo as a giant type field, and escapes the store name in the stamp', () => {
    const html = templateHero({ ...bold, photoPath: undefined, storeName: 'Yungas <b>&</b>' });
    expect(html).not.toContain('<img class="ty-photo"');
    expect(html).toContain('class="ty-type"');
    expect(html).not.toContain('<b>&</b>');
    expect(html).toContain('YUNGAS &lt;B&gt;&amp;&lt;/B&gt; · ');
    expect(sanitizeHeroHtml(html)).not.toBeNull();
    expect(sanitizeHeroHtml(templateHero({ ...bold, palette: { paper: 'x', ink: 'y', accent: 'z', accent2: 'w' } }))).not.toBeNull();
  });

  /** The font-size the template gives `selector` in a box `width` px wide: min(cap, (width - inset) / divisor), in container units. */
  const sizeAt = (css: string, selector: RegExp, width: number) => {
    const match = css.match(selector);
    expect(match).not.toBeNull();
    const [, cap, inset, divisor] = match!;
    return Math.min(Number(cap), (width - Number(inset ?? 0)) / Number(divisor));
  };
  const H1 = /\.ty h1\{[^}]*font-size:min\((\d+)px,calc\((?:100cqi)()\/([\d.]+)\)\)/;
  const H1_PHONE = /@media \(max-width:640px\)\{[^@]*\.ty h1\{font-size:min\((\d+)px,calc\((?:100cqi)()\/([\d.]+)\)\)/;
  const TYPE = /\.ty-type\{[^}]*font-size:min\((\d+)px,calc\(\(100cqi - (\d+)px\)\/([\d.]+)\)\)/;

  it('sizes the giant headline by its longest word so no word breaks or clips, on the phone column and the desktop column', () => {
    const html = templateHero({ ...bold, headline: 'Especialidades de altura' });
    expect(html).toMatch(/\.ty-copy\{[^}]*container-type:inline-size/);
    expect(html).toMatch(/\.ty h1\{[^}]*overflow-wrap:normal;word-break:normal;hyphens:manual/);
    // 390px phone: 354px column; 1280px desktop: about 501px column; plus the widest desktop column.
    for (const [width, selector] of [[354, H1_PHONE], [354, H1], [501, H1], [900, H1]] as const) {
      const size = sizeAt(html, selector, width);
      expect(size * 'Especialidades'.length * 0.66).toBeLessThanOrEqual(width + 1e-9);
    }
    // A short headline still gets the giant size.
    expect(sizeAt(templateHero({ ...bold, headline: 'Café de altura' }), H1, 501)).toBeGreaterThanOrEqual(110);
  });

  it('sizes the giant type field by the store name\'s longest word inside its padding', () => {
    for (const storeName of ['Tostadero Yungas', 'Especialidades']) {
      const html = templateHero({ ...bold, storeName, photoPath: undefined });
      expect(html).toMatch(/\.ty-art\{[^}]*container-type:inline-size/);
      const longest = Math.max(...storeName.split(' ').map(word => word.length));
      // 390px phone: the art box is 354px (282px inside the padding); 1280px desktop: about 477px; at most 520px.
      for (const width of [354, 477, 520]) {
        const size = sizeAt(html, TYPE, width);
        expect(size * longest * 0.66).toBeLessThanOrEqual(width - 72 + 1e-9);
      }
    }
  });

  it('fits the rail: the cart runs vertically on desktop, and a long name on the phone rail shrinks and never overflows', () => {
    const html = templateHero({ ...bold, storeName: 'Tostadero de Especialidades Yungas' });
    expect(html).toMatch(/\.ty-cart\{[^}]*writing-mode:vertical-rl/);
    const phone = html.slice(html.indexOf('@media (max-width:640px)'));
    expect(phone).toMatch(/\.ty-name\{[^}]*min-width:0;overflow:hidden;text-overflow:ellipsis/);
    expect(phone).toMatch(/\.ty-cart\{[^}]*writing-mode:horizontal-tb/);
    const size = Number(phone.match(/\.ty-name\{[^}]*font-size:(\d+(?:\.\d+)?)px/)![1]);
    expect(size).toBeLessThan(20);
    expect(Number(templateHero(bold).slice(templateHero(bold).indexOf('@media (max-width:640px)')).match(/\.ty-name\{[^}]*font-size:(\d+(?:\.\d+)?)px/)![1])).toBe(20);
  });

  it('fits the stamp text to the whole ring with textLength, for short and long names, and the sanitiser keeps it', () => {
    for (const storeName of ['Buna', 'Tostadero Yungas', 'Tostadero de Especialidades de los Yungas Bolivianos']) {
      const html = templateHero({ ...bold, storeName });
      const tag = html.match(/<textPath href="#ty-ring" textLength="(\d+(?:\.\d+)?)" lengthAdjust="spacing">([^<]*)<\/textPath>/);
      expect(tag).not.toBeNull();
      expect(Number(tag![1])).toBeCloseTo(2 * Math.PI * 74, 0);
      expect(tag![2]).toContain(storeName.toUpperCase());
      const fontSize = Number(html.match(/<text font-size="(\d+(?:\.\d+)?)"/)![1]);
      // Natural length close to the ring: at most a little stretch, never squeezed into overlapping letters.
      expect(tag![2].length * fontSize * 0.62).toBeLessThanOrEqual(2 * Math.PI * 74 * 1.05);
      expect(tag![2].length * fontSize * 0.62).toBeGreaterThan(2 * Math.PI * 74 * 0.6);
      expect(sanitizeHeroHtml(html)).toContain('textLength="');
      expect(sanitizeHeroHtml(html)).toContain('lengthAdjust="spacing"');
    }
  });

  it('keeps every type span readable when the accent is the ink colour', () => {
    const html = templateHero({ ...bold, photoPath: undefined, palette: { paper: '#f2b705', ink: '#111111', accent: '#111111', accent2: '#fff6d6' } });
    const odd = html.match(/\.ty-type\{[^}]*;color:(#[0-9a-f]{6})/i)![1], even = html.match(/\.ty-type span:nth-child\(2n\)\{color:(#[0-9a-f]{6})\}/i)![1];
    for (const colour of [odd, even]) expect(colour.toLowerCase()).not.toBe('#111111');
    // On the brief's own palette both keep their colours.
    const own = templateHero({ ...bold, photoPath: undefined });
    expect(own).toMatch(/\.ty-type span:nth-child\(2n\)\{color:#111111\}/);
  });

  it('gives the calm template a custom button from its family (radius and offset), not a default one', () => {
    const outline = templateHero(calm);
    expect(outline).toMatch(/\.th-cta\{[^}]*border:2px solid #8f1d14[^}]*border-radius:10px[^}]*box-shadow:3px 3px 0 #f4efe9/);
    expect(outline).toMatch(/<a class="th-cta"[^>]*>Ver productos <span aria-hidden="true">→<\/span><\/a>/);
    expect(templateHero({ ...calm, buttons: ['pill'] })).toMatch(/\.th-cta\{[^}]*background:#8f1d14[^}]*border-radius:999px/);
    expect(templateHero({ ...calm, buttons: ['block'], radius: 'square' })).toMatch(/\.th-cta\{[^}]*background:#8f1d14[^}]*border-radius:2px/);
    expect(sanitizeHeroHtml(outline)).not.toBeNull();
  });
});
