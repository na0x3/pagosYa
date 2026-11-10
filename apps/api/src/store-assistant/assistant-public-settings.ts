import type { PrismaService } from '../prisma/prisma.service';
import { laPazMonthStart } from './assistant-text';
import { PLANS } from '../plans/plans';

export type PublicAssistant = { name: string; greeting: string; avatarUrl: string | null; handoff: 'whatsapp' | 'form'; suggestions: string[] };

/** What the storefront needs to draw the bubble; null hides it and the old contact button returns. */
export async function publicAssistant(
  prisma: PrismaService,
  store: { id: string; name: string; logoUrl: string | null; contactPhone: string | null; publishedSourceRevision: number | null; shippingEnabled: boolean },
  hasVariants: boolean, platformEnabled: boolean, now: Date, options: { ownerPreview?: boolean } = {},
): Promise<PublicAssistant | null> {
  // The owner's own editor shows the bubble before the first publish (owner 2026-10-25, BOXY: with the assistant on, the
  // unpublished store's preview showed the contact form in the corner instead).
  if (!platformEnabled || (!store.publishedSourceRevision && !options.ownerPreview)) return null;
  const row = await prisma.storeAssistant.findUnique({ where: { storeId: store.id } });
  if (!row?.enabled) return null;
  const used = await prisma.assistantConversation.count({ where: { storeId: store.id, preview: false, startedAt: { gte: laPazMonthStart(now) } } });
  // Plans 2026-11-07: the plan's monthly conversations, or more when ops raised this store.
  const owner = await prisma.store.findUnique({ where: { id: store.id }, select: { merchant: { select: { plan: true } } } });
  if (used >= Math.max(row.monthlyCap, owner ? PLANS[owner.merchant.plan].assistantConversations : 0)) return null;
  const custom = row.name?.trim();
  return {
    name: custom || `Asistente de ${store.name}`,
    greeting: row.greeting?.trim() || `¡Hola! Soy ${custom || `el asistente de ${store.name}`}. ¿En qué te ayudo?`,
    avatarUrl: row.avatarUrl || store.logoUrl || null,
    handoff: (store.contactPhone ?? '').replace(/\D/g, '') ? 'whatsapp' : 'form',
    suggestions: ['¿Qué me recomiendas?', store.shippingEnabled && '¿Hacen envíos a mi ciudad?', hasVariants && '¿Tienen otras tallas o colores?'].filter((s): s is string => !!s),
  };
}
