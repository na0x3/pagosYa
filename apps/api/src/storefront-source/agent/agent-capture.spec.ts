import { listTemplates } from '@pagosya/store-templates';
import { literalTemplateSource } from '../fixtures/literal-template';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import sharp from 'sharp';
import { agentPreviewSnapshot, agentShotSections, captureAgentDraft } from './agent-capture';
import { snapshotWithAccountTheme } from '../account-theme';

jest.setTimeout(120_000);

describe('agent screenshot slices (Gramiyaa 2026-10-26)', () => {
  const page = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#f5efe6' } }).png().toBuffer();
  const size = async (slice: string) => sharp(Buffer.from(slice.replace(/^data:[^,]+,/, ''), 'base64')).metadata();
  it('cuts a tall desktop page into at most six slices that stay readable, top to bottom', async () => {
    const slices = await agentShotSections(await page(1280, 9500));
    expect(slices).toHaveLength(6);
    for (const slice of slices) expect((await size(slice)).width).toBe(1024);
    expect((await size(slices[0])).height).toBeGreaterThan(1200);
  });
  it('keeps a short page whole and never enlarges a phone page', async () => {
    expect(await agentShotSections(await page(1280, 900))).toHaveLength(1);
    const phone = await agentShotSections(await page(390, 2000));
    expect(phone).toHaveLength(3);
    expect((await size(phone[0])).width).toBe(390);
  });
});

describe('agent capture', () => {
  it('rejects stale authored catalog copy but permits the runtime-owned empty state', async () => {
    const snapshot = (copy: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"></head><body><h1>Papelería</h1>${copy}<div data-pagosya-catalog><p>No hay productos disponibles.</p></div></body></html>` }] }) as any;
    expect((await captureAgentDraft(snapshot('<p>Explora el catálogo cuando la colección esté disponible.</p>'), 390)).errors).toEqual(expect.arrayContaining([expect.stringContaining('Texto permanente de catálogo vacío')]));
    expect((await captureAgentDraft(snapshot('<p>Cuadernos y papelería para tus ideas.</p>'), 390)).errors).toEqual([]);
  });
  it('rejects design-process copy in a shop but keeps ordinary availability copy and portfolio prose', async () => {
    const snapshot = (copy: string, shop = true) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"></head><body><h1>Tienda</h1><p>${copy}</p>${shop ? '<div data-pagosya-catalog></div>' : ''}</body></html>` }] }) as any;
    expect((await captureAgentDraft(snapshot('Una secuencia visual contenida acompaña la selección real de la tienda.'), 390)).errors).toEqual(expect.arrayContaining([expect.stringContaining('Texto del proceso de diseño')]));
    expect((await captureAgentDraft(snapshot('Consulta precios y disponibilidad en cada producto.'), 390)).errors).toEqual([]);
    expect((await captureAgentDraft(snapshot('Diseño de una composición visual contenida.', false), 390)).errors).toEqual([]);
  });
  it('does not report the store\'s own uploaded photos the sandbox cannot fetch, but still reports a missing bundled file (live 2026-10-19)', async () => {
    const snapshot = (src: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"></head><body><h1>Tienda</h1><img src="${src}" alt="" width="200" height="200" style="display:block;width:200px;height:200px"><div data-pagosya-catalog></div></body></html>` }] } as any);
    expect((await captureAgentDraft(snapshot('http://localhost:3001/v1/uploads/5205e16c-fbba-4bfb-bee5-f2fcd0fc61d8.jpg'), 390)).errors.filter(e => e.startsWith('Imagen no disponible'))).toEqual([]);
    expect((await captureAgentDraft(snapshot('assets/no-existe.jpg'), 390)).errors).toContain('Imagen no disponible: assets/no-existe.jpg');
  });
  it('rejects a CSS-hidden catalog even when no products exist yet', async () => {
    const snapshot = { brief: {}, files: [{ path: 'index.html', content: '<html><head><style>[data-pagosya-catalog]{display:none}</style></head><body><h1>Tienda</h1><div data-pagosya-catalog></div></body></html>' }] } as any;
    expect((await captureAgentDraft(snapshot, 390)).errors).toContain('El catálogo está oculto. Mantén visible data-pagosya-catalog incluso sin productos; el runtime controla su estado vacío y los productos futuros.');
  });
  // BAEK 2026-10-23: «[data-pagosya-catalog]:not(:has(.es-card)){height:1px;overflow:hidden}» meant to hide an empty catalog,
  // but the products page draws .menu-item cards, so the whole list was clipped to 1px and shipped blank.
  it('rejects a catalog clipped to almost no height', async () => {
    const snapshot = { brief: {}, files: [{ path: 'index.html', content: '<html><head><style>[data-pagosya-catalog]{height:1px;max-height:1px;overflow:hidden}</style></head><body><h1>Tienda</h1><section data-pagosya-catalog><article style="height:400px">Hogaza</article></section></body></html>' }] } as any;
    expect((await captureAgentDraft(snapshot, 390)).errors).toContain('El catálogo está oculto. Mantén visible data-pagosya-catalog incluso sin productos; el runtime controla su estado vacío y los productos futuros.');
  });
  it('ignores the runtime second photo that waits for the shopper but still rejects an authored image with no path', async () => {
    const snapshot = (extra: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"></head><body><h1>Tienda</h1><div data-pagosya-catalog><article class="menu-item" style="position:relative"><img class="menu-item__image-alt" data-src="assets/second.jpg" alt="" aria-hidden="true" style="position:absolute;width:100%;opacity:0"></article></div>${extra}</body></html>` }] }) as any;
    expect((await captureAgentDraft(snapshot(''), 390)).errors).toEqual([]);
    expect((await captureAgentDraft(snapshot('<img alt="Foto" style="width:120px;height:80px">'), 390)).errors).toEqual(['Imagen no disponible: (sin ruta)']);
  });
  it('paints store-colour art with a mask, shows colour art as an image, and names a missing illustration', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, literalTemplateSource('pausa'));
    const art = '<Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg" tone="accent" size={80} /><Illustration src="/assets/creative/fluent-flat/coffee.svg" label="Café" /><Illustration src="/assets/creative/fluent-mono/no-such-thing.svg" />';
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace(/import \{([^}]*)\} from '@pagosya\/ui';/, "import {$1, Illustration } from '@pagosya/ui';").replace('</h1>', `</h1>${art}`) } : f);
    const snapshot = await agentPreviewSnapshot(base, authored);
    expect(snapshot.files.some(f => f.path === 'assets/creative/fluent-mono/soft-ice-cream.svg')).toBe(true);
    const shot = await captureAgentDraft(snapshot, 390);
    expect(shot.errors).toEqual(['Ilustración no disponible: /assets/creative/fluent-mono/no-such-thing.svg']);
  });
  it('gives store-colour art a visible colour on a store without kit tokens, and names a tone that resolves to nothing', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, literalTemplateSource('pausa'));
    const art = '<Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg" tone="accent" /><Illustration src="/assets/creative/fluent-mono/strawberry.svg" tone="var(--not-defined)" />';
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace(/import \{([^}]*)\} from '@pagosya\/ui';/, "import {$1, Illustration } from '@pagosya/ui';").replace('</h1>', `</h1>${art}`) } : f);
    const shot = await captureAgentDraft(await agentPreviewSnapshot(base, authored), 390);
    expect(shot.errors).toEqual(['Ilustración sin color visible: /assets/creative/fluent-mono/strawberry.svg']);
  });
  it('never puts an unsafe src into a CSS url, and reports a path with a query, which the preview cannot load', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, literalTemplateSource('pausa'));
    const art = '<img src="/assets/creative/fluent-flat/coffee.svg?v=1" alt="" aria-hidden="true" width="40" height="40" /><Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg?v=1#x" /><Illustration src={`/assets/creative/fluent-mono/x.svg") , url("https://example.com/a.svg`} />';
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace(/import \{([^}]*)\} from '@pagosya\/ui';/, "import {$1, Illustration } from '@pagosya/ui';").replace('</h1>', `</h1>${art}`) } : f);
    const shot = await captureAgentDraft(await agentPreviewSnapshot(base, authored), 390);
    expect(shot.errors).toEqual(['/assets/creative/fluent-flat/coffee.svg?v=1', '/assets/creative/fluent-mono/soft-ice-cream.svg?v=1#x', '/assets/creative/fluent-mono/x.svg") , url("https://example.com/a.svg'].map(src => 'Imagen no disponible: ' + src));
  });
  it('rejects broken skip links while allowing real, encoded, named and cross-page destinations', async () => {
    const snapshot = { brief: {}, files: [{ path: 'index.html', content: `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <a href="#contenido">Saltar al contenido</a><a href="index.html#contenido">Repetido</a>
      <a href="#caf%C3%A9">Café</a><main id="café">Tienda</main>
      <a href="#legacy">Anterior</a><a name="legacy"></a>
      <a href="product.html#detalles">Producto</a><a href="https://example.com/#otro">Externo</a>
      <a href="#pedido">Pedido</a><a href="#top">Arriba</a><a href="#:~:text=Tienda">Texto</a>
    </body></html>` }] } as any;
    const shot = await captureAgentDraft(snapshot, 390);
    expect(shot.errors).toEqual(['Enlace a sección inexistente: #contenido']);
  });
  // Meathouse 2026-10-20: a sticky buy column slid over the sections below it in the same grid, and a big «01 / MH»
  // index sat on the «Abrir pedido» button.
  it('reports a sticky block that slides over what follows it, and a positioned text over a button', async () => {
    const page = (css: string, body: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>Carne</h1>${body}</body></html>` }] }) as any;
    const sticky = page('.grid{display:grid;grid-template-columns:1fr 1fr}.buy{position:sticky;top:0;grid-column:2;height:200px}.media{height:400px}.lower{grid-column:1/-1;height:300px}', '<main class="grid"><div class="media"></div><section class="buy">Comprar</section><section class="lower">Reseñas</section></main>');
    expect((await captureAgentDraft(sticky, 1280)).errors).toEqual(expect.arrayContaining([expect.stringContaining('«buy» es sticky')]));
    const fine = page('.grid{display:grid;grid-template-columns:1fr 1fr}.buy{position:sticky;top:0;height:200px}.media{height:400px}header{position:sticky;top:0}', '<header><a href="#">Inicio</a></header><main class="grid"><div class="media"></div><section class="buy">Comprar</section></main><section>Reseñas</section>');
    expect((await captureAgentDraft(fine, 1280)).errors.filter(e => /sticky/.test(e))).toEqual([]);
    const over = page('.hero{position:relative;height:300px}.index{position:absolute;right:20px;bottom:20px;margin:0;font-size:32px}.cta{position:absolute;right:20px;bottom:20px;padding:12px 24px}', '<section class="hero"><a class="cta" href="#">Abrir pedido</a><p class="index">01 / MH</p></section>');
    expect((await captureAgentDraft(over, 1280)).errors).toEqual(expect.arrayContaining([expect.stringContaining('«01 / MH» sobre «Abrir pedido»')]));
  });
  // BAEK 2026-10-23: a card's «Nuevo» badge scrolled under the kit's viewport-pinned «Contacto» launcher failed four
  // verifies in a row and threw away a finished edit. A floating control rides over the page by design; text in the same
  // fixed bar as the control is still a real overlap.
  it('does not count page text that only scrolls under a fixed control, but still reports an overlap inside a fixed bar', async () => {
    const page = (css: string, body: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>Pan</h1>${body}</body></html>` }] }) as any;
    const floating = page('main{height:2000px}.card{position:fixed;right:30px;bottom:30px;width:200px;height:120px}.badge{position:absolute;right:0;bottom:0;margin:0}.launcher{position:fixed;right:24px;bottom:24px;z-index:9;padding:12px 20px}', '<main><article class="card"><p class="badge">Nuevo</p></article></main><section class="contact"><button class="launcher" type="button">Contacto</button></section>');
    expect((await captureAgentDraft(floating, 390)).errors.filter(e => /Texto encima/.test(e))).toEqual([]);
    const bar = page('header{position:fixed;top:0;left:0;right:0;height:60px}.stamp{position:absolute;left:100px;top:20px;margin:0}header a{position:absolute;left:96px;top:16px;padding:8px}', '<header><a href="#visita">Visítanos</a><p class="stamp">빵집</p></header>');
    expect((await captureAgentDraft(bar, 1280)).errors).toEqual(expect.arrayContaining([expect.stringContaining('«빵집» sobre «Visítanos»')]));
  });
  // PEPPA please 2026-10-20: the older checkout form was pasted over the kit's, so every [data-part] check came back
  // empty and the account theme being edited never showed in the agent's own screenshots.
  it('lets the kit draw the themed account form, so [data-part] checks see it', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, literalTemplateSource('pausa'));
    const snapshot = snapshotWithAccountTheme(await agentPreviewSnapshot(base, base.files.filter(f => nextSourceFile(f.path))), { layout: 'card', css: '[data-account-gate] [data-part="card"] {\n    border: 0\n}' });
    expect(snapshot.files.some(f => f.path === 'acceso-registro.html')).toBe(true);
    const shot = await captureAgentDraft(snapshot, 1280, undefined, 'acceso-registro.html', [
      { id: 'r1', description: 'El botón del formulario', page: 'acceso-registro.html', check: 'element', selector: '[data-account-gate] [data-part="submit"]', expected: '1' },
      { id: 'r2', description: 'La tarjeta sin borde', page: 'acceso-registro.html', check: 'style', selector: '[data-account-gate] [data-part="card"]', expected: 'border-top-width:0px' },
    ]);
    expect(shot.evidence.map(e => [e.id, e.passed])).toEqual([['r1', true], ['r2', true]]);
  });
  // BAEK 2026-10-23: YAPI's identity wrote `.es{--es-paper:var(--store-background)}` over Esencial's `.es{--store-background:
  // var(--es-paper)}`. The two point at each other, so both resolve to nothing and the menu panel, header and cart lost their
  // background: the side menu opened transparent over the page.
  it('names colour variables that point at each other, but not an ordinary chain', async () => {
    const page = (css: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"><style>:root{--store-background:#f3ebdd}${css}.menu{background:var(--es-paper)}</style></head><body><div class="es"><h1>Pan</h1><nav class="menu">Panes</nav></div></body></html>` }] }) as any;
    expect((await captureAgentDraft(page('.es{--store-background:var(--es-paper)}.es{--es-paper:var(--store-background)}'), 390)).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('Variables de color sin valor en «.es»: --store-background, --es-paper')]));
    expect((await captureAgentDraft(page('.es{--es-paper:var(--store-background);--es-ink:var(--es-paper);--es-gap: }'), 390)).errors).toEqual([]);
  });
  // BOXY 2026-10-25: the story's title was white on a white card laid over a photo; the owner selected the text to read it.
  it('names text the colour of its own solid ground, but not text over a photo or ordinary dark-on-light', async () => {
    const page = (css: string) => ({ schemaVersion: 1 as const, brief: {} as any, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"><style>body{margin:0;background:#f7f4ee;color:#111820}.card{padding:24px;background:#f7f4ee}.photo{padding:24px;background:#333 url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)}${css}</style></head><body><main><h1>BOXY</h1><section class="card"><h2>Pocas piezas, mucho uso</h2><p>Hacemos hoodies amplios.</p></section><section class="photo"><h2 class="over">Sobre la foto</h2></section></main></body></html>` }] }) as any;
    expect((await captureAgentDraft(page('.card h2{color:#ffffff}.photo .over{color:#fff}'), 390)).errors)
      .toEqual(expect.arrayContaining([expect.stringContaining('Texto casi invisible, del mismo color que el fondo donde está: «Pocas piezas, mucho uso»')]));
    expect((await captureAgentDraft(page('.photo .over{color:#fff}'), 390)).errors.filter(e => e.startsWith('Texto casi invisible'))).toEqual([]);
  });
  it('compiles an edited draft over the store runtime and screenshots it on a phone', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, literalTemplateSource('pausa'));
    base.files = base.files.filter(f => !f.path.startsWith('assets/icons/'));
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace('Un respiro', 'Tu calma').replace('</h1>', '</h1><img src="/assets/icons/shopping-bag.svg" alt="Carrito" width="24" height="24" />') } : f);
    const snapshot = await agentPreviewSnapshot(base, authored);
    expect(snapshot.files.find(f => f.path === '_compiled/home.js')!.content).toContain('Tu calma');
    expect(snapshot.files.some(f => f.path === 'config.js')).toBe(true);
    expect(snapshot.files.some(f => f.path === 'assets/icons/shopping-bag.svg')).toBe(true);
    const shot = await captureAgentDraft(snapshot, 390, undefined, 'index.html', [{ id: 'r1', description: 'El icono local carga', page: 'index.html', check: 'image', selector: 'img[alt="Carrito"]', expected: 'assets/icons/shopping-bag.svg' }]);
    expect(shot.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(shot.thumbnail.length).toBeLessThan(shot.image.length);
    expect(shot.errors).toEqual([]);
    expect(shot.evidence[0].passed).toBe(true);
  });
});
