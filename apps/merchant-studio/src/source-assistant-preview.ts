import { ApiError } from './api';

type JsonRecord = Record<string, unknown>;
type TestChat = (body: { message: string; conversationId?: string }) => Promise<JsonRecord>;

/**
 * The store bot inside the Studio preview (baek 2026-10-17: it only said «responde en tu tienda publicada», so the owner of a
 * published store could never talk to it here). kit/chat.js posts the question; Studio acknowledges at once (the bot falls
 * back to a hint without it) and answers through the merchant's test chat, which counts toward the monthly test allowance,
 * never the store's conversations. Only the preview frame is heard, as for the other preview messages.
 */
export function bindAssistantPreview(frame: () => HTMLIFrameElement | null, testChat: TestChat): () => void {
  const listener = (event: MessageEvent) => {
    const preview = frame()?.contentWindow;
    const data = event.data as { type?: unknown; id?: unknown; body?: { message?: unknown; conversationId?: unknown } } | null;
    if (!preview || event.source !== preview || event.origin !== 'null' || data?.type !== 'pagosya:assistant-test') return;
    const id = typeof data.id === 'string' ? data.id.slice(0, 80) : '';
    const message = typeof data.body?.message === 'string' ? data.body.message.trim() : '';
    if (!id || !message) return;
    const conversationId = typeof data.body?.conversationId === 'string' ? data.body.conversationId : undefined;
    preview.postMessage({ type: 'pagosya:assistant-test-ack', id }, '*');
    testChat({ message: message.slice(0, 500), ...(conversationId ? { conversationId } : {}) })
      .then(json => ({ ok: true, status: 200, json }))
      .catch((error: unknown) => ({ ok: false, status: error instanceof ApiError ? error.status : 0, json: { message: error instanceof Error ? error.message : '' } }))
      .then(result => { try { preview.postMessage({ type: 'pagosya:assistant-test-reply', id, ...result }, '*'); } catch { /* the preview reloaded */ } });
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
