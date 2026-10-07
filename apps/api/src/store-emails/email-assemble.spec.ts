import { assembleEmail, type BlockCall, type LayoutData } from './email-assemble';
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
    expect(html).not.toMatch(/data-(?:block|item|items|product|store|email)\b/);
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
