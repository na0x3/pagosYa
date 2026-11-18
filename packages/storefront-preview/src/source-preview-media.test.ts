import { afterEach, describe, expect, it, vi } from 'vitest';
import { compactPreviewImageData, createPreviewImageLoader, hostedCatalogImages, PREVIEW_EMBED_BYTES } from './source-preview-media';
import type { SourceSnapshot } from './source-preview';

afterEach(() => vi.unstubAllGlobals());
describe('preview variant photography', () => {
  it('hydrates every content block photo and uses absolute platform URLs in hosted mode', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = ''; onload?: () => void;
      readAsDataURL(blob: Blob) { void blob.text().then(value => { this.result = 'data:' + value; this.onload?.(); }); }
    });
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(new Blob([url], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } }))));
    const a = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg', b = '/v1/uploads/bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const data = { items: [{ variants: [{ imageUrl: a, imageUrls: [a, b] }], contentBlocks: [{ type: 'media', imageUrl: a }, { type: 'compare', beforeUrl: a, afterUrl: b }, { type: 'details', items: [{ imageUrl: b, title: 'Mercado', alt: 'Mercado' }] }] }] };
    const result = await createPreviewImageLoader('http://localhost:3001/v1')({ files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ data })};` }] } as SourceSnapshot);
    const item = JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, '')).data.items[0];
    expect(item.contentBlocks[0].imageUrl).toBe('data:http://localhost:3001' + a);
    expect(item.contentBlocks[1]).toMatchObject({ beforeUrl: 'data:http://localhost:3001' + a, afterUrl: 'data:http://localhost:3001' + b });
    // YAPI's long product page keeps its photos one level down, in details items.
    expect(item.contentBlocks[2].items[0].imageUrl).toBe('data:http://localhost:3001' + b);
    const hosted = hostedCatalogImages('https://api.test/v1').rewrite(data).items[0];
    expect(hosted.variants[0].imageUrls).toEqual(['https://api.test' + a, 'https://api.test' + b]);
    expect(hosted.contentBlocks[0].imageUrl).toBe('https://api.test' + a);
    expect(hosted.contentBlocks[1]).toMatchObject({ beforeUrl: 'https://api.test' + a, afterUrl: 'https://api.test' + b });
    expect(hosted.contentBlocks[2].items?.[0]?.imageUrl).toBe('https://api.test' + b);
  });
  // Remolino 2026-10-25: the menu's «Más para explorar» tiles keep their photos in config.header.menu, outside data.
  it('inlines upload photos anywhere else in config.js, such as the menu tiles', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = ''; onload?: () => void;
      readAsDataURL(blob: Blob) { void blob.text().then(value => { this.result = 'data:' + value; this.onload?.(); }); }
    });
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(new Blob([url], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } }))));
    const tile = 'http://localhost:3001/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const config = { data: { items: [] }, header: { menu: { groups: [{ label: 'Club', tiles: [{ label: 'Club Remolino', image: tile, href: 'product.html' }] }] } } };
    const result = await createPreviewImageLoader('http://localhost:3001/v1')({ files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` }] } as SourceSnapshot);
    const parsed = JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
    expect(parsed.header.menu.groups[0].tiles[0].image).toBe('data:' + tile);
    expect(parsed.header.menu.groups[0].tiles[0].href).toBe('product.html');
  });
  // The calm checkout draws the store's logo from config data; left as a URL it was blocked in the check frame, and
  // every store with a logo failed «Imágenes cargadas» on checkout.html (Remolino 2026-10-21).
  it('inlines the store logo kept in config data', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = ''; onload?: () => void;
      readAsDataURL(blob: Blob) { void blob.text().then(value => { this.result = 'data:' + value; this.onload?.(); }); }
    });
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(new Blob([url], { type: 'image/webp' }), { headers: { 'content-type': 'image/webp' } }))));
    const logo = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp';
    const result = await createPreviewImageLoader('http://localhost:3001/v1')({ files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ data: { logoUrl: logo, items: [] } })};` }] } as SourceSnapshot);
    expect(JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, '')).data.logoUrl).toBe('data:http://localhost:3001' + logo);
  });
  // The API restarts on every save and stalls during long YAPI builds; one failed fetch left the logo as a blocked
  // upload URL, a broken image with its alt text beside it (owner 2026-10-24, Remolino in the editor).
  it('retries an upload the API could not serve before giving up on it', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = ''; onload?: () => void;
      readAsDataURL(blob: Blob) { void blob.text().then(value => { this.result = 'data:' + value; this.onload?.(); }); }
    });
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => ++calls < 3
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(new Response(new Blob([url], { type: 'image/webp' }), { headers: { 'content-type': 'image/webp' } }))));
    const logo = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp';
    const pending = createPreviewImageLoader('http://localhost:3001/v1')({ files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ data: { logoUrl: logo, items: [] } })};` }] } as SourceSnapshot);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    vi.useRealTimers();
    expect(calls).toBe(3);
    expect(JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, '')).data.logoUrl).toBe('data:http://localhost:3001' + logo);
  });
  // A template's photo slots are string literals in its compiled components, not catalog data; the sandbox cannot
  // fetch them, so a template applied to a store showed its hero as a broken image.
  it('inlines upload photos quoted in compiled pages, leaving everything else alone', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = ''; onload?: () => void;
      readAsDataURL(blob: Blob) { void blob.text().then(value => { this.result = 'data:' + value; this.onload?.(); }); }
    });
    const fetch = vi.fn((url: string) => Promise.resolve(new Response(new Blob([url], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } })));
    vi.stubGlobal('fetch', fetch);
    const hero = 'http://localhost:3001/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const compiled = `const photos={"hero":"${hero}","detail":"assets/template-barrio-detail.jpg"};const again='${hero}';const bg="url(${hero})";`;
    const result = await createPreviewImageLoader('http://localhost:3001/v1')({ files: [
      { path: '_compiled/home.js', content: compiled },
      { path: 'notes.txt', content: `"${hero}"` },
      { path: 'assets/photo.jpg', content: 'AAAA', encoding: 'base64' },
    ] } as SourceSnapshot);
    const page = result.files.find(file => file.path === '_compiled/home.js')!.content;
    expect(page).toContain('"hero":"data:' + hero + '"');
    expect(page).toContain(`'data:${hero}'`);
    expect(page).toContain('url(data:' + hero + ')');
    expect(page).toContain('"assets/template-barrio-detail.jpg"');
    // One fetch per photo, however often it is quoted, and only text pages are read.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.files.find(file => file.path === 'notes.txt')!.content).toBe(`"${hero}"`);
  });
  it('keeps a large variant grid compact without changing the runtime catalog', () => {
    const image = 'data:image/jpeg;base64,' + 'abcd'.repeat(10000);
    const config = { data:{items:[{name:'Suéter',imageUrls:[image],variants:Array.from({length:60},(_,i)=>({id:String(i),imageUrl:image}))}]} };
    const compact = compactPreviewImageData('window.PAGOSYA_CONFIG = ' + JSON.stringify(config) + ';');
    expect(compact.length).toBeLessThan(image.length + 6000);
    const target: {PAGOSYA_CONFIG?: unknown} = {};
    // Evaluating the shipped runtime string is what this test checks.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('window', compact)(target);
    expect(target.PAGOSYA_CONFIG).toEqual(config);
    expect(compactPreviewImageData('window.PAGOSYA_CONFIG = unsafe();')).toBe('window.PAGOSYA_CONFIG = unsafe();');
  });
  it('embeds matching gallery and variant photos once, including variants without galleries', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = 'data:image/jpeg;base64,cGhvdG8=';
      onload?: () => void;
      readAsDataURL() { queueMicrotask(() => this.onload?.()); }
    });
    const fetch = vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type:'image/jpeg' }), { headers: { 'content-type':'image/jpeg' } }));
    vi.stubGlobal('fetch', fetch);
    const url = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const snapshot = { files: [{ path:'config.js', content:'window.PAGOSYA_CONFIG = ' + JSON.stringify({ data:{items:[{imageUrls:[url],variants:[{imageUrl:'http://localhost:3001'+url},{imageUrl:url}]},{variants:[{imageUrl:url}],extras:[{id:'x',name:'Matcha',imageUrl:url}]}]} }) + ';' }] } as SourceSnapshot;
    const result = await createPreviewImageLoader('http://localhost:3001/v1')(snapshot);
    const config = JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
    const [first, second] = config.data.items;
    expect(first.imageUrls[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(first.variants.map((v: {imageUrl:string}) => v.imageUrl)).toEqual([first.imageUrls[0], first.imageUrls[0]]);
    expect(second.variants[0].imageUrl).toBe(first.imageUrls[0]);
    expect(second.extras[0].imageUrl).toBe(first.imageUrls[0]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(snapshot.files[0].content).not.toContain('data:image');
  });
  it('hydrates every photo in a variant photo set', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5175' });
    vi.stubGlobal('FileReader', class {
      result = 'data:image/jpeg;base64,cGhvdG8=';
      onload?: () => void;
      readAsDataURL() { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(new Blob(['photo'], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } }))));
    const a = '/v1/uploads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const b = '/v1/uploads/bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
    const snapshot = { files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ data: { items: [{ variants: [{ imageUrl: a, imageUrls: [a, b] }] }] } })};` }] } as SourceSnapshot;
    const result = await createPreviewImageLoader('http://localhost:3001/v1')(snapshot);
    const config = JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, ''));
    const variant = config.data.items[0].variants[0];
    expect(variant.imageUrls).toEqual(['data:image/jpeg;base64,cGhvdG8=', 'data:image/jpeg;base64,cGhvdG8=']);
    expect(variant.imageUrls[0]).toBe(variant.imageUrl);
  });
  it('does not fetch arbitrary external variant image URLs', async () => {
    vi.stubGlobal('location', { href:'http://localhost:5175' });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const snapshot = { files: [{path:'config.js',content:'window.PAGOSYA_CONFIG = {"data":{"items":[{"variants":[{"imageUrl":"https://example.org/sweater.jpg"}]}]}};'}] } as SourceSnapshot;
    await createPreviewImageLoader('http://localhost:3001/v1')(snapshot);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// Copy a store 2026-11-17: Graza's 225 photos embedded made a page too big for the browser («Invalid string length»).
it('embeds covers first and leaves photos past the room as upload links', async () => {
  vi.stubGlobal('location', { href: 'http://localhost:5175' });
  vi.stubGlobal('FileReader', class {
    result = ''; onload?: () => void;
    readAsDataURL(blob: Blob) { void blob.text().then(value => { this.result = 'data:' + value; this.onload?.(); }); }
  });
  const big = new Uint8Array(PREVIEW_EMBED_BYTES / 3 + 1);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob([big], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } }))));
  const photo = (n: number) => `/v1/uploads/${n}aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;
  const data = { items: [{ imageUrls: [photo(1), photo(2)] }, { imageUrls: [photo(3)] }] };
  const result = await createPreviewImageLoader('http://localhost:3001/v1')({ files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ data })};` }] } as SourceSnapshot);
  const items = JSON.parse(result.files[0].content.replace('window.PAGOSYA_CONFIG = ', '').replace(/;$/, '')).data.items;
  expect(items[0].imageUrls[0]).toMatch(/^data:/);
  expect(items[1].imageUrls[0]).toMatch(/^data:/);
  expect(items[0].imageUrls[1]).toBe('http://localhost:3001/v1/uploads/2aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg');
});
