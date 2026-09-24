import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentIntentStatus, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

/** Helpers shared by the operations services. */
export const DAY_MS = 86_400_000;

export type StockVariant = { id: string; name: string; stock?: number | null; [key: string]: unknown };
export function readStockVariants(value: Prisma.JsonValue): StockVariant[] {
  return Array.isArray(value) ? (value as unknown[]).filter((entry) => !!entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).id === "string") as StockVariant[] : [];
}

export async function ownedStore(prisma: PrismaService, merchantId: string, storeId: string) {
  const store = await prisma.store.findFirst({ where: { id: storeId, merchantId } });
  if (!store) throw new NotFoundException("Store not found");
  return store;
}

export function clean(value?: string | null): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export function paymentCheckoutUrl(config: ConfigService, clientSecret: string): string {
  const origin = (config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").replace(/\/$/, "");
  return `${origin}/#client_secret=${encodeURIComponent(clientSecret)}`;
}

export function subscriptionIdentityKey(storeId: string, planId: string, customer: { id?: string | null; email?: string | null; phone?: string | null; name: string }): string {
  const identity = customer.id?.trim()
    || customer.email?.trim().toLowerCase()
    || customer.phone?.replace(/\D/g, "")
    || customer.name.trim().toLocaleLowerCase("es-BO");
  return createHash("sha256").update(`${storeId}:${planId}:${identity}`).digest("hex");
}

export function subscriptionInvoiceStatus(invoice: { status: string; dueAt: Date }, paymentStatus: PaymentIntentStatus | null, now: Date): string {
  if (invoice.status === "CANCELED" || paymentStatus === PaymentIntentStatus.CANCELED) return "CANCELED";
  if (invoice.status === "PAID" || paymentStatus === PaymentIntentStatus.SUCCEEDED) return "PAID";
  if (paymentStatus === PaymentIntentStatus.FAILED) return "FAILED";
  if (invoice.dueAt > now) return "SCHEDULED";
  if (invoice.dueAt.getTime() + DAY_MS < now.getTime()) return "OVERDUE";
  return "PENDING";
}
