import { assembleEmail, assembleWithinBudget, type BlockCall, type LayoutData } from './email-assemble';
import { loadFloorKit } from './email-copy-defaults';
import type { ValidEmailKit } from './email-kit-contract';

const layoutData: LayoutData = { storeName: 'Café Illimani', logoUrl: null, storeUrl: 'https://cafe.example', preheader: 'Tu pago fue confirmado', unsubscribeUrl: null, marketing: false };
const items: BlockCall = { block: 'items', total: 'Bs 150,00', originalTotal: null, items: [
  { name: 'Café <de altura>', variant: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00', image: { src: 'https://api.example/v1/uploads/a.webp', alt: 'Café de altura' } },
  { name: 'Taza', variant: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00', image: null },
] };

let floor: ValidEmailKit;
beforeAll(async () => { floor = await loadFloorKit(); });

describe('assembleEmail', () => {
  it('builds the recipe in order inside the layout, with the facts filled and escaped', () => {
    const { html } = assembleEmail(floor, floor, [{ block: 'heading', title: 'Gracias', text: 'Hola Ana' }, items, { block: 'note', text: 'Orden: pi_1' }], layoutData);
    expect(html.indexOf('Gracias')).toBeLessThan(html.indexOf('Taza'));
    expect(html.indexOf('Taza')).toBeLessThan(html.indexOf('Orden: pi_1'));
    expect(html).toContain('Café &lt;de altura&gt;');
    expect(html).toContain('Total: Bs 150,00');
    expect(html).toContain('x2');
    expect(html).toContain('Café Illimani');
  });

  it('repeats the item row per line, and drops the photo of a line that has none', () => {
    const { html } = assembleEmail(floor, floor, [items], layoutData);
    expect(html.match(/https:\/\/api\.example\/v1\/uploads\/a\.webp/g)).toHaveLength(1);
    expect(html).toContain('alt="Café de altura"');
    expect((html.match(/<img/g) ?? []).length).toBe(1); // the second line's photo and the null logo are removed
  });

  it("puts a photo's fallback background on its cell, so a blocked image leaves a coloured box", () => {
    const kit: ValidEmailKit = { ...floor, blocks: { ...floor.blocks, items: '<table data-block="items"><tr data-item><td><img data-item-image width="64"></td><td><span data-item-name></span><span data-item-quantity></span><span data-item-amount></span></td></tr><tr><td data-items-total></td></tr></table>' } };
    const { html } = assembleEmail(kit, floor, [items], layoutData);
    expect(html).toMatch(/<td style="background:#eeeeee"><img[^>]*src="https:\/\/api\.example\/v1\/uploads\/a\.webp"/);
  });

  it('uses the floor block when the store kit lacks one', () => {
    const kit: ValidEmailKit = { ...floor, blocks: { heading: '<table data-block="heading"><tr><td><h1 data-block-title style="color:#c00;background:#fff"></h1></td></tr></table>' } };
    const { html, repairs } = assembleEmail(kit, floor, [{ block: 'heading', title: 'Hola', text: null }, items], layoutData);
    expect(html).toContain('color:#c00');
    expect(html).toContain('Taza');
    expect(repairs.join(' ')).toContain('items: standard block used');
  });

  it('removes a slot whose value is absent', () => {
    expect(assembleEmail(floor, floor, [{ block: 'heading', title: 'Hola', text: null }], layoutData).html).not.toContain('data-block-text');
  });

  it('removes the unsubscribe link from a transactional email, and adds one to a marketing email that lacks it', () => {
    expect(assembleEmail(floor, floor, [items], layoutData).html).not.toContain('Dejar de recibir');
    const noLink: ValidEmailKit = { ...floor, layout: floor.layout!.replace(/<a data-email-unsubscribe[\s\S]*?<\/a>/, '') };
    const { html } = assembleEmail(noLink, floor, [items], { ...layoutData, marketing: true, unsubscribeUrl: 'https://x.example/u/1' });
    expect(html).toContain('href="https://x.example/u/1"');
  });

  it('leaves no slot attributes in the sent HTML', () => {
    const { html } = assembleEmail(floor, floor, [{ block: 'heading', title: 'a', text: 'b' }, items, { block: 'button', href: 'https://t.example', label: 'Sigue' }], layoutData);
    expect(html).not.toMatch(/data-(?:block|item|items|product|store|email|line|step|trust|quote|contact|nav|social|policy|tone)\b/);
  });

  it('clamps the result to 90 KB and says so', () => {
    const many = { ...items, items: Array.from({ length: 900 }, (_, i) => ({ name: `Producto ${i} ${'x'.repeat(80)}`, variant: null, extras: null, quantity: 1, amount: 'Bs 1,00', image: null })) } as BlockCall;
    const { html, repairs } = assembleEmail(floor, floor, [many], layoutData);
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(90 * 1024);
    expect(repairs.join(' ')).toContain('clamped');
  });

  it('falls back to the floor layout when the kit has none', () => {
    const { html, repairs } = assembleEmail({ ...floor, layout: null }, floor, [items], layoutData);
    expect(html).toContain('Taza');
    expect(repairs).toContain('layout: standard layout used');
  });
});

const rich: LayoutData = { ...layoutData, nav: [], socials: [], address: null, policies: [], iconBase: 'https://api.example' };

describe('assembleEmail, rich blocks', () => {
  it('fills repeated rows with icons', () => {
    const { html } = assembleEmail(floor, floor, [{ block: 'steps', steps: [{ icon: 'check', title: 'Confirmado' }, { icon: 'box', title: 'Preparando' }, { icon: 'truck', title: 'En camino' }] }], rich);
    expect(html.match(/(?:check|box|truck)-(?:dark|light)\.png/g)).toHaveLength(3);
    expect(html).toContain('En camino');
  });

  it('a block on a dark background gets light icons', () => {
    const kit = { ...floor, blocks: { ...floor.blocks, trust: floor.blocks.trust!.replace('data-tone="light"', 'data-tone="dark"') } };
    expect(assembleEmail(kit, floor, [{ block: 'trust', items: [{ icon: 'lock', label: 'Pago seguro' }] }], rich).html).toContain('lock-light.png');
  });

  it('fills header links, social icons, an unknown link as text, the address and policies', () => {
    const { html } = assembleEmail(floor, floor, [], { ...rich, nav: [{ label: 'Café', href: 'https://s/cafe' }],
      socials: [{ icon: 'instagram', label: 'Instagram', href: 'https://instagram.com/x' }, { icon: null, label: 'Linktree', href: 'https://linktr.ee/x' }],
      address: 'Av. 6 de Agosto 123, La Paz', policies: [{ label: 'Cambios', href: 'https://s/cambios' }] });
    expect(html).toContain('instagram-light.png');
    expect(html).toMatch(/href="https:\/\/linktr\.ee\/x"[^>]*>Linktree</);
    expect(html).toContain('Av. 6 de Agosto 123, La Paz');
    expect(html).toContain('href="https://s/cambios"');
  });

  it('drops optional sections in priority order to fit 90 KB, never the order lines', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ name: `Producto ${i} ${'x'.repeat(200)}`, variant: null, extras: null, quantity: 1, amount: 'Bs 1,00', image: { src: 'https://api.example/v1/uploads/a.webp', alt: 'a' } }));
    const calls: BlockCall[] = [
      { block: 'items', items: lines, total: 'Bs 40,00', originalTotal: null },
      { block: 'products', products: Array.from({ length: 4 }, () => ({ name: 'p'.repeat(12000), price: 'Bs 1', href: 'https://s', image: null })), drop: 6 },
      { block: 'story', image: null, title: 't', text: 's'.repeat(6000), drop: 5 },
      { block: 'quote', text: 'q'.repeat(3000), author: 'Ana', stars: 5, drop: 4 },
    ];
    const { html, repairs } = assembleWithinBudget(floor, floor, calls, rich);
    expect(Buffer.byteLength(html)).toBeLessThanOrEqual(90 * 1024);
    expect(html).toContain('Producto 39');
    expect(repairs[0]).toMatch(/products removed/);
  });

  it('stars come from the number, never from text', () => {
    expect(assembleEmail(floor, floor, [{ block: 'quote', text: 'Excelente', author: 'Ana', stars: 4 }], rich).html).toContain('★★★★☆');
  });
});
