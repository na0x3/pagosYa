// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createProductForm } from './source-create-product';
import type { MerchantStudioApi } from './api';
afterEach(()=>document.body.replaceChildren());
function setup() {
  const api={createProduct:vi.fn().mockResolvedValue({id:'p1'}),upload:vi.fn(),suggestProductHighlights:vi.fn().mockResolvedValue({highlights:[]})}, saved=vi.fn(), close=vi.fn();
  const guide=createProductForm(api as unknown as MerchantStudioApi,'store-two',saved,close);document.body.append(guide.element);
  const field=(name:string)=>guide.element.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const fill=(name:string,value:string)=>{field(name).value=value;field(name).dispatchEvent(new Event('input',{bubbles:true}));};
  const next=()=>guide.element.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  const step=()=>guide.element.querySelector('[data-product-step]')!.textContent;
  return {api,saved,guide,field,fill,next,step};
}
describe('fixed YAPI product questions',()=>{
  it('validates each step, preserves previous answers and saves only after review',async()=>{
    const t=setup();t.next();expect(t.step()).toBe('Paso 1 de 8');
    t.fill('name','Suéter azul');t.next();t.fill('description','Algodón');t.next();
    t.fill('price','-1');t.next();expect(t.step()).toBe('Paso 3 de 8');
    t.fill('price','180.50');t.next();t.next();t.next();t.next();t.fill('stock','1.5');t.next();expect(t.step()).toBe('Paso 7 de 8');
    t.fill('stock','3');t.next();expect(t.api.createProduct).not.toHaveBeenCalled();
    t.guide.element.querySelector<HTMLButtonElement>('[data-answer-step="1"]')!.click();expect(t.field('name').value).toBe('Suéter azul');
    for(let i=0;i<7;i++)t.next();expect(t.step()).toBe('Paso 8 de 8');t.next();
    await vi.waitFor(()=>expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.createProduct).toHaveBeenCalledWith('store-two',{name:'Suéter azul',description:'Algodón',amount:18050,currency:'BOB',stock:3,imageUrls:[]});
  });
  it('retains answers and allows retry when saving fails',async()=>{
    const t=setup();t.api.createProduct.mockRejectedValueOnce(Error('Intenta otra vez'));
    t.fill('name','Cárdigan');t.next();t.next();t.fill('price','120');for(let i=0;i<5;i++)t.next();t.next();
    await vi.waitFor(()=>expect(t.guide.element.querySelector('[data-product-error]')!.textContent).toBe('Intenta otra vez'));
    expect(t.field('name').value).toBe('Cárdigan');t.next();await vi.waitFor(()=>expect(t.saved).toHaveBeenCalledOnce());expect(t.api.createProduct).toHaveBeenCalledTimes(2);
  });
  it('builds combinations from the owner\'s options and saves their independent stock',async()=>{
    const t=setup();t.fill('name','Suéter');t.next();t.next();t.fill('price','100');
    while(t.step()!=='Paso 6 de 8')t.next();
    t.field('hasOptions').checked=true;t.field('hasOptions').dispatchEvent(new Event('change'));
    const fillOption=(selector:string,value:string)=>{const el=t.guide.element.querySelector<HTMLInputElement>(selector)!;el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
    fillOption('[data-group-name="0"]','Color');fillOption('[data-group-values="0"]','Azul, Blanco');
    t.guide.element.querySelector<HTMLButtonElement>('[data-generate]')!.click();
    fillOption('[data-row="0"] [data-field="stock"]','3');fillOption('[data-row="1"] [data-field="stock"]','0');
    t.next();t.next();t.next();await vi.waitFor(()=>expect(t.saved).toHaveBeenCalledOnce());
    const data=t.api.createProduct.mock.calls[0][1];expect(data.stock).toBe(3);expect(data.variants.map((v:any)=>v.stock)).toEqual([3,0]);
  });
});

it('edits the selected product while preserving photos and unchanged variant stock',async()=>{
  const api={updateProduct:vi.fn().mockResolvedValue({id:'p-old'}),createProduct:vi.fn(),upload:vi.fn(),suggestProductHighlights:vi.fn().mockResolvedValue({highlights:[]})}, saved=vi.fn();
  const guide=createProductForm(api as unknown as MerchantStudioApi,'store-b',saved,()=>{}, {id:'p-old',name:'Suéter',amount:10000,stock:8,imageUrls:['https://example.test/photo.webp'],variants:[{id:'blue-s',name:'Azul / S',amount:10000,stock:3,options:[{name:'Color',value:'Azul'},{name:'Talla',value:'S'}]},{id:'white-s',name:'Blanco / S',amount:10000,stock:5,options:[{name:'Color',value:'Blanco'},{name:'Talla',value:'S'}]}]});document.body.append(guide.element);
  const name=guide.element.querySelector<HTMLInputElement>('[name=name]')!;name.value='Suéter de algodón';
  for(let i=0;i<8;i++)guide.element.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect(api.createProduct).not.toHaveBeenCalled();expect(api.upload).not.toHaveBeenCalled();
  const [storeId,id,input]=api.updateProduct.mock.calls[0];expect([storeId,id]).toEqual(['store-b','p-old']);
  expect(input.imageUrls).toEqual(['https://example.test/photo.webp']);expect(input).not.toHaveProperty('stock');
  expect(input.variants.map((variant:any)=>variant.id)).toEqual(['blue-s','white-s']);
  expect(input.variants.every((variant:any)=>!('stock' in variant))).toBe(true);
  expect(guide.hasChanges).toBe(false);
});

describe('owner-friendly options editor', () => {
  const editor = (variants?: any[]) => {
    const host = document.createElement('div'); document.body.append(host);
    const api = PagosYaProductOptions.mount(host, { variants, basePrice: () => '100' });
    const type = (selector: string, value: string) => { const el = host.querySelector<HTMLInputElement>(selector)!; el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
    const click = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!.click();
    return { host, api, type, click };
  };
  it('builds combinations on its own, labels them by option and uses the units chosen for new ones', async () => {
    const e = editor();
    e.click('[data-suggest="Color"]');
    expect(e.host.querySelector<HTMLInputElement>('[data-group-name="0"]')!.value).toBe('Color');
    e.type('[data-group-values="0"]', 'Azul, Negro');
    e.click('[data-group-add]');
    e.type('[data-group-name="1"]', 'Talla'); e.type('[data-default-stock]', '5'); e.type('[data-group-values="1"]', 'S, M');
    expect(e.host.querySelector('[data-chips="1"]')!.textContent).toContain('2 valores');
    await vi.waitFor(() => expect(e.host.querySelectorAll('[data-row]')).toHaveLength(4));
    expect(e.host.querySelector('[data-row="0"] strong')!.textContent).toBe('Color: Azul · Talla: S');
    expect(e.host.querySelector('[data-count]')!.textContent).toBe('4 combinaciones · 4 a la venta');
    expect(e.api.values().map(v => [v.name, v.amount, v.stock])).toEqual([['Azul / S', 10000, 5], ['Azul / M', 10000, 5], ['Negro / S', 10000, 5], ['Negro / M', 10000, 5]]);
    e.type('[data-row="0"] [data-field="stock"]', '1');
    e.type('[data-default-stock]', '8');
    expect(e.api.values().map(v => v.stock)).toEqual([1, 8, 8, 8]);
  });
  it('warns when one option was split into several and saves pending edits without an extra button', () => {
    const e = editor();
    e.type('[data-group-name="0"]', 'Opción 1'); e.type('[data-group-values="0"]', 'Azul, Beige');
    e.click('[data-group-add]');
    e.type('[data-group-name="1"]', 'Opción 2'); e.type('[data-group-values="1"]', 'Azul, Rojo');
    const values = e.api.values();
    expect(values).toHaveLength(4);
    expect(values.every(v => v.stock === null)).toBe(true);
    expect(e.host.querySelector('[data-warning]')!.textContent).toContain('«Azul» aparece en Opción 1 y en Opción 2');
  });
  it('still asks before removing saved combinations', () => {
    const e = editor([{ id: 'a', name: 'Azul', amount: '100', stock: '2', options: [{ name: 'Color', value: 'Azul' }] }, { id: 'n', name: 'Negro', amount: '100', stock: '1', options: [{ name: 'Color', value: 'Negro' }] }]);
    e.type('[data-group-values="0"]', 'Azul');
    expect(() => e.api.values()).toThrow('Confirma qué combinaciones se retiran antes de guardar.');
    expect(e.host.querySelector<HTMLButtonElement>('[data-generate]')!.hidden).toBe(false);
    e.click('[data-generate]');
    expect(e.api.values().map(v => v.id)).toEqual(['a']);
  });
});

describe('choosing the cover photo', () => {
  const edit = (imageUrls: string[], extra: Record<string, unknown> = {}) => {
    const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p-old' }), createProduct: vi.fn(), upload: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }), ...extra }, saved = vi.fn();
    const guide = createProductForm(api as unknown as MerchantStudioApi, 'store-b', saved, () => {}, { id: 'p-old', name: 'Funda de cojín', amount: 12900, stock: 4, imageUrls });
    document.body.append(guide.element);
    const photos = () => [...guide.element.querySelectorAll('[data-product-photos] figure')];
    const save = async () => { for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce()); return api.updateProduct.mock.calls[0][2]; };
    return { api, guide, photos, save };
  };

  it('lets the owner make any photo the cover, and saves that order', async () => {
    const t = edit(['https://example.test/pack.jpg', 'https://example.test/scene.jpg']);
    expect(t.photos()[0].querySelector('[data-cover-photo]')).toBeNull();
    t.photos()[1].querySelector<HTMLButtonElement>('[data-cover-photo]')!.click();
    expect(t.photos()[0].querySelector('figcaption')!.textContent).toBe('Portada');
    expect(t.photos()[0].querySelector('img')!.getAttribute('src')).toBe('https://example.test/scene.jpg');
    expect((await t.save()).imageUrls).toEqual(['https://example.test/scene.jpg', 'https://example.test/pack.jpg']);
  });

  it('makes an accepted YAPI scene the cover, because the storefront card shows the cover', async () => {
    const createProductScene = vi.fn().mockResolvedValue({ url: '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-000000000002.jpg', parentUrl: '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-000000000001.jpg', kind: 'AI_DERIVED' });
    const t = edit(['/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-000000000001.jpg'], { createProductScene });
    t.photos()[0].querySelector<HTMLButtonElement>('[data-scene-photo]')!.click();
    t.guide.element.querySelector<HTMLButtonElement>('[data-scene-generate]')!.click();
    await vi.waitFor(() => expect(t.guide.element.querySelector('[data-scene-accept]')).not.toBeNull());
    t.guide.element.querySelector<HTMLButtonElement>('[data-scene-accept]')!.click();
    expect(t.photos().map(photo => photo.querySelector('figcaption')!.textContent)).toEqual(['Portada · Escena YAPI', 'Foto 2']);
    expect(t.guide.element.querySelector('[data-product-status]')!.textContent).toContain('portada');
    expect((await t.save()).imageUrls).toEqual(['/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-000000000002.jpg', '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-000000000001.jpg']);
  });

  it('keeps a variant pointing at its own photo when the cover changes', async () => {
    const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p-old' }), createProduct: vi.fn(), upload: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) }, saved = vi.fn();
    const guide = createProductForm(api as unknown as MerchantStudioApi, 'store-b', saved, () => {}, { id: 'p-old', name: 'Suéter', amount: 10000, stock: 3, imageUrls: ['https://example.test/blue.webp', 'https://example.test/white.webp'], variants: [{ id: 'white-s', name: 'Blanco / S', amount: 10000, stock: 3, imageUrl: 'https://example.test/white.webp', options: [{ name: 'Color', value: 'Blanco' }, { name: 'Talla', value: 'S' }] }] });
    document.body.append(guide.element);
    guide.element.querySelectorAll('[data-product-photos] figure')[1].querySelector<HTMLButtonElement>('[data-cover-photo]')!.click();
    for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const input = api.updateProduct.mock.calls[0][2];
    expect(input.imageUrls).toEqual(['https://example.test/white.webp', 'https://example.test/blue.webp']);
    // Untouched photos are omitted so the API preserves their saved assignment.
    expect(input.variants[0]).not.toHaveProperty('imageUrl');
    expect(input.variants[0]).not.toHaveProperty('imageUrls');
  });
});

it('maps a changed variant photo set from preview URLs back to uploaded paths', async () => {
  const a = '/v1/uploads/11111111-1111-1111-1111-111111111111.jpg';
  const b = '/v1/uploads/22222222-2222-2222-2222-222222222222.jpg';
  const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p' }), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) }, saved = vi.fn();
  const guide = createProductForm(api as unknown as MerchantStudioApi, 's', saved, () => {}, { id: 'p', name: 'Silla', amount: 1000, imageUrls: [a, b], variants: [{ id: 'red', name: 'Rojo', amount: 1000, imageUrl: a, options: [{ name: 'Color', value: 'Rojo' }] }] });
  document.body.append(guide.element);
  guide.element.querySelectorAll<HTMLInputElement>('[data-row="0"] input[type=checkbox]')[1].click();
  for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.updateProduct.mock.calls[0][2].variants[0]).toMatchObject({ imageUrl: a, imageUrls: [a, b] });
});

it('blocks saving when a photo used only by an untouched variant set was removed', () => {
  const api = { updateProduct: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) };
  const guide = createProductForm(api as unknown as MerchantStudioApi, 's', () => {}, () => {}, {
    id: 'p', name: 'Silla', amount: 1000, imageUrls: ['https://shop.test/a.jpg', 'https://shop.test/b.jpg'],
    variants: [{ id: 'red', name: 'Rojo', amount: 1000, imageUrl: 'https://shop.test/a.jpg', imageUrls: ['https://shop.test/a.jpg', 'https://shop.test/b.jpg'], options: [{ name: 'Color', value: 'Rojo' }] }],
  });
  document.body.append(guide.element);
  guide.element.querySelectorAll<HTMLButtonElement>('[data-remove-photo]')[1].click();
  for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(guide.element.querySelector('[data-product-error]')!.textContent).toContain('Una foto de combinación fue retirada');
  expect(api.updateProduct).not.toHaveBeenCalled();
});

it("keeps YAPI's untouched highlights marked, makes an edited one the merchant's, and allows six", async () => {
  const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p' }), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) }, saved = vi.fn();
  const guide = createProductForm(api as unknown as MerchantStudioApi, 's', saved, () => {}, { id: 'p', name: 'Bolso', amount: 1000, imageUrls: [], highlights: [{ icon: 'snowflake', label: 'Frío', origin: 'yapi' }, { icon: 'laptop', label: 'Laptop', origin: 'yapi' }] } as any);
  document.body.append(guide.element);
  for (let i = 0; i < 3; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  // Reaching the highlights step shows the product's existing rows without the merchant adding one first.
  await vi.waitFor(() => expect(guide.element.querySelectorAll('[data-highlight-row]')).toHaveLength(2));
  const label = guide.element.querySelector<HTMLInputElement>('[data-highlight-row="0"] [data-highlight-text]')!;
  label.value = 'Frío de verdad'; label.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 5; i++) guide.element.querySelector<HTMLButtonElement>('[data-highlight-add]')!.click();
  expect(guide.element.querySelectorAll('[data-highlight-row]')).toHaveLength(6);
  guide.element.querySelectorAll<HTMLInputElement>('[data-highlight-text]').forEach((input, index) => { if (index > 1) { input.value = `Dato ${index}`; input.dispatchEvent(new Event('input', { bubbles: true })); } });
  for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const sent = api.updateProduct.mock.calls[0][2].highlights;
  expect(sent[0]).toEqual({ icon: 'snowflake', label: 'Frío de verdad' });
  expect(sent[1]).toEqual(expect.objectContaining({ label: 'Laptop', origin: 'yapi' }));
  expect(sent).toHaveLength(6);
});

describe('product content blocks in the guide', () => {
  const a = '/v1/uploads/11111111-1111-1111-1111-111111111111.jpg', b = '/v1/uploads/22222222-2222-2222-2222-222222222222.jpg';
  const blocks = [
    { id: 'blk_aaaaaaaaaaaa', type: 'media' as const, imageUrl: b, alt: 'Respaldo', caption: '35°' },
    { id: 'blk_bbbbbbbbbbbb', type: 'compare' as const, beforeUrl: a, afterUrl: b, title: 'Reclinación', beforeLabel: 'Recta', afterLabel: '35°', alt: 'Silla' },
  ];
  function edit() {
    const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p' }), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) }, saved = vi.fn();
    const guide = createProductForm(api as unknown as MerchantStudioApi, 's', saved, () => {}, { id: 'p', name: 'Silla', amount: 1000, imageUrls: [a, b], contentBlocks: blocks });
    document.body.append(guide.element);
    const save = () => { for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); };
    return { api, guide, saved, save };
  }
  it('maps every block preview back to its uploaded URL and preserves stable ids', async () => {
    const t = edit();
    const select = t.guide.element.querySelector<HTMLSelectElement>('[data-block-field="imageUrl"]')!;
    expect(select.value).toMatch(/^https?:/); expect(select.value).toContain(b);
    t.save(); await vi.waitFor(() => expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.updateProduct.mock.calls[0][2].contentBlocks).toEqual(blocks);
  });
  it("saves YAPI's long-page sections intact, mapping detail photos back to uploaded URLs", async () => {
    const story = { id: 'blk_cccccccccccc', type: 'story' as const, origin: 'yapi' as const, problem: 'Llevas tres bolsas.', tried: 'La lonchera se derrama.', solution: 'Un solo bolso.' };
    const details = { id: 'blk_dddddddddddd', type: 'details' as const, origin: 'yapi' as const, items: [{ imageUrl: a, title: 'Zona fría', text: 'Abajo.', alt: 'Zona fría abierta' }] };
    const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p' }), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) }, saved = vi.fn();
    const guide = createProductForm(api as unknown as MerchantStudioApi, 's', saved, () => {}, { id: 'p', name: 'Bolso', amount: 1000, imageUrls: [a, b], contentBlocks: [story, details, blocks[0]] } as any);
    document.body.append(guide.element);
    for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.updateProduct.mock.calls[0][2].contentBlocks).toEqual([story, details, blocks[0]]);
  });
  it('regenerates the long page with YAPI on demand, showing what came back, and says so when it fails', async () => {
    const story = { id: 'blk_cccccccccccc', type: 'story' as const, origin: 'yapi' as const, problem: 'Nuevo problema.', tried: 'Lo de antes.', solution: 'La solución.' };
    let finish!: (value: unknown) => void;
    const api = { updateProduct: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }),
      regenerateProductPage: vi.fn(() => new Promise(resolve => { finish = resolve; })) };
    const guide = createProductForm(api as unknown as MerchantStudioApi, 's', vi.fn(), () => {}, { id: 'p', name: 'Bolso', amount: 1000, imageUrls: [a] } as any);
    document.body.append(guide.element);
    const button = guide.element.querySelector<HTMLButtonElement>('[data-page-regenerate]')!;
    button.click();
    expect(api.regenerateProductPage).toHaveBeenCalledWith('s', 'p');
    expect(button.disabled).toBe(true);
    finish({ highlights: [{ icon: 'snowflake', label: 'Frío', origin: 'yapi' }], contentBlocks: [story] });
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(guide.element.querySelector('[data-product-content-blocks]')!.textContent).toContain('Historia');
    api.regenerateProductPage.mockImplementationOnce(() => Promise.reject(new Error('plan down')));
    button.click();
    await vi.waitFor(() => expect(guide.element.querySelector('[data-page-regenerate-status]')!.textContent).toContain('No se pudo generar'));
    expect(createProductForm(api as unknown as MerchantStudioApi, 's', vi.fn(), () => {}).element.querySelector('[data-page-regenerate]')).toBeNull();
  });
  it('never regenerates over unsaved changes, and says the new page is already live', async () => {
    const story = { id: 'blk_cccccccccccc', type: 'story' as const, origin: 'yapi' as const, problem: 'Problema.', tried: 'Antes.', solution: 'Solución.' };
    const api = { updateProduct: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }), regenerateProductPage: vi.fn().mockResolvedValue({ highlights: [], contentBlocks: [story] }) };
    const guide = createProductForm(api as unknown as MerchantStudioApi, 's', vi.fn(), () => {}, { id: 'p', name: 'Bolso', amount: 1000, imageUrls: [a], contentBlocks: [story] } as any);
    document.body.append(guide.element);
    const status = () => guide.element.querySelector('[data-page-regenerate-status]')!.textContent;
    const field = guide.element.querySelector<HTMLTextAreaElement>('[data-block-field="problem"]')!;
    field.value = 'Lo escribí yo.'; field.dispatchEvent(new Event('input', { bubbles: true }));
    guide.element.querySelector<HTMLButtonElement>('[data-page-regenerate]')!.click();
    expect(api.regenerateProductPage).not.toHaveBeenCalled();
    expect(status()).toContain('Guarda tus cambios');
    field.value = 'Problema.'; field.dispatchEvent(new Event('input', { bubbles: true }));
    // Typing the old text back still counts as an edit (the section is now the merchant's), so it stays protected.
    guide.element.querySelector<HTMLButtonElement>('[data-page-regenerate]')!.click();
    expect(api.regenerateProductPage).not.toHaveBeenCalled();
    const clean = createProductForm(api as unknown as MerchantStudioApi, 's', vi.fn(), () => {}, { id: 'p', name: 'Bolso', amount: 1000, imageUrls: [a], contentBlocks: [story] } as any);
    document.body.append(clean.element);
    clean.element.querySelector<HTMLButtonElement>('[data-page-regenerate]')!.click();
    await vi.waitFor(() => expect(clean.element.querySelector('[data-page-regenerate-status]')!.textContent).toContain('ya está en tu tienda'));
  });
  it('blocks saving after a block photo was removed from the pool', () => {
    const t = edit(); t.guide.element.querySelectorAll<HTMLButtonElement>('[data-remove-photo]')[1].click(); t.save();
    expect(t.guide.element.querySelector('[data-product-error]')!.textContent).toContain('Una foto de un bloque fue retirada');
    expect(t.api.updateProduct).not.toHaveBeenCalled();
  });
  it('sends an empty array when the last saved block is deleted', async () => {
    const t = edit();
    t.guide.element.querySelector<HTMLButtonElement>('[data-block-delete]')!.click();
    t.guide.element.querySelector<HTMLButtonElement>('[data-block-delete]')!.click();
    t.save(); await vi.waitFor(() => expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.updateProduct.mock.calls[0][2].contentBlocks).toEqual([]);
  });
});

describe('boxes filled with catalog products', () => {
  const catalog = { items: [
    { id: 'matcha', name: 'Matcha', amount: 2200, imageUrls: ['/v1/uploads/matcha.jpg'], variants: [], extras: [] },
    { id: 'pistacho', name: 'Pistacho', amount: 2200, imageUrls: [], variants: [], extras: [] },
    { id: 'sized', name: 'Taza por tamaño', amount: 5000, imageUrls: [], variants: [{ id: 's', name: 'S', amount: 5000 }], extras: [] },
    { id: 'box-6', name: 'Caja de 6', amount: 11500, imageUrls: [], variants: [], extras: [] },
  ] };
  const toStep6 = (t: ReturnType<typeof setup>) => { t.fill('name', 'Caja de 6'); t.next(); t.next(); t.fill('price', '115'); while (t.step() !== 'Paso 6 de 8') t.next(); };
  const toggleBox = async (t: ReturnType<typeof setup>) => {
    t.field('isBox').checked = true; t.field('isBox').dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(t.guide.element.querySelectorAll('[name="boxProduct"]').length).toBeGreaterThan(0));
  };

  it('lets the owner choose which simple products go in the box and how many the shopper picks', async () => {
    const t = setup(); Object.assign(t.api, { sourceCatalog: vi.fn().mockResolvedValue(catalog) });
    toStep6(t); await toggleBox(t);
    const choices = [...t.guide.element.querySelectorAll<HTMLInputElement>('[name="boxProduct"]')];
    expect(choices.map(input => input.value)).toEqual(['matcha', 'pistacho', 'box-6']);
    t.next(); expect(t.guide.element.querySelector('[data-product-error]')!.textContent).toBe('Elige al menos un producto para la caja.');
    choices[0].checked = true; choices[1].checked = true;
    t.fill('boxPickCount', '6'); t.fill('boxGroupName', 'Sabores');
    t.next(); t.next(); expect(t.step()).toBe('Paso 8 de 8');
    expect(t.guide.element.querySelector('[data-product-review]')!.textContent).toContain('Caja: el cliente elige 6 entre 2 productos');
    t.next(); await vi.waitFor(() => expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.createProduct.mock.calls[0][1].extras).toEqual([
      { name: 'Matcha', amount: 0, groupName: 'Sabores', freeAllowance: 0, pickCount: 6, productId: 'matcha' },
      { name: 'Pistacho', amount: 0, groupName: 'Sabores', freeAllowance: 0, pickCount: 6, productId: 'pistacho' },
    ]);
  });

  it('keeps a saved box, and turning it off empties the box', async () => {
    const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'box-6' }), createProduct: vi.fn(), upload: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }), sourceCatalog: vi.fn().mockResolvedValue(catalog) }, saved = vi.fn();
    const initial = { id: 'box-6', name: 'Caja de 6', amount: 11500, stock: null, imageUrls: [], extras: [
      { id: 'x1', name: 'Matcha', amount: 0, required: false, groupName: 'Sabores', freeAllowance: 0, pickCount: 6, productId: 'matcha' },
    ] };
    const guide = createProductForm(api as unknown as MerchantStudioApi, 'store-b', saved, () => {}, initial as any); document.body.append(guide.element);
    const form = guide.element.querySelector('form')!, next = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const isBox = guide.element.querySelector<HTMLInputElement>('[name="isBox"]')!;
    expect(isBox.checked).toBe(true);
    await vi.waitFor(() => expect(guide.element.querySelector<HTMLInputElement>('[name="boxProduct"][value="matcha"]')!.checked).toBe(true));
    expect(guide.element.querySelector<HTMLInputElement>('[name="boxProduct"][value="box-6"]')).toBeNull();
    expect(guide.element.querySelector<HTMLInputElement>('[name="boxPickCount"]')!.value).toBe('6');
    isBox.checked = false; isBox.dispatchEvent(new Event('change'));
    while (guide.element.querySelector('[data-product-step]')!.textContent !== 'Paso 8 de 8') next();
    next(); await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(api.updateProduct.mock.calls[0][2].extras).toEqual([]);
  });

  it('does not offer a box for a product whose extras are managed elsewhere', () => {
    const api = { updateProduct: vi.fn(), createProduct: vi.fn(), upload: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }), sourceCatalog: vi.fn() };
    const guide = createProductForm(api as unknown as MerchantStudioApi, 'store-b', () => {}, () => {}, { id: 'pizza', name: 'Pizza', amount: 8000, extras: [{ id: 'q', name: 'Queso', amount: 500, required: true }] } as any);
    expect(guide.element.querySelector<HTMLInputElement>('[name="isBox"]')!.disabled).toBe(true);
    expect(guide.element.querySelector('[data-box-locked]')!.textContent).toContain('extras');
  });
});

describe('SIN classification for electronic invoices', () => {
  function fiscalSetup(ready: boolean, initial?: Parameters<typeof createProductForm>[4]) {
    const api = {
      createProduct: vi.fn().mockResolvedValue({ id: 'p1' }), updateProduct: vi.fn().mockResolvedValue({ id: 'p1', name: 'x' }), upload: vi.fn(),
      suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }),
      productFiscalReady: vi.fn().mockResolvedValue(ready),
      siatActivities: vi.fn().mockResolvedValue({ total: 1, entries: [{ codigoCaeb: '477210', descripcion: 'VENTA DE CALZADO' }] }),
      siatUnits: vi.fn().mockResolvedValue({ total: 1, entries: [{ codigoClasificador: 58, descripcion: 'UNIDAD' }] }),
      siatProducts: vi.fn().mockResolvedValue({ total: 1, entries: [{ codigoProducto: 123456, descripcionProducto: 'CALZADO' }] }),
    }, saved = vi.fn();
    const guide = createProductForm(api as unknown as MerchantStudioApi, 'store-two', saved, vi.fn(), initial); document.body.append(guide.element);
    const $ = <T extends Element>(selector: string) => guide.element.querySelector<T>(selector)!;
    const choose = (name: string, value: string) => { const field = $<HTMLSelectElement>(`[name="${name}"]`); field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); };
    const next = () => $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const toReview = () => { const name = $<HTMLInputElement>('[name="name"]'); if (!name.value) { name.value = 'Nike Air Max 90'; name.dispatchEvent(new Event('input', { bubbles: true })); } next(); next(); $<HTMLInputElement>('[name="price"]').value = '850'; for (let i = 0; i < 5; i++) next(); };
    return { api, saved, $, choose, next, toReview };
  }

  it('stays out of the way for stores that do not invoice, and saves nothing fiscal', async () => {
    const t = fiscalSetup(false); t.toReview();
    await vi.waitFor(() => expect(t.api.productFiscalReady).toHaveBeenCalledWith('store-two'));
    expect(t.$<HTMLDetailsElement>('[data-product-fiscal]').hidden).toBe(true);
    t.next(); await vi.waitFor(() => expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.createProduct.mock.calls[0][1]).not.toHaveProperty('actividadEconomica');
    expect(t.api.siatActivities).not.toHaveBeenCalled();
  });

  it('classifies a product from the taxpayer-scoped SIN catalogs', async () => {
    const t = fiscalSetup(true); t.toReview();
    const fiscal = t.$<HTMLDetailsElement>('[data-product-fiscal]');
    await vi.waitFor(() => expect(fiscal.hidden).toBe(false));
    fiscal.open = true; fiscal.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(t.$<HTMLSelectElement>('[name="actividadEconomica"]').disabled).toBe(false));
    t.$<HTMLInputElement>('[name="codigoProducto"]').value = 'NIKE-AM90';
    t.choose('actividadEconomica', '477210');
    await vi.waitFor(() => expect(t.$<HTMLSelectElement>('[name="codigoProductoSin"]').disabled).toBe(false));
    expect(t.api.siatProducts).toHaveBeenCalledWith('477210', '');
    t.choose('codigoProductoSin', '123456');
    t.next();
    expect(t.$('[data-product-error]').textContent).toContain('elige actividad, clasificación y unidad');
    expect(t.api.createProduct).not.toHaveBeenCalled();
    t.choose('unidadMedida', '58');
    t.next(); await vi.waitFor(() => expect(t.saved).toHaveBeenCalledOnce());
    expect(t.api.createProduct.mock.calls[0][1]).toMatchObject({ codigoProducto: 'NIKE-AM90', actividadEconomica: '477210', codigoProductoSin: '123456', unidadMedida: 58 });
  });

  it('reopens the saved classification when a product is edited', async () => {
    const t = fiscalSetup(true, { id: 'p1', name: 'Nike Air Max 90', amount: 85000, codigoProducto: 'NIKE-AM90', actividadEconomica: '477210', codigoProductoSin: '123456', unidadMedida: 58 });
    await vi.waitFor(() => expect(t.$<HTMLSelectElement>('[name="codigoProductoSin"]').value).toBe('123456'));
    expect(t.$<HTMLDetailsElement>('[data-product-fiscal]').open).toBe(true);
    expect(t.$<HTMLSelectElement>('[name="actividadEconomica"]').value).toBe('477210');
    expect(t.$<HTMLSelectElement>('[name="unidadMedida"]').value).toBe('58');
    expect(t.$<HTMLInputElement>('[name="codigoProducto"]').value).toBe('NIKE-AM90');
  });
});
