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
