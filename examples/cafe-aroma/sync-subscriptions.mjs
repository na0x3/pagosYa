import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = process.env.PAGOSYA_SUBSCRIPTIONS_ENDPOINT;
const secret = process.env.PAGOSYA_SYNC_SECRET;
if (!endpoint || !secret) {
  throw new Error("Define PAGOSYA_SUBSCRIPTIONS_ENDPOINT y PAGOSYA_SYNC_SECRET antes de sincronizar");
}

const databasePath = join(dirname(fileURLToPath(import.meta.url)), "inventory.sqlite");
const query = `
  SELECT
    s.external_subscription_id AS externalSubscriptionId,
    c.external_customer_id AS externalCustomerId,
    s.plan_code AS externalPlanCode,
    c.name AS customerName,
    c.email AS customerEmail,
    c.phone AS customerPhone,
    s.amount_override_centavos AS amount,
    s.status,
    s.started_at AS startedAt,
    s.next_billing_at AS nextBillingAt,
    s.canceled_at AS canceledAt
  FROM subscriptions s
  JOIN customers c ON c.external_customer_id = s.external_customer_id
  WHERE c.active = 1
  ORDER BY s.external_subscription_id;
`;
const result = spawnSync("sqlite3", ["-json", databasePath, query], { encoding: "utf8" });
if (result.error?.code === "ENOENT") throw new Error("No se encontró sqlite3");
if (result.status !== 0) throw new Error(result.stderr || "No se pudo leer la base de ejemplo");

const items = JSON.parse(result.stdout || "[]").map((item) => ({
  ...item,
  amount: item.amount ?? undefined,
  canceledAt: item.canceledAt ?? undefined,
  startedAt: new Date(`${item.startedAt.replace(" ", "T")}Z`).toISOString(),
  nextBillingAt: new Date(`${item.nextBillingAt.replace(" ", "T")}Z`).toISOString(),
}));
if (!items.length) throw new Error("La base no contiene suscripciones");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-pagosya-sync-secret": secret,
  },
  body: JSON.stringify({ items }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`pagosYa respondió ${response.status}: ${body.message || JSON.stringify(body)}`);

console.log(`Recibidas: ${body.received ?? items.length} · creadas: ${body.created ?? 0} · actualizadas: ${body.updated ?? 0} · omitidas: ${body.skipped?.length ?? 0}`);
console.log(`Cuotas: ${body.billing?.created ?? 0} · enlaces de pago: ${body.billing?.paymentLinksCreated ?? 0} · correos: ${body.billing?.emailsSent ?? 0}`);
for (const charge of body.billing?.charges ?? []) console.log(`Cobro ${charge.invoiceId}: ${charge.checkoutUrl}`);
