/** Store pickup/delivery locations: map embeds, opening hours, and whether a location can fulfill the cart. */
import { Store, StoreItem, StoreLocation } from "../api";


export function safeStoreMapEmbedUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    const googleHost = /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/.test(hostname);
    const googleEmbed = googleHost && url.pathname.startsWith("/maps/embed");
    const openStreetMapEmbed = (hostname === "openstreetmap.org" || hostname === "www.openstreetmap.org")
      && url.pathname === "/export/embed.html";
    return googleEmbed || openStreetMapEmbed ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeStoreMapEmbedInput(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iframeSource = raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  return String(iframeSource || raw).replace(/&amp;/gi, "&").trim();
}

export function publicStoreLocations(store: Store): StoreLocation[] {
  const configured = (store.locations || []).map((location) => ({
    ...location,
    mapEmbedUrl: safeStoreMapEmbedUrl(location.mapEmbedUrl) || undefined,
    inventory: Array.isArray(location.inventory) ? location.inventory : [],
  }));
  if (configured.length) return configured;
  if (!(store.locationMapUrl || store.locationDescription || store.locationHighlight)) return [];
  return [{
    id: "location-principal",
    name: "Ubicación principal",
    mapEmbedUrl: safeStoreMapEmbedUrl(store.locationMapUrl) || undefined,
    description: store.locationDescription || undefined,
    highlight: store.locationHighlight || undefined,
    pickupEnabled: false,
    deliveryEnabled: false,
    openingHours: [],
    inventory: [],
  }];
}

export function locationOpeningState(location: StoreLocation, now = new Date()): { isOpen: boolean; label: string; nextOpenAt?: string } {
  if (!location.openingHours?.length) return { isOpen: true, label: "Horario no configurado" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday as "Sun"] ?? 0;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const today = location.openingHours.find((entry) => entry.day === weekday);
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (today && !today.closed && minuteOfDay >= toMinutes(today.open) && minuteOfDay < toMinutes(today.close)) {
    return { isOpen: true, label: `Abierto ahora · cierra a las ${today.close}` };
  }
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = (weekday + offset) % 7;
    const hours = location.openingHours.find((entry) => entry.day === day);
    if (!hours || hours.closed || (offset === 0 && toMinutes(hours.open) <= minuteOfDay)) continue;
    const [hour, minute] = hours.open.split(":").map(Number);
    const candidate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset, hour + 4, minute));
    const dayLabel = offset === 0 ? "hoy" : offset === 1 ? "mañana" : new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", weekday: "long" }).format(candidate);
    return { isOpen: false, label: `Cerrado ahora · abre ${dayLabel} a las ${hours.open}`, nextOpenAt: candidate.toISOString() };
  }
  return { isOpen: false, label: "Cerrado · revisa el horario con la tienda" };
}

export function locationCanFulfillCart(location: StoreLocation, lines: ReadonlyArray<{ product: StoreItem; quantity: number }>): boolean {
  const requested = new Map<string, number>();
  lines.filter(line => line.product.fulfillmentType !== 'DIGITAL').forEach((line) => requested.set(line.product.id, (requested.get(line.product.id) || 0) + line.quantity));
  return [...requested].every(([paymentLinkId, quantity]) => {
    const stock = location.inventory.find((entry) => entry.paymentLinkId === paymentLinkId)?.stock ?? 0;
    return stock === null || stock >= quantity;
  });
}
