import { EventEmitter } from 'node:events';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { readSourceWebsite } from './source-website-fetch';
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ request: jest.fn() }));

type Reply = { status?: number; headers?: Record<string, string>; content?: string };
function responses(...replies: Reply[]) {
  jest.mocked(request).mockImplementation(((url: URL, options: any, onResponse: any) => {
    expect(options.headers.Cookie).toBeUndefined();
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.agent).toBe(false);
    const cb = jest.fn(); options.lookup(url.hostname, {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    const reply = replies.shift()!;
    const req: any = new EventEmitter();
    req.destroy = (error?: Error) => { if (error) req.emit('error', error); req.emit('close'); };
    req.end = () => {
      const res: any = new EventEmitter(); res.statusCode = reply.status || 200; res.headers = reply.headers || { 'content-type': 'text/html' };
      res.destroy = jest.fn(); onResponse(res);
      if (!res.destroy.mock.calls.length) { res.emit('data', Buffer.from(reply.content || '<h1>Reference</h1>')); res.emit('end'); }
      req.emit('close');
    };
    return req;
  }) as any);
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
});
const read = (url = 'https://example.com', kind: 'html' | 'css' = 'html') => readSourceWebsite(url, kind, AbortSignal.timeout(1000));

it.each(['http://example.com', 'https://127.0.0.1', 'https://[::1]', 'https://user:password@example.com', 'https://example.com:8443', 'file:///etc/passwd'])('rejects unsafe URL %s before connecting', async url => {
  await expect(read(url)).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
});
it.each(['127.0.0.1', '10.0.1.2', '169.254.169.254', '100.64.0.1', '192.168.1.2', '172.16.0.1'])('rejects private DNS address %s', async address => {
  jest.mocked(lookup).mockResolvedValue([{ address, family: 4 }] as any);
  await expect(read()).rejects.toThrow('sitio público'); expect(request).not.toHaveBeenCalled();
});
it('pins each public redirect destination and resolves relative redirects', async () => {
  responses({ status: 302, headers: { location: '/new' } }, { status: 301, headers: { location: 'https://cdn.example.com/final' } }, {});
  expect(await read()).toEqual({ url: 'https://cdn.example.com/final', content: '<h1>Reference</h1>' });
  expect(lookup).toHaveBeenCalledTimes(3);
});
it('rejects redirect DNS rebinding before making the second connection', async () => {
  jest.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any);
  responses({ status: 302, headers: { location: 'https://internal.example.com' } });
  await expect(read()).rejects.toThrow('sitio público'); expect(request).toHaveBeenCalledTimes(1);
});
it('rejects insecure redirect targets and redirect loops', async () => {
  responses({ status: 302, headers: { location: 'http://example.com' } });
  await expect(read()).rejects.toThrow('HTTPS');
  responses(...Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/loop' } })));
  await expect(read()).rejects.toThrow('Too many');
});
it('limits HTML and CSS response sizes and rejects nonmatching content types', async () => {
  responses({ content: 'a'.repeat(1_000_001) }); await expect(read()).rejects.toThrow('unavailable');
  responses({ headers: { 'content-type': 'text/css' }, content: 'a'.repeat(300_001) }); await expect(read(undefined, 'css')).rejects.toThrow('unavailable');
  responses({ headers: { 'content-type': 'application/javascript' } }); await expect(read()).rejects.toThrow('unavailable');
  responses({ status: 403 }); await expect(read()).rejects.toThrow('unavailable');
});
it('shares the deadline with DNS resolution and never connects after it expires', async () => {
  let resolve: (value: any) => void = () => {};
  jest.mocked(lookup).mockReturnValue(new Promise(done => { resolve = done; }) as any);
  const controller = new AbortController();
  const task = readSourceWebsite('https://example.com', 'html', controller.signal);
  controller.abort(); await expect(task).rejects.toThrow('timeout');
  resolve([{ address: '93.184.216.34', family: 4 }]); await Promise.resolve();
  expect(request).not.toHaveBeenCalled();
});
