/** The design frame may send only these chat fields to the API; everything else is dropped. */
export function assistantRequestBody(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message !== 'string' || !b.message.trim()) return null;
  const text = (value: unknown, max: number) => (typeof value === 'string' && value ? value.slice(0, max) : undefined);
  const out: { conversationId?: string; message: string; pagePath?: string; productId?: string; addedToCart?: boolean } = { message: b.message.slice(0, 500) };
  const conversationId = text(b.conversationId, 40), pagePath = text(b.pagePath, 200), productId = text(b.productId, 64);
  if (conversationId) out.conversationId = conversationId;
  if (pagePath) out.pagePath = pagePath;
  if (productId) out.productId = productId;
  if (b.addedToCart === true) out.addedToCart = true;
  return out;
}

export const leadOrigin = (body: unknown): { origin?: 'assistant' } =>
  body && typeof body === 'object' && (body as Record<string, unknown>).origin === 'assistant' ? { origin: 'assistant' } : {};

/** One chat turn to the API. Aborts after 30 s (the API's own turn limit is 25 s) and fails in Spanish, never with a raw error. */
export async function postAssistantChat(apiBase: string, slug: string, body: unknown, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; body: unknown }> {
  try {
    const result = await fetchImpl(`${apiBase}/stores/public/${encodeURIComponent(slug)}/assistant/chat`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    return { ok: result.ok, body: await result.json().catch(() => ({ message: 'No se pudo completar la solicitud.' })) };
  } catch {
    return { ok: false, body: { message: 'No pudimos conectar con el asistente. Inténtalo otra vez.' } };
  }
}

type ChatBody = NonNullable<ReturnType<typeof assistantRequestBody>>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const CONVERSATION_ID = /^[a-z0-9]{20,40}$/;
const conversationKey = (slug: string) => `pagosya:assistant:${slug}`;

/**
 * A published design runs in a sandboxed frame with no storage, and the frame is replaced on every page, so the
 * parent keeps the store's last conversation. The frame's own id always wins; the stored one only fills a gap.
 */
export function withStoredAssistantConversation(chat: ChatBody, slug: string, storage: () => StorageLike = () => sessionStorage): ChatBody {
  if (chat.conversationId) return chat;
  try {
    const saved = storage().getItem(conversationKey(slug));
    return saved && CONVERSATION_ID.test(saved) ? { ...chat, conversationId: saved } : chat;
  } catch {
    return chat;
  }
}

/** Keeps the id of a successful turn; a refusal, a fallback without an id or a malformed id leaves the stored one alone. */
export function rememberAssistantConversation(slug: string, turn: { ok: boolean; body: unknown }, storage: () => StorageLike = () => sessionStorage) {
  const id = turn.ok && turn.body && typeof turn.body === 'object' ? (turn.body as Record<string, unknown>).conversationId : null;
  if (typeof id !== 'string' || !CONVERSATION_ID.test(id)) return;
  try { storage().setItem(conversationKey(slug), id); } catch { /* storage may be blocked; the next page starts a new chat */ }
}
