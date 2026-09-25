/** Single source of truth for the daily wheel and the Horizonte board. Pure: no Nest, no Prisma. */
export type PrizeKey = "STICKER_COMMON" | "XP_25" | "XP_50" | "TIP" | "STICKER_RARE" | "RESPIN" | "XP_200" | "AI_CREDITS_5" | "AI_CREDITS_25";
export type PrizeKind = "XP" | "AI_CREDITS" | "STICKER" | "TIP" | "RESPIN";
export interface RandomSource { int(maxExclusive: number): number }

export const BOARD_TILES = 24;
export const BOARD_SALES_PER_ROLL = 10;
export const AI_CREDIT_MONTHLY_CAP = 50;
export const CAP_FALLBACK_XP = 200;
/** Weights have one decimal (3.5, 0.5); draws are made over integer tenths. */
export const WEIGHT_SCALE = 10;
const BOLIVIA_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

export const PRIZES: Record<PrizeKey, { kind: PrizeKind; amount: number; rare?: boolean }> = {
  STICKER_COMMON: { kind: "STICKER", amount: 0 },
  STICKER_RARE: { kind: "STICKER", amount: 0, rare: true },
  XP_25: { kind: "XP", amount: 25 },
  XP_50: { kind: "XP", amount: 50 },
  XP_200: { kind: "XP", amount: 200 },
  AI_CREDITS_5: { kind: "AI_CREDITS", amount: 5 },
  AI_CREDITS_25: { kind: "AI_CREDITS", amount: 25 },
  TIP: { kind: "TIP", amount: 0 },
  RESPIN: { kind: "RESPIN", amount: 0 },
};

/** Order is the wheel's clockwise slice order; the dashboard draws slices in this same order. */
export const WHEEL_SEGMENTS: readonly { key: PrizeKey; weight: number }[] = [
  { key: "STICKER_COMMON", weight: 27 },
  { key: "XP_25", weight: 25 },
  { key: "AI_CREDITS_5", weight: 3.5 },
  { key: "TIP", weight: 13 },
  { key: "XP_50", weight: 14 },
  { key: "RESPIN", weight: 5 },
  { key: "STICKER_RARE", weight: 7 },
  { key: "XP_200", weight: 5 },
  { key: "AI_CREDITS_25", weight: 0.5 },
];

/** Fixed 24-tile ring. Expensive tiles sit at 3, 9, 15 and 21 — six apart, the widest spacing 24 allows. */
export const BOARD_LAYOUT: readonly PrizeKey[] = [
  "STICKER_COMMON", "XP_25", "STICKER_COMMON", "AI_CREDITS_5", "TIP", "STICKER_COMMON",
  "XP_50", "XP_25", "STICKER_COMMON", "STICKER_RARE", "TIP", "STICKER_COMMON",
  "XP_50", "XP_25", "STICKER_COMMON", "XP_200", "STICKER_COMMON", "TIP",
  "XP_25", "STICKER_COMMON", "XP_50", "AI_CREDITS_25", "XP_25", "STICKER_COMMON",
];

export const STICKERS: readonly { id: string; icon: string; name: string; rare: boolean }[] = [
  { id: "parrot", icon: "🦜", name: "Loro fiestero", rare: false },
  { id: "llama", icon: "🦙", name: "Llama viajera", rare: false },
  { id: "cactus", icon: "🌵", name: "Cactus firme", rare: false },
  { id: "pineapple", icon: "🍍", name: "Piña dulce", rare: false },
  { id: "rainbow", icon: "🌈", name: "Arcoíris", rare: false },
  { id: "trumpet", icon: "🎺", name: "Trompeta de ventas", rare: false },
  { id: "coffee", icon: "☕", name: "Cafecito", rare: false },
  { id: "comet", icon: "🌠", name: "Estrella fugaz", rare: true },
  { id: "crown", icon: "👑", name: "Corona del mercado", rare: true },
];

export const TIPS: readonly { id: string; kind: "mission" | "tip"; text: string }[] = [
  { id: "m-whatsapp", kind: "mission", text: "Comparte el enlace de tu tienda en tu estado de WhatsApp." },
  { id: "m-photo", kind: "mission", text: "Cambia la foto principal de tu producto más visto." },
  { id: "m-inbox", kind: "mission", text: "Responde hoy los mensajes pendientes de tu bandeja." },
  { id: "m-referral", kind: "mission", text: "Pídele a un cliente feliz que recomiende tu tienda." },
  { id: "m-copy", kind: "mission", text: "Escribe una descripción más clara para uno de tus productos." },
  { id: "m-group", kind: "mission", text: "Publica tu tienda en un grupo de tu barrio o ciudad." },
  { id: "t-light", kind: "tip", text: "Las fotos con luz natural y fondo liso suelen vender más." },
  { id: "t-shipping", kind: "tip", text: "Un precio con envío claro evita que el cliente abandone el pago." },
  { id: "t-reply", kind: "tip", text: "Responder rápido un mensaje convierte curiosos en compradores." },
  { id: "t-hero", kind: "tip", text: "Destaca tu producto estrella al inicio de tu tienda." },
  { id: "t-discount", kind: "tip", text: "Un descuento corto, de fin de semana, crea urgencia sin regalar tu margen." },
  { id: "t-story", kind: "tip", text: "Cuenta en una línea qué hace especial a tu negocio: la gente compra historias." },
];

export function pickWeighted(random: RandomSource): number {
  const scaled = WHEEL_SEGMENTS.map((segment) => Math.round(segment.weight * WEIGHT_SCALE));
  let roll = random.int(scaled.reduce((sum, weight) => sum + weight, 0));
  for (let index = 0; index < scaled.length; index++) {
    roll -= scaled[index];
    if (roll < 0) return index;
  }
  return scaled.length - 1;
}

export function boliviaDayKey(now: Date): string {
  return new Date(now.getTime() - BOLIVIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export function boliviaMonthStart(now: Date): Date {
  const local = new Date(now.getTime() - BOLIVIA_UTC_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + BOLIVIA_UTC_OFFSET_MS);
}
