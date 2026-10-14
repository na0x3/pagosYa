import { describe, expect, it, vi } from 'vitest';
import { assistantRequestBody, leadOrigin, postAssistantChat, rememberAssistantConversation, withStoredAssistantConversation } from './assistant-bridge';

describe('assistant bridge', () => {
  it('passes only the chat fields, trimmed to their limits', () => {
    expect(assistantRequestBody({ message: 'hola', conversationId: 'c'.repeat(25), pagePath: 'index.html', productId: 'p1', addedToCart: true, email: 'x@y.z' }))
      .toEqual({ message: 'hola', conversationId: 'c'.repeat(25), pagePath: 'index.html', productId: 'p1', addedToCart: true });
    expect(assistantRequestBody({ message: 'a'.repeat(600) })?.message).toHaveLength(500);
  });

  it('refuses a body without a message', () => {
    expect(assistantRequestBody({})).toBeNull();
    expect(assistantRequestBody('hola')).toBeNull();
  });

  it('keeps the assistant origin on leads and nothing else', () => {
    expect(leadOrigin({ origin: 'assistant' })).toEqual({ origin: 'assistant' });
    expect(leadOrigin({ origin: 'evil' })).toEqual({});
  });

  it('posts the chat with a 30 s timeout and answers in Spanish when the request fails', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reply: 'hola' }) });
    expect(await postAssistantChat('/v1', 'cafe', { message: 'hola' }, ok as any)).toEqual({ ok: true, body: { reply: 'hola' } });
    expect(ok.mock.calls[0][0]).toBe('/v1/stores/public/cafe/assistant/chat');
    expect(ok.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(30000);
    const failing = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await postAssistantChat('/v1', 'cafe', { message: 'hola' }, failing as any)).toEqual({ ok: false, body: { message: 'No pudimos conectar con el asistente. Inténtalo otra vez.' } });
  });

  const memory = () => { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, map }; };
  const ID = 'cabcdefghijklmnopqrstuvw', OTHER = 'czzzzzzzzzzzzzzzzzzzzzzz';

  it('keeps the conversation for a sandboxed frame: stored from a reply and re-injected when the frame omits it', () => {
    const storage = memory();
    expect(withStoredAssistantConversation({ message: 'hola' }, 'cafe', () => storage)).toEqual({ message: 'hola' });
    rememberAssistantConversation('cafe', { ok: true, body: { conversationId: ID, reply: { text: 'x', blocks: [] } } }, () => storage);
    expect(storage.map.get('pagosya:assistant:cafe')).toBe(ID);
    expect(withStoredAssistantConversation({ message: 'otra' }, 'cafe', () => storage)).toEqual({ message: 'otra', conversationId: ID });
    expect(withStoredAssistantConversation({ message: 'otra' }, 'otra-tienda', () => storage)).toEqual({ message: 'otra' });
  });

  it('never overrides an id the frame did send', () => {
    const storage = memory(); storage.setItem('pagosya:assistant:cafe', ID);
    expect(withStoredAssistantConversation({ message: 'hola', conversationId: OTHER }, 'cafe', () => storage)).toEqual({ message: 'hola', conversationId: OTHER });
  });

  it('remembers only a well-formed id from a successful reply, and survives storage that throws', () => {
    const storage = memory(); storage.setItem('pagosya:assistant:cafe', ID);
    rememberAssistantConversation('cafe', { ok: false, body: { conversationId: OTHER } }, () => storage);
    rememberAssistantConversation('cafe', { ok: true, body: { conversationId: null, fallback: 'contact' } }, () => storage);
    rememberAssistantConversation('cafe', { ok: true, body: { conversationId: '<script>' } }, () => storage);
    expect(storage.map.get('pagosya:assistant:cafe')).toBe(ID);
    storage.setItem('pagosya:assistant:cafe', 'not an id');
    expect(withStoredAssistantConversation({ message: 'hola' }, 'cafe', () => storage)).toEqual({ message: 'hola' });
    const broken = () => { throw new Error('SecurityError'); };
    expect(withStoredAssistantConversation({ message: 'hola' }, 'cafe', broken)).toEqual({ message: 'hola' });
    expect(() => rememberAssistantConversation('cafe', { ok: true, body: { conversationId: ID } }, broken)).not.toThrow();
  });
});
