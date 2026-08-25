import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [sku, stockText] = process.argv.slice(2).filter((argument) => argument !== "--");
const stock = Number(stockText);
if (!sku || !/^[A-Za-z0-9._-]{1,64}$/.test(sku)) {
  throw new Error("Uso: pnpm demo:inventory-stock -- CAF-001 17");
}
if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
  throw new Error("La cantidad debe ser un entero entre 0 y 1.000.000");
}

const databasePath = join(dirname(fileURLToPath(import.meta.url)), "inventory.sqlite");
const sql = [
  "BEGIN;",
  `INSERT INTO stock_movements (sku, previous_stock, new_stock, reason) SELECT sku, stock, ${stock}, 'Ajuste de demostración' FROM products WHERE sku = '${sku}';`,
  `UPDATE products SET stock = ${stock}, updated_at = CURRENT_TIMESTAMP WHERE sku = '${sku}';`,
  "SELECT changes();",
  "COMMIT;",
].join(" ");
const result = spawnSync("sqlite3", [databasePath, sql], { encoding: "utf8" });

if (result.error?.code === "ENOENT") throw new Error("No se encontró sqlite3");
if (result.status !== 0) throw new Error(result.stderr || "No se pudo actualizar el stock");
if (!result.stdout.trim().split(/\s+/).includes("1")) throw new Error(`No existe el SKU ${sku} en la base de ejemplo`);
console.log(`${sku} actualizado a ${stock} unidades en ${databasePath}`);
