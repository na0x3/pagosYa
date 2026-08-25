import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const databasePath = join(exampleDir, "inventory.sqlite");
const schemaPath = join(exampleDir, "schema.sql");

rmSync(databasePath, { force: true });
const result = spawnSync("sqlite3", [databasePath], {
  input: readFileSync(schemaPath, "utf8"),
  encoding: "utf8",
});

if (result.error?.code === "ENOENT") {
  throw new Error("No se encontró sqlite3. Instálalo o ejecuta schema.sql con tu cliente SQLite.");
}
if (result.status !== 0) throw new Error(result.stderr || "No se pudo crear la base de ejemplo");

const preview = spawnSync(
  "sqlite3",
  ["-header", "-column", databasePath, "SELECT sku AS codigo, name AS nombre, stock FROM products ORDER BY sku; SELECT external_subscription_id AS suscripcion, plan_code AS plan, status AS estado, next_billing_at AS proximo_cobro FROM subscriptions ORDER BY external_subscription_id;"],
  { encoding: "utf8" },
);

console.log(`Base creada: ${databasePath}`);
console.log(preview.stdout.trim());
