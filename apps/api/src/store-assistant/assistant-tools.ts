import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { hoursSummary, money } from '../store-knowledge/store-knowledge';
import { activeDiscountPercent, discountedProductAmount, readProductExtras, readProductVariants } from '../stores/product-pricing';
import { readStoreLocations } from '../stores/store-locations';
import { searchInfo, searchProductIds } from './assistant-search';
import type { Passage } from './assistant-summary';
import { foldText } from './assistant-text';
import type { AssistantBlock, HandoffReason, ProductCard } from './assistant-types';

const object = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = { type: 'string' };
const nullableText = { type: ['string', 'null'] };
const tool = (name: string, description: string, properties: Record<string, object>) => ({ type: 'function' as const, name, description, parameters: object(properties), strict: true as const });

export const ASSISTANT_TOOLS = [
  tool('buscar_productos', 'Busca productos publicados por palabras clave. Devuelve precio actual, descuento y disponibilidad.', { consulta: text, categoria: nullableText }),
  tool('ver_producto', 'Detalle de un producto: variantes con su precio y disponibilidad, extras, suscripción y reseñas.', { id: text }),
  tool('buscar_info', 'Busca en la historia de la tienda, sus políticas, locales y horarios, artículos, reseñas y notas.', { consulta: text }),
  tool('envios', 'Zonas de envío con costo, envío gratis desde, tiempo estimado, y locales para recoger.', { departamento: nullableText }),
  tool('agregar_al_carrito', 'Muestra al cliente un botón para agregar el producto (o la variante elegida) a su carrito.', { id: text, varianteId: nullableText }),
  tool('cupon_disponible', 'Cupones que la tienda permite ofrecer en este chat.', {}),
  tool('pasar_con_la_tienda', 'Ofrece hablar con la tienda (WhatsApp o mensaje).', { motivo: { type: 'string', enum: ['no_se', 'pidio_persona', 'reclamo'] }, pregunta: text, resumen: text }),
];

export type ToolStore = { id: string; contactPhone: string | null; locations: Prisma.JsonValue; passages: Passage[] };
type ProductRow = {
  id: string; name: string; description: string | null; amount: number; currency: string; stock: number | null; imageUrls: string[]; fulfillmentType: string;
  variants: Prisma.JsonValue; extras: Prisma.JsonValue; discountPercent: number | null; discountStartsAt: Date | null; discountEndsAt: Date | null;
  category?: { name: string } | null; subscriptionOptions?: Array<{ cadence: string; discountPercent: number }>;
};

const clip = (value: string | null | undefined, max: number) => { const t = (value ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const available = (stock: number | null | undefined) => stock === null || stock === undefined || stock > 0;
const CADENCES: Record<string, string> = { WEEKLY: 'semanal', BIWEEKLY: 'cada 2 semanas', MONTHLY: 'mensual' };
const duration = (minutes: number | null) => {
  if (!minutes) return null;
  if (minutes < 60) return `unos ${minutes} minutos`;
  if (minutes < 1440) return `unas ${Math.round(minutes / 60)} horas`;
  return `unos ${Math.round(minutes / 1440)} días`;
};
const departmentCode = (name: string) => foldText(name).replace(/\s+/g, '_').toUpperCase();

/** One product, priced now. "Agregar" only when a single tap adds exactly this item: no variant choice, no box, no membership, in stock. */
export function productCard(p: ProductRow, now: Date): ProductCard {
  const variants = readProductVariants(p.variants);
  const extras = readProductExtras(p.extras);
  const percent = activeDiscountPercent(p, now);
  const prices = variants.length ? variants.map((v) => discountedProductAmount(p, v.amount, now)) : [discountedProductAmount(p, p.amount, now)];
  const inStock = variants.length ? available(p.stock) && variants.some((v) => available(v.stock)) : available(p.stock);
  const simple = !variants.length && !extras.length && p.fulfillmentType !== 'MEMBERSHIP';
  return {
    id: p.id, name: p.name,
    price: `${variants.length ? 'desde ' : ''}${money(Math.min(...prices), p.currency)}`,
    originalPrice: percent !== null && !variants.length ? money(p.amount, p.currency) : null,
    inStock, image: p.imageUrls[0] ?? null,
    addKey: simple && inStock ? p.id : null,
  };
}

export class AssistantToolbox {
  readonly evidence: string[] = [];
  readonly cards = new Map<string, ProductCard>();
  readonly searched: string[] = [];
  readonly addBlocks: AssistantBlock[] = [];
  handoff: { reason: HandoffReason; question: string; summary: string } | null = null;

  constructor(private readonly deps: { prisma: PrismaService; store: ToolStore; now: Date }) {}

  async run(name: string, rawArgs: string): Promise<string> {
    let args: Record<string, unknown>;
    try { args = JSON.parse(rawArgs || '{}'); } catch { return 'Argumentos inválidos.'; }
    try {
      const output = await this.execute(name, args);
      this.evidence.push(output);
      return output;
    } catch {
      return 'No pude consultar ese dato ahora.';
    }
  }

  private async product(id: string) {
    return await this.deps.prisma.paymentLink.findFirst({
      where: { id, storeId: this.deps.store.id, status: 'ACTIVE' },
      include: { category: { select: { name: true } }, subscriptionOptions: { select: { cadence: true, discountPercent: true } } },
    }) as unknown as ProductRow | null;
  }

  private async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const { prisma, store, now } = this.deps;
    const str = (key: string) => (typeof args[key] === 'string' ? (args[key] as string).slice(0, 300) : '');
    switch (name) {
      case 'buscar_productos': {
        const ids = await searchProductIds(prisma, store.id, str('consulta'), str('categoria') || null);
        const rows = await prisma.paymentLink.findMany({ where: { id: { in: ids }, storeId: store.id, status: 'ACTIVE' }, include: { category: { select: { name: true } } } }) as unknown as ProductRow[];
        const ordered = ids.map((id) => rows.find((row) => row.id === id)).filter((row): row is ProductRow => !!row);
        if (!ordered.length) return 'No encontré productos con esas palabras.';
        return JSON.stringify(ordered.map((row) => {
          const card = productCard(row, now);
          this.cards.set(row.id, card); this.searched.push(row.id);
          const percent = activeDiscountPercent(row, now);
          return { id: row.id, nombre: row.name, precio: card.price, precio_antes: card.originalPrice, descuento: percent !== null ? `${percent}%` : null, disponible: card.inStock, categoria: row.category?.name ?? null };
        }));
      }
      case 'ver_producto': {
        const row = await this.product(str('id'));
        if (!row) return 'Ese producto no está disponible en esta tienda.';
        const card = productCard(row, now);
        this.cards.set(row.id, card);
        const percent = activeDiscountPercent(row, now);
        const reviews = await prisma.storeReview.aggregate({ where: { storeId: store.id, productId: row.id, status: 'PUBLISHED' }, _count: true, _avg: { rating: true } });
        return JSON.stringify({
          id: row.id, nombre: row.name, descripcion: clip(row.description, 1200), precio: card.price, precio_antes: card.originalPrice,
          descuento: percent !== null ? `${percent}% hasta el ${row.discountEndsAt!.toISOString().slice(0, 10)}` : null,
          disponible: card.inStock,
          variantes: readProductVariants(row.variants).map((v) => ({ id: v.id, nombre: v.name, precio: money(discountedProductAmount(row, v.amount, now), row.currency), disponible: available(row.stock) && available(v.stock) })),
          extras: readProductExtras(row.extras).map((e) => ({ nombre: e.name, precio: money(e.amount, row.currency), obligatorio: e.required })),
          suscripcion: (row.subscriptionOptions ?? []).map((o) => ({ frecuencia: CADENCES[o.cadence] ?? o.cadence, descuento: `${o.discountPercent}%` })),
          resenas: reviews._count ? { cantidad: reviews._count, promedio: Math.round((reviews._avg.rating ?? 0) * 10) / 10 } : null,
        });
      }
      case 'buscar_info': {
        const found = await searchInfo(prisma, store.id, str('consulta'), store.passages);
        return found.length ? JSON.stringify(found) : 'No encontré esa información en la tienda.';
      }
      case 'envios': {
        const wanted = str('departamento') ? departmentCode(str('departamento')) : null;
        const zones = await prisma.deliveryZone.findMany({ where: { storeId: store.id, isActive: true }, orderBy: { fee: 'asc' } });
        const pickup = readStoreLocations(store.locations).filter((l) => l.pickupEnabled).map((l) => ({ local: l.name, horario: hoursSummary(l.openingHours) ?? null }));
        return JSON.stringify({
          zonas: zones.filter((z) => !wanted || !z.departments.length || z.departments.includes(wanted)).map((z) => ({
            zona: z.name, costo: money(z.fee, z.currency), gratis_desde: z.freeAbove ? money(z.freeAbove, z.currency) : null,
            pedido_minimo: z.minimumOrder ? money(z.minimumOrder, z.currency) : null, tiempo: duration(z.estimatedMinutes),
          })),
          recojo: pickup,
        });
      }
      case 'agregar_al_carrito': {
        const row = await this.product(str('id'));
        if (!row) return 'Ese producto no está disponible en esta tienda.';
        if (readProductExtras(row.extras).length || row.fulfillmentType === 'MEMBERSHIP') return 'Este producto se arma en su página; ofrece el botón "Ver" de su tarjeta.';
        const variants = readProductVariants(row.variants);
        const variant = variants.find((v) => v.id === str('varianteId'));
        if (variants.length && !variant) return `Pregunta qué opción quiere: ${variants.map((v) => v.name).join(', ')}.`;
        if (!available(row.stock) || (variant && !available(variant.stock))) return 'Esa opción está agotada; ofrece otra.';
        const price = money(discountedProductAmount(row, variant ? variant.amount : row.amount, now), row.currency);
        const label = variant ? `${row.name} — ${variant.name}` : row.name;
        this.addBlocks.push({ type: 'add_to_cart', productId: row.id, addKey: variant ? JSON.stringify([row.id, variant.id]) : row.id, label, price });
        return `Listo: el cliente verá un botón "Agregar" para ${label} a ${price}. Debe tocarlo él.`;
      }
      case 'cupon_disponible': {
        const codes = await prisma.promoCode.findMany({ where: { storeId: store.id, isActive: true, showInAssistant: true }, take: 5, orderBy: { createdAt: 'desc' } });
        return codes.length ? JSON.stringify(codes.map((c) => ({ codigo: c.code, descuento: c.discountType === 'PERCENT' ? `${c.discountValue}%` : money(c.discountValue, 'BOB') }))) : 'No hay cupones para ofrecer.';
      }
      case 'pasar_con_la_tienda': {
        const reason = (['no_se', 'pidio_persona', 'reclamo'] as const).find((r) => r === args.motivo) ?? 'no_se';
        this.handoff = { reason, question: clip(str('pregunta'), 300), summary: clip(str('resumen'), 500) };
        return store.contactPhone?.replace(/\D/g, '') ? 'El cliente verá un botón para escribir por WhatsApp con tu resumen.' : 'El cliente verá un formulario para dejarle un mensaje a la tienda.';
      }
      default:
        return 'Herramienta desconocida.';
    }
  }
}
