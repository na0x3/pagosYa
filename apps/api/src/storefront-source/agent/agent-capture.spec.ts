import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { agentPreviewSnapshot, captureAgentDraft } from './agent-capture';

jest.setTimeout(120_000);

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
  it('rejects a CSS-hidden catalog even when no products exist yet', async () => {
    const snapshot = { brief: {}, files: [{ path: 'index.html', content: '<html><head><style>[data-pagosya-catalog]{display:none}</style></head><body><h1>Tienda</h1><div data-pagosya-catalog></div></body></html>' }] } as any;
    expect((await captureAgentDraft(snapshot, 390)).errors).toContain('El catálogo está oculto. Mantén visible data-pagosya-catalog incluso sin productos; el runtime controla su estado vacío y los productos futuros.');
  });
  it('ignores the runtime second photo that waits for the shopper but still rejects an authored image with no path', async () => {
    const snapshot = (extra: string) => ({ brief: {}, files: [{ path: 'index.html', content: `<html><head><meta charset="utf-8"></head><body><h1>Tienda</h1><div data-pagosya-catalog><article class="menu-item" style="position:relative"><img class="menu-item__image-alt" data-src="assets/second.jpg" alt="" aria-hidden="true" style="position:absolute;width:100%;opacity:0"></article></div>${extra}</body></html>` }] }) as any;
    expect((await captureAgentDraft(snapshot(''), 390)).errors).toEqual([]);
    expect((await captureAgentDraft(snapshot('<img alt="Foto" style="width:120px;height:80px">'), 390)).errors).toEqual(['Imagen no disponible: (sin ruta)']);
  });
  it('paints store-colour art with a mask, shows colour art as an image, and names a missing illustration', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
    const art = '<Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg" tone="accent" size={80} /><Illustration src="/assets/creative/fluent-flat/coffee.svg" label="Café" /><Illustration src="/assets/creative/fluent-mono/no-such-thing.svg" />';
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace(/import \{([^}]*)\} from '@pagosya\/ui';/, "import {$1, Illustration } from '@pagosya/ui';").replace('</h1>', `</h1>${art}`) } : f);
    const snapshot = await agentPreviewSnapshot(base, authored);
    expect(snapshot.files.some(f => f.path === 'assets/creative/fluent-mono/soft-ice-cream.svg')).toBe(true);
    const shot = await captureAgentDraft(snapshot, 390);
    expect(shot.errors).toEqual(['Ilustración no disponible: /assets/creative/fluent-mono/no-such-thing.svg']);
  });
  it('gives store-colour art a visible colour on a store without kit tokens, and names a tone that resolves to nothing', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
    const art = '<Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg" tone="accent" /><Illustration src="/assets/creative/fluent-mono/strawberry.svg" tone="var(--not-defined)" />';
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: f.content.replace(/import \{([^}]*)\} from '@pagosya\/ui';/, "import {$1, Illustration } from '@pagosya/ui';").replace('</h1>', `</h1>${art}`) } : f);
    const shot = await captureAgentDraft(await agentPreviewSnapshot(base, authored), 390);
    expect(shot.errors).toEqual(['Ilustración sin color visible: /assets/creative/fluent-mono/strawberry.svg']);
  });
  it('never puts an unsafe src into a CSS url, and reports a path with a query, which the preview cannot load', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
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
  it('compiles an edited draft over the store runtime and screenshots it on a phone', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
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
