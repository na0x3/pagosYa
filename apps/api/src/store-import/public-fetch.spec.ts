import { fetchPublic, PublicFetchError, type PublicTransport } from './public-fetch';

const resolve = jest.fn(async () => [{ address: '23.227.38.65', family: 4 }]) as any;
const reply = (status: number, extra: Partial<{ contentType: string; location: string; body: string }> = {}) =>
  ({ status, contentType: extra.contentType ?? 'application/json', location: extra.location, body: Buffer.from(extra.body ?? '{}') });

describe('fetchPublic', () => {
  beforeEach(() => resolve.mockClear());

  it('follows up to three redirects, re-validating each hop, and returns the final URL', async () => {
    const transport: PublicTransport = jest.fn()
      .mockResolvedValueOnce(reply(301, { location: 'https://www.shop.example/meta.json' }))
      .mockResolvedValueOnce(reply(302, { location: '/meta.json?x=1' }))
      .mockResolvedValueOnce(reply(200, { body: '{"ok":true}' }));
    const response = await fetchPublic('https://shop.example/meta.json', { accept: 'application/json', maxBytes: 1000 }, { resolve, transport });
    expect(response.url.href).toBe('https://www.shop.example/meta.json?x=1');
    expect(JSON.parse(response.body.toString())).toEqual({ ok: true });
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('refuses a fourth redirect and any redirect to http or a private address', async () => {
    const loop: PublicTransport = jest.fn(async () => reply(302, { location: 'https://shop.example/again' }));
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve, transport: loop })).rejects.toMatchObject({ code: 'too_many_redirects' });
    const toHttp: PublicTransport = jest.fn(async () => reply(301, { location: 'http://shop.example/' }));
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve, transport: toHttp })).rejects.toMatchObject({ code: 'blocked' });
    const privateResolve = jest.fn(async () => { throw new Error('private'); }) as any;
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve: privateResolve, transport: loop })).rejects.toMatchObject({ code: 'blocked' });
  });

  it('holds allowHost on every hop, so a redirect cannot leave the allowed hosts', async () => {
    const away: PublicTransport = jest.fn(async () => reply(302, { location: 'https://elsewhere.example/a.png' }));
    await expect(fetchPublic('https://cdn.shopify.com/a.png', { accept: '*/*', maxBytes: 10, allowHost: host => host === 'cdn.shopify.com' }, { resolve, transport: away })).rejects.toMatchObject({ code: 'blocked' });
    expect(away).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('turns a transport failure into unreachable', async () => {
    const broken: PublicTransport = jest.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve, transport: broken })).rejects.toMatchObject({ code: 'unreachable' });
  });
});
