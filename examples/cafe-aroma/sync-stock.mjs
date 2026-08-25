import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const endpoint = process.env.PAGOSYA_STOCK_ENDPOINT;
const secret = process.env.PAGOSYA_SYNC_SECRET;
if (!endpoint || !secret) {
  throw new Error("Define PAGOSYA_STOCK_ENDPOINT y PAGOSYA_SYNC_SECRET antes de sincronizar");
}

const databasePath = join(dirname(fileURLToPath(import.meta.url)), "inventory.sqlite");
const query = "SELECT sku AS externalSku, stock FROM products WHERE active = 1 ORDER BY sku;";
const result = spawnSync("sqlite3", ["-json", databasePath, query], { encoding: "utf8" });
if (result.error?.code === "ENOENT") throw new Error("No se encontró sqlite3");
if (result.status !== 0) throw new Error(result.stderr || "No se pudo leer la base de ejemplo");

const items = JSON.parse(result.stdout || "[]");
if (!items.length) throw new Error("La base no contiene productos activos");

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

console.log(`Enviados: ${body.received ?? items.length} · actualizados: ${body.updated ?? 0}`);

