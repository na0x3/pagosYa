import { describe, expect, it, vi } from 'vitest';
import { assistantRequestBody, leadOrigin, postAssistantChat } from './assistant-bridge';

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
});
