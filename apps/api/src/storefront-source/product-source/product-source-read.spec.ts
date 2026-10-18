import { readProductSource, type ProductSourceDeps } from './product-source-read';

const product = '<script type="application/ld+json">{"@type":"Product","name":"Licuadora","image":["https://cdn.shop.com/a.jpg","https://cdn.shop.com/b.jpg"],"offers":{"price":"25","priceCurrency":"USD"}}</script>';
const link = { url: 'https://shop.com/products/licuadora', host: 'shop.com', social: false };
const page = (html: string, status = 200, url = link.url) => async () => ({ url, html, status });
const never = async () => { throw new Error('not reached'); };

describe('readProductSource (spec 2026-10-18 product link store)', () => {
  it('stops at the plain fetch when it finds the product', async () => {
    const result = await readProductSource(link, { fetch: page(product), render: never });
    expect(result).toMatchObject({ ok: true, tier: 'fetch', listing: { name: 'Licuadora', price: 25, currency: 'USD' } });
  });

  it('renders the page when the plain fetch shows no product (AliExpress)', async () => {
    const result = await readProductSource(link, { fetch: page('<title></title>'), render: page(product, 200, 'https://shop.com/products/licuadora?x=1') });
    expect(result).toMatchObject({ ok: true, tier: 'browser', listing: { url: 'https://shop.com/products/licuadora?x=1' } });
  });

  it('keeps a thin listing while the browser tries for the whole one', async () => {
    const thin = '<meta property="og:title" content="Licuadora"><meta property="og:image" content="https://cdn.shop.com/og.jpg">';
    expect(await readProductSource(link, { fetch: page(thin), render: page(product) })).toMatchObject({ ok: true, tier: 'browser', listing: { price: 25 } });
    expect(await readProductSource(link, { fetch: page(thin), render: page('<title>Captcha</title>') })).toMatchObject({ ok: true, tier: 'fetch', listing: { name: 'Licuadora', price: null } });
  });

  it('never fetches a social link', async () => {
    expect(await readProductSource({ url: 'https://www.facebook.com/marketplace/item/1', host: 'www.facebook.com', social: true }, { fetch: never, render: never })).toEqual({ ok: false, reason: 'login' });
  });

  it('names why it failed: login, blocked, not a product, unavailable', async () => {
    expect(await readProductSource(link, { fetch: page('<title>Temu | Login</title>', 200, 'https://www.temu.com/login.html'), render: async () => null })).toEqual({ ok: false, reason: 'login' });
    expect(await readProductSource(link, { fetch: page('', 403), render: page('<title>Just a moment...</title>', 403) })).toEqual({ ok: false, reason: 'blocked' });
    expect(await readProductSource(link, { fetch: page('<title>Inicio</title>'), render: page('<title>Inicio</title>') })).toEqual({ ok: false, reason: 'not-product' });
    expect(await readProductSource(link, { fetch: async () => null, render: async () => { throw new Error('crash'); } })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('tries the paid service last, only when it is set up', async () => {
    const deps: ProductSourceDeps = { fetch: page('', 403), render: page('<title>Captcha</title>'), proxyTemplate: 'https://127.0.0.1/?url={url}' };
    // The service URL is private here, so the safe fetcher refuses it: the result stays the earlier block.
    expect(await readProductSource(link, deps)).toEqual({ ok: false, reason: 'blocked' });
  });
});
