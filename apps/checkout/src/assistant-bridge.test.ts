import { describe, expect, it } from 'vitest';
import { assistantRequestBody, leadOrigin } from './assistant-bridge';

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
});
