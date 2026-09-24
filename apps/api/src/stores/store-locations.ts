/** Pickup/delivery locations saved on a store, their opening hours, and per-location stock. */
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type StoreLocationDto } from "./dto/store-location.dto";

export type StoreLocation = {
  id: string;
  name: string;
  address?: string;
  mapEmbedUrl?: string;
  description?: string;
  highlight?: string;
  department?: string;
  city?: string;
  lat?: number;
  lng?: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  openingHours: Array<{ day: number; open: string; close: string; closed: boolean }>;
};

export function storeLocationSnapshot(locations: StoreLocationDto[]): StoreLocation[] {
  return locations.map((location) => ({
    id: location.id,
    name: location.name.trim(),
    ...(location.address?.trim() ? { address: location.address.trim() } : {}),
    ...(location.mapEmbedUrl?.trim() ? { mapEmbedUrl: location.mapEmbedUrl.trim() } : {}),
    ...(location.description?.trim() ? { description: location.description.trim() } : {}),
    ...(location.highlight?.trim() ? { highlight: location.highlight.trim() } : {}),
    ...(location.department ? { department: location.department } : {}),
    ...(location.city?.trim() ? { city: location.city.trim() } : {}),
    ...(location.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : {}),
    pickupEnabled: location.pickupEnabled,
    deliveryEnabled: location.deliveryEnabled,
    openingHours: (location.openingHours || []).map((hours) => ({ day: hours.day, open: hours.open, close: hours.close, closed: hours.closed })),
  }));
}

export function assertValidStoreLocations(locations: StoreLocationDto[]): void {
  for (const location of locations) {
    if (!location.name.trim()) throw new BadRequestException("Escribe un nombre para cada ubicación");
    if (!location.pickupEnabled && !location.deliveryEnabled) {
      throw new BadRequestException(`${location.name.trim()} debe permitir retiro, entrega o ambas opciones`);
    }
    const invalidHours = (location.openingHours || []).find((hours) => !hours.closed && hours.open >= hours.close);
    if (invalidHours) throw new BadRequestException(`La hora de cierre de ${location.name.trim()} debe ser posterior a la apertura`);
  }
}

export function nextStoreLocationOpenAt(location: StoreLocation, now = new Date()): Date | null {
  if (!location.openingHours.length) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[parts.weekday] ?? 0;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const today = location.openingHours.find((entry) => entry.day === weekday);
  if (today && !today.closed && minuteOfDay >= toMinutes(today.open) && minuteOfDay < toMinutes(today.close)) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const hours = location.openingHours.find((entry) => entry.day === (weekday + offset) % 7);
    if (!hours || hours.closed || (offset === 0 && toMinutes(hours.open) <= minuteOfDay)) continue;
    const [hour, minute] = hours.open.split(":").map(Number);
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset, hour + 4, minute));
  }
  return null;
}

export function readStoreLocations(value: Prisma.JsonValue): StoreLocation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StoreLocation =>
    !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>).id === "string" &&
    typeof (entry as Record<string, unknown>).name === "string" &&
    typeof (entry as Record<string, unknown>).pickupEnabled === "boolean" &&
    typeof (entry as Record<string, unknown>).deliveryEnabled === "boolean",
  ).map((entry) => ({ ...entry, openingHours: Array.isArray(entry.openingHours) ? entry.openingHours : [] }));
}

export function readLocationStocks(value: Prisma.JsonValue): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, stock]) => stock === null || (Number.isInteger(stock) && (stock as number) >= 0))) as Record<string, number | null>;
}
