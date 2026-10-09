// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPasswordGuard, mountSourceAccountBridge } from './account-bridge';

describe('password guard', () => {
  it('catches a remembered password plain, reversed or base64, ignoring short ones', () => {
    const guard = createPasswordGuard();
    guard.remember('Gelato2026!'); guard.remember('corta');
    expect(guard.carries({ review: { text: 'me encantó gelato2026! sí' } })).toBe(true);
    expect(guard.carries(['x', '!6202otaleG'])).toBe(true);
    expect(guard.carries({ q: btoa('Gelato2026!') })).toBe(true);
    expect(guard.carries({ text: 'corta' })).toBe(false);
    expect(guard.carries({ text: 'Excelente helado' })).toBe(false);
  });
});
describe('account bridge', () => {
  it('answers only its own frame, only allowed actions, and never echoes a token', async () => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    const handler = vi.fn(async () => ({ ok: true, body: { signedIn: true, name: 'Ana', token: 'secret' } }));
    const guard = createPasswordGuard();
    const dispose = mountSourceAccountBridge(frame, handler, guard);
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { type: 'pagosya:account-request', id: 1, action: 'login', body: { email: 'a@b.bo', password: 'Gelato2026!' } } }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(handler).toHaveBeenCalledWith('login', { email: 'a@b.bo', password: 'Gelato2026!' });
    expect(post.mock.calls[0][0]).toEqual({ type: 'pagosya:account-response', id: 1, ok: true, body: { signedIn: true, name: 'Ana' } });
    expect(guard.carries('gelato2026!')).toBe(true);
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data: { type: 'pagosya:account-request', id: 2, action: 'me', body: {} } }));
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { type: 'pagosya:account-request', id: 3, action: 'drop-db', body: {} } }));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(post.mock.calls.at(-1)![0]).toEqual({ type: 'pagosya:account-response', id: 3, ok: false, body: { message: 'Solicitud no válida.' } });
    dispose();
  });
});
