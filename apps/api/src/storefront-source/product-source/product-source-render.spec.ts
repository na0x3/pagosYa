import { productRenderRequestKind } from './product-source-render';

describe('productRenderRequestKind (spec 2026-10-18 product link store)', () => {
  const page = 'https://shop.example.com/products/x';
  it('answers the page, its assets and its data GETs', () => {
    expect(productRenderRequestKind('GET', 'document', page, page, true)).toBe('html');
    expect(productRenderRequestKind('GET', 'script', 'https://cdn.example.com/a.js', page, true)).toBe('script');
    expect(productRenderRequestKind('GET', 'fetch', 'https://shop.example.com/api/product.json', page, true)).toBe('data');
    expect(productRenderRequestKind('GET', 'xhr', 'https://shop.example.com/api/p', page, true)).toBe('data');
  });
  it('refuses writes, private addresses, frames and other documents', () => {
    expect(productRenderRequestKind('POST', 'fetch', 'https://shop.example.com/api', page, true)).toBeNull();
    expect(productRenderRequestKind('GET', 'fetch', 'http://127.0.0.1:3001/v1/merchants', page, true)).toBeNull();
    expect(productRenderRequestKind('GET', 'fetch', 'http://localhost/x', page, true)).toBeNull();
    expect(productRenderRequestKind('GET', 'document', 'https://other.example.com/', page, false)).toBeNull();
  });
});
