export type ProductCard = { id: string; name: string; price: string; originalPrice: string | null; inStock: boolean; image: string | null; addKey: string | null };
export type HandoffReason = 'no_se' | 'pidio_persona' | 'reclamo';
export type AssistantBlock =
  | { type: 'products'; items: ProductCard[] }
  | { type: 'add_to_cart'; productId: string; addKey: string; label: string; price: string }
  | { type: 'handoff'; whatsappUrl: string | null; summary: string };
export type AssistantReply = { text: string; blocks: AssistantBlock[] };
export type ChatResult = { conversationId: string | null; reply?: AssistantReply; fallback?: 'contact' };
