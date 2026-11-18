#!/usr/bin/env node
/**
 * Backup and restore drill (ISO 27001 finding M-10): proves a backup of the database can actually be brought back.
 *
 *   1. pg_dump the source database (custom format, read-only for the source);
 *   2. encrypt the dump with AES-256-GCM (BACKUP_ENCRYPTION_KEY) — the file that would be stored off-site;
 *   3. decrypt it and pg_restore it into a new throwaway database on RESTORE_ADMIN_URL's server;
 *   4. compare the exact row count of every table, and recompute the audit log's hash chain in the copy;
 *   5. drop the throwaway database and print a report (--report <file> also writes it as Markdown).
 *
 *   SOURCE_DATABASE_URL=postgresql://…  RESTORE_ADMIN_URL=postgresql://…/postgres  BACKUP_ENCRYPTION_KEY=…  \
 *     node scripts/backup-restore-check.mjs [--report docs/security/backup-restore-checks/2026-11-18.md]
 *
 * Needs pg_dump, pg_restore and psql (PostgreSQL client tools, same major version as the server or newer); PG_BIN may
 * point at their folder. Never writes to the source database.
 */
import { spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const source = process.env.SOURCE_DATABASE_URL;
const admin = process.env.RESTORE_ADMIN_URL;
const key = process.env.BACKUP_ENCRYPTION_KEY;
const reportArg = process.argv.indexOf("--report");
const reportPath = reportArg > 0 ? process.argv[reportArg + 1] : null;
if (!source || !admin || !key) {
  console.error("Set SOURCE_DATABASE_URL, RESTORE_ADMIN_URL and BACKUP_ENCRYPTION_KEY.");
  process.exit(2);
}
const bin = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name);

function run(name, args, options = {}) {
  const result = spawnSync(bin(name), args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${name} failed: ${(result.stderr || result.stdout).trim().slice(0, 2000)}`);
  return result.stdout;
}
const psql = (url, sql) => run("psql", [url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]).trim();
const withDatabase = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };
const deriveKey = (text) => createHash("sha256").update(text, "utf8").digest();

function encryptFile(input, output) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(key), iv);
  const body = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  writeFileSync(output, Buffer.concat([Buffer.from("PYBK1"), iv, cipher.getAuthTag(), body]));
}
function decryptFile(input, output) {
  const data = readFileSync(input);
  if (data.subarray(0, 5).toString() !== "PYBK1") throw new Error("Not an encrypted pagosYa backup");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(key), data.subarray(5, 17));
  decipher.setAuthTag(data.subarray(17, 33));
  writeFileSync(output, Buffer.concat([decipher.update(data.subarray(33)), decipher.final()]));
}

/** Exact row count of every table in the public schema, as { table: count }. */
function rowCounts(url) {
  const tables = psql(url, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename").split("\n").filter(Boolean);
  if (!tables.length) return {};
  const sql = tables.map((t) => `SELECT '${t.replace(/'/g, "''")}', count(*) FROM public."${t.replace(/"/g, '""')}"`).join(" UNION ALL ");
  return Object.fromEntries(psql(url, sql).split("\n").filter(Boolean).map((line) => { const [t, n] = line.split("|"); return [t, Number(n)]; }));
}

const startedAt = new Date();
const work = mkdtempSync(join(tmpdir(), "pagosya-restore-"));
const restoreDb = `pagosya_restore_check_${startedAt.getTime()}`;
const lines = [];
let ok = false;
try {
  const dump = join(work, "backup.dump");
  const sealed = join(work, "backup.dump.enc");
  const opened = join(work, "restored.dump");

  const t0 = Date.now();
  run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", dump, source]);
  const sourceCounts = rowCounts(source);
  encryptFile(dump, sealed);
  rmSync(dump);
  decryptFile(sealed, opened);
  const dumpSeconds = (Date.now() - t0) / 1000;

  psql(admin, `CREATE DATABASE "${restoreDb}"`);
  const restoreUrl = withDatabase(admin, restoreDb);
  const t1 = Date.now();
  run("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", "--dbname", restoreUrl, opened]);
  const restoreSeconds = (Date.now() - t1) / 1000;
  const restoredCounts = rowCounts(restoreUrl);

  const tables = [...new Set([...Object.keys(sourceCounts), ...Object.keys(restoredCounts)])].sort();
  const mismatched = tables.filter((t) => sourceCounts[t] !== restoredCounts[t]);
  const totalRows = Object.values(sourceCounts).reduce((a, b) => a + b, 0);

  // The audit chain must survive the trip: same entries, every hash recomputes in the copy.
  let chain = "not present";
  if (psql(restoreUrl, "SELECT count(*) FROM pg_proc WHERE proname = 'audit_log_entry_hash'") === "1") {
    const broken = psql(restoreUrl, `SELECT count(*) FROM (SELECT e."hash", e."prevHash", audit_log_entry_hash(e."prevHash", e) AS computed,
      coalesce(lag(e."hash") OVER (ORDER BY e."seq"), 'genesis') AS expected_prev FROM "AuditLogEntry" e) c WHERE c."hash" <> c.computed OR c."prevHash" <> c.expected_prev`);
    const head = psql(restoreUrl, `SELECT coalesce((SELECT "seq" || ' ' || "hash" FROM "AuditLogEntry" ORDER BY "seq" DESC LIMIT 1), 'empty')`);
    chain = broken === "0" ? `intact (head ${head})` : `BROKEN (${broken} entries)`;
  }

  ok = mismatched.length === 0 && !chain.startsWith("BROKEN");
  lines.push(
    `# Backup and restore check — ${startedAt.toISOString()}`,
    "",
    `Result: **${ok ? "PASSED" : "FAILED"}**`,
    "",
    `- Source: ${new URL(source).host}${new URL(source).pathname} (read only)`,
    `- Encrypted backup: ${(statSync(sealed).size / 1024 / 1024).toFixed(1)} MB, AES-256-GCM`,
    `- Dump + encrypt + decrypt: ${dumpSeconds.toFixed(1)} s · restore: ${restoreSeconds.toFixed(1)} s`,
    `- Tables: ${tables.length} · rows: ${totalRows} · tables with a different count: ${mismatched.length}`,
    `- Audit log chain in the restored copy: ${chain}`,
    ...(mismatched.length ? ["", "| Table | Source | Restored |", "|---|---|---|", ...mismatched.map((t) => `| ${t} | ${sourceCounts[t] ?? "—"} | ${restoredCounts[t] ?? "—"} |`)] : []),
  );
} catch (error) {
  lines.push(`# Backup and restore check — ${startedAt.toISOString()}`, "", "Result: **FAILED**", "", "```", String(error.message ?? error), "```");
} finally {
  try { psql(admin, `DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE)`); } catch (error) { lines.push("", `Could not drop ${restoreDb}: ${error.message}`); }
  rmSync(work, { recursive: true, force: true });
}

const report = lines.join("\n") + "\n";
process.stdout.write(report);
if (reportPath) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, report); }
process.exit(ok ? 0 : 1);
