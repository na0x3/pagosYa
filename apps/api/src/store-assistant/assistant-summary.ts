import type { Prisma } from '@prisma/client';
import { hoursSummary } from '../store-knowledge/store-knowledge';
import { readStoreLocations } from '../stores/store-locations';
import { storePolicies, type StorePolicies } from '../stores/store-presentation';

/** Public store fields only: the Store Brain also holds revenue and per-product sales, which buyers must never see. */
export type SummaryStore = {
  name: string; tagline: string | null; aboutText: string | null; announcement: string | null; contactPhone: string | null;
  checkoutMode: string; shippingEnabled: boolean; shippingPickupEnabled: boolean; locations: Prisma.JsonValue; policies: Prisma.JsonValue;
  categories: string[];
};
export type AssistantProfile = { name: string | null; notes: string; formality: string };
export type Passage = { title: string; body: string };

const POLICY_TITLES: Record<keyof StorePolicies, string> = { returns: 'Cambios y devoluciones', delivery: 'Envíos', privacy: 'Privacidad', terms: 'Términos' };
const CHECKOUT: Record<string, string> = {
  payment: 'Pago en línea con pagosYa al finalizar el pedido.',
  whatsapp: 'El pedido se envía por WhatsApp a la tienda, que confirma el pago.',
  external: 'La tienda recibe el pedido en su propio enlace de contacto.',
};
/** One line, capped: merchant-set names must not inject prompt lines. */
export const oneLine = (value: string | null | undefined, max: number) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clip = (value: string | null | undefined, max: number) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};
const locationsOf = (store: SummaryStore) => readStoreLocations(store.locations).slice(0, 6);

export function buildAssistantSummary(store: SummaryStore, profile: AssistantProfile): string {
  const policies = storePolicies(store.policies);
  const delivery = [store.shippingEnabled && 'envío a domicilio', store.shippingPickupEnabled && 'recojo en tienda'].filter(Boolean).join(' y ');
  const published = (Object.keys(POLICY_TITLES) as Array<keyof StorePolicies>).filter((key) => policies[key]).map((key) => POLICY_TITLES[key]);
  const lines = [
    `Tienda: ${oneLine(store.name, 80)}${store.tagline ? ` — ${clip(store.tagline, 160)}` : ''}`,
    store.aboutText ? `Quiénes somos: ${clip(store.aboutText, 600)}` : '',
    store.announcement ? `Aviso actual: ${clip(store.announcement, 200)}` : '',
    `Cómo se compra: ${CHECKOUT[store.checkoutMode] ?? CHECKOUT.payment}`,
    `Entrega: ${delivery || 'consultar con la tienda'}`,
    ...locationsOf(store).map((location) => {
      const hours = hoursSummary(location.openingHours);
      return `Local ${oneLine(location.name, 80)}${location.address ? ` (${clip(location.address, 120)})` : ''}${location.pickupEnabled ? ', recojo' : ''}${location.deliveryEnabled ? ', envíos' : ''}${hours ? `; horario: ${hours}` : ''}`;
    }),
    store.categories.length ? `Categorías: ${store.categories.slice(0, 30).map((c) => oneLine(c, 60)).join(', ')}` : '',
    `Políticas publicadas: ${published.join(', ') || 'ninguna'} (léelas con buscar_info)`,
    store.contactPhone?.replace(/\D/g, '') ? 'La tienda atiende por WhatsApp.' : 'La tienda no tiene WhatsApp; para hablar con alguien se deja un mensaje.',
    profile.notes.trim() ? `Lo que la tienda quiere que sepas:\n${profile.notes.trim().slice(0, 4000)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

const MAX_PASSAGE = 1500;

/** Breaks one over-long paragraph at single newlines, then sentence ends, then (last resort) hard chunks, so no text is lost. */
function breakDown(text: string, separators: string[]): string[] {
  if (text.length <= MAX_PASSAGE) return [text];
  const [separator, ...rest] = separators;
  if (separator === undefined) return Array.from({ length: Math.ceil(text.length / MAX_PASSAGE) }, (_, i) => text.slice(i * MAX_PASSAGE, (i + 1) * MAX_PASSAGE));
  const parts = text.split(separator);
  const keep = separator === '. ' ? '.' : '';
  return parts.flatMap((part, i) => breakDown(i < parts.length - 1 ? `${part}${keep}` : part, rest)).map((part) => part.trim()).filter(Boolean);
}

/** Long text is split at paragraph breaks into passages of at most 1500 characters. */
function split(title: string, body: string): Passage[] {
  const passages: Passage[] = [];
  let current = '';
  for (const paragraph of body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    for (const piece of breakDown(paragraph, ['\n', '. '])) {
      if (current && current.length + piece.length + 2 > MAX_PASSAGE) { passages.push({ title, body: current }); current = ''; }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) passages.push({ title, body: current });
  return passages;
}

export function storePassages(store: SummaryStore, profile: AssistantProfile): Passage[] {
  const policies = storePolicies(store.policies);
  return [
    ...(store.aboutText ? split('Quiénes somos', store.aboutText) : []),
    ...(Object.keys(POLICY_TITLES) as Array<keyof StorePolicies>).flatMap((key) => policies[key] ? split(POLICY_TITLES[key], policies[key]!) : []),
    ...locationsOf(store).map((location) => {
      const hours = hoursSummary(location.openingHours);
      return { title: `Local ${oneLine(location.name, 80)}`, body: [location.address, location.description, hours && `Horario: ${hours}`].filter(Boolean).join('. ') };
    }).filter((passage) => passage.body),
    ...profile.notes.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).flatMap((note) => split('Información de la tienda', note)),
  ];
}
