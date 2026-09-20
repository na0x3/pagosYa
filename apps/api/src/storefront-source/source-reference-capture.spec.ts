import { chromium } from 'playwright';
import { captureSourceReference, sourceReferenceRequestKind, SOURCE_REFERENCE_CSP } from './source-reference-capture';
import { readSourceReferenceResource } from './source-website-fetch';
jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));
jest.mock('./source-website-fetch', () => ({ readSourceReferenceResource: jest.fn() }));

it.each([
  ['POST', 'document', 'https://example.com/'], ['GET', 'document', 'https://other.example.com/'],
  ['GET', 'fetch', 'https://example.com/'], ['GET', 'xhr', 'https://example.com/'],
  ['GET', 'media', 'https://example.com/movie.mp4'], ['GET', 'image', 'http://example.com/image'],
  ['GET', 'script', 'file:///etc/passwd'], ['GET', 'image', 'https://127.0.0.1/image'],
  ['GET', 'font', 'https://user:password@example.com/font'], ['GET', 'stylesheet', 'https://example.com:8443/style'],
])('blocks %s %s %s before remote fetching', (method, type, url) => {
  expect(sourceReferenceRequestKind(method, type, url, 'https://example.com/', true)).toBeNull();
});
it('only allows the initial main document and typed HTTPS render resources', () => {
  expect(sourceReferenceRequestKind('GET', 'document', 'https://example.com/', 'https://example.com/', false)).toBeNull();
  expect(sourceReferenceRequestKind('GET', 'document', 'https://example.com/', 'https://example.com/', true)).toBe('html');
  expect(sourceReferenceRequestKind('GET', 'image', 'https://cdn.example.com/image', 'https://example.com/', true)).toBe('image');
  expect(SOURCE_REFERENCE_CSP).toContain("connect-src 'none'");
  expect(SOURCE_REFERENCE_CSP).toContain("worker-src 'none'");
  expect(SOURCE_REFERENCE_CSP).toContain("frame-src 'none'");
});

it('captures labeled pixels via pinned fulfillment with blocked browser transport and no inherited secrets', async () => {
  jest.mocked(readSourceReferenceResource).mockResolvedValue({ url: 'https://example.com/', contentType: 'text/html', body: Buffer.from('<h1>Example</h1>') });
  let handler: any;
  const fulfilled = jest.fn().mockResolvedValue(undefined), aborted = jest.fn().mockResolvedValue(undefined);
  const page: any = { on: jest.fn(), setViewportSize: jest.fn(), close: jest.fn(), screenshot: jest.fn().mockResolvedValue(Buffer.from('pixels')) };
  const frame: any = { page: () => page }; page.mainFrame = () => frame;
  page.evaluate = jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(900).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ y: 0, missingImages: 0 }).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ y: 56, missingImages: 0 })
    .mockResolvedValueOnce(undefined).mockResolvedValueOnce(844).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ y: 0, missingImages: 0 });
  page.goto = jest.fn(async () => {
    for (const [type, url] of [['document', 'https://example.com/'], ['fetch', 'https://example.com/private'], ['image', 'https://127.0.0.1/secret']]) {
      await handler({ request: () => ({ method: () => 'GET', resourceType: () => type, url: () => url, frame: () => frame }), fulfill: fulfilled, abort: aborted });
    }
    return { ok: () => true };
  });
  const context = { routeWebSocket: jest.fn(), route: jest.fn(async (_: string, fn: any) => { handler = fn; }), newPage: jest.fn().mockResolvedValue(page) };
  const browser = { newContext: jest.fn().mockResolvedValue(context), close: jest.fn().mockResolvedValue(undefined) };
  jest.mocked(chromium.launch).mockResolvedValue(browser as any);
  const result = await captureSourceReference('https://example.com');
  expect(result.status).toBe('captured');
  expect(result.captures.map(c => [c.viewport, c.y])).toEqual([['desktop', 0], ['desktop', 56], ['mobile', 0]]);
  expect(result.captures[0].image).toBe('data:image/jpeg;base64,cGl4ZWxz');
  expect(readSourceReferenceResource).toHaveBeenCalledTimes(2);
  expect(aborted).toHaveBeenCalledTimes(4);
  expect(fulfilled.mock.calls[0][0].headers['Content-Security-Policy']).toBe(SOURCE_REFERENCE_CSP);
  const launch = jest.mocked(chromium.launch).mock.calls[0][0]!;
  expect(launch.proxy?.server).toBe('http://127.0.0.1:9');
  expect(Object.keys(launch.env!)).not.toContain('OPENAI_API_KEY');
  expect(launch.chromiumSandbox).toBe(true);
  expect(browser.newContext).toHaveBeenCalledWith(expect.objectContaining({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] }));
  expect(browser.close).toHaveBeenCalled();
});
it('reports renderer failure as unavailable without invented screenshots', async () => {
  jest.mocked(chromium.launch).mockRejectedValue(new Error('No browser installed'));
  expect(await captureSourceReference('https://example.com')).toMatchObject({ status: 'unavailable', captures: [] });
});
