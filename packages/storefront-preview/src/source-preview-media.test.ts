import { afterEach, describe, expect, it, vi } from 'vitest';
import { compactPreviewImageData, createPreviewImageLoader } from './source-preview-media';
import type { SourceSnapshot } from './source-preview';

afterEach(() => vi.unstubAllGlobals());
describe('preview variant photography', () => {
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
