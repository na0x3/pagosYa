// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { bindAssistantPreview } from './source-assistant-preview';

// baek 2026-10-17: the bot in the Studio preview only said «responde en tu tienda publicada». Studio now answers it through
// the merchant's test chat: an acknowledgement at once, then the reply.
const frame = document.createElement('iframe');
document.body.append(frame);
const posted: any[] = [];
const frameWindow = frame.contentWindow!;
frameWindow.postMessage = ((message: unknown) => { posted.push(message); }) as typeof frameWindow.postMessage;
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const ask = (data: unknown, source: MessageEventSource | null = frameWindow, origin = 'null') => window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
let unbind = () => {};
afterEach(() => { unbind(); posted.length = 0; });

it('acknowledges the preview bot at once and answers through the test chat', async () => {
  const test = vi.fn().mockResolvedValue({ conversationId: 'c1', reply: { text: 'Sí, hay croissants.', blocks: [] } });
  unbind = bindAssistantPreview(() => frame, test);
  ask({ type: 'pagosya:assistant-test', id: 'pya-1', body: { message: '¿Tienen croissants?', conversationId: 'c0' } });
  expect(posted[0]).toEqual({ type: 'pagosya:assistant-test-ack', id: 'pya-1' });
  await flush();
  expect(test).toHaveBeenCalledWith({ message: '¿Tienen croissants?', conversationId: 'c0' });
  expect(posted[1]).toEqual({ type: 'pagosya:assistant-test-reply', id: 'pya-1', ok: true, status: 200, json: { conversationId: 'c1', reply: { text: 'Sí, hay croissants.', blocks: [] } } });
});

it('passes a refusal back with its status and Spanish message, so the bot can say it', async () => {
  unbind = bindAssistantPreview(() => frame, vi.fn().mockRejectedValue(new ApiError('Usaste las 50 pruebas de este mes.', 400)));
  ask({ type: 'pagosya:assistant-test', id: 'pya-2', body: { message: 'Hola' } });
  await flush();
  expect(posted[1]).toEqual({ type: 'pagosya:assistant-test-reply', id: 'pya-2', ok: false, status: 400, json: { message: 'Usaste las 50 pruebas de este mes.' } });
});

it('ignores messages that are not from its own preview frame, or carry no question', async () => {
  const test = vi.fn();
  unbind = bindAssistantPreview(() => frame, test);
  ask({ type: 'pagosya:assistant-test', id: 'x', body: { message: 'Hola' } }, window);
  ask({ type: 'pagosya:assistant-test', id: 'x', body: { message: 'Hola' } }, frameWindow, 'https://evil.test');
  ask({ type: 'pagosya:assistant-test', id: 'x', body: { message: '   ' } });
  await flush();
  expect(test).not.toHaveBeenCalled();
  expect(posted).toEqual([]);
});
