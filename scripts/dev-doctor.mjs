import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read-only health check for the long-running local stack (pnpm dev). It names the ways it has gone stale before:
// an orphaned API holding :3001, a Studio bundle older than its source, unapplied migrations, no recent DB backup,
// and a working tree the live servers read straight from. `--backup` is the only flag that writes, and only to .backups/.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backup = process.argv.includes("--backup");
let problems = 0;
const ok = (line) => console.log(`  ok    ${line}`);
const warn = (line, fix) => { problems += 1; console.log(`  warn  ${line}${fix ? `\n        → ${fix}` : ""}`); };
const info = (line) => console.log(`        ${line}`);

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function run(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

// Newest mtime under a directory, skipping tests and build output.
function newestMtime(dir) {
  let newest = 0, file = "";
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!/\.(spec|test)\.[cm]?[jt]sx?$/.test(entry.name)) {
        const mtime = fs.statSync(full).mtimeMs;
        if (mtime > newest) { newest = mtime; file = full; }
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { mtime: newest, file: path.relative(rootDir, file) };
}

const ago = (ms) => {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  return minutes < 90 ? `${minutes} min ago` : minutes < 60 * 48 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
};

function apiEnv(key) {
  try {
    const line = fs.readFileSync(path.join(rootDir, "apps/api/.env"), "utf8").split("\n").find((entry) => entry.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, "$2") || undefined;
  } catch { return undefined; }
}

console.log("pagosYa dev doctor\n");

// 1. The working tree: the owner's dev servers read it directly, so the branch is what the live app runs.
console.log("Working tree");
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const dirty = run("git", ["status", "--porcelain"]).split("\n").filter(Boolean).length;
const ahead = run("git", ["rev-list", "--count", "@{upstream}..HEAD"]);
info(`branch ${branch}${dirty ? `, ${dirty} uncommitted change(s)` : ", clean"} — the running servers serve this tree`);
if (ahead === "") warn("this branch has no upstream on GitHub", `git push -u origin ${branch}`);
else if (Number(ahead) > 0) warn(`${ahead} commit(s) exist only on this machine`, "git push");
else ok("everything committed here is also on GitHub");

// 2. Ports pnpm dev starts (scripts/dev.mjs).
console.log("\nServers");
for (const [name, port] of [["Postgres", 54329], ["API", 3001], ["checkout", 5175], ["dashboard", 4323]]) {
  if (await portIsOpen(port)) ok(`${name} answering on :${port}`);
  else warn(`${name} not answering on :${port}`, port === 54329 ? "pnpm dev:db" : "pnpm dev");
}

// 3. An API process older than the newest API source is stale: the watcher restarts its child on every change, so a
// survivor from before the last edit is usually an orphan holding the port (old endpoints answer, new ones 404).
const apiPid = run("lsof", ["-tiTCP:3001", "-sTCP:LISTEN"]).split("\n")[0];
if (apiPid) {
  const started = Date.parse(run("ps", ["-o", "lstart=", "-p", apiPid]));
  const command = run("ps", ["-o", "command=", "-p", apiPid]);
  const source = newestMtime(path.join(rootDir, "apps/api/src"));
  info(`:3001 is pid ${apiPid}, started ${Number.isNaN(started) ? "?" : ago(started)}: ${command.slice(0, 90)}`);
  if (!Number.isNaN(started) && source.mtime > started + 5_000) {
    warn(`the API process started before the latest API change (${source.file}, ${ago(source.mtime)})`,
      `check the watcher recompiled; if not, kill ${apiPid} and restart pnpm dev`);
  } else ok("the API process is newer than the API source");
}

// 4. The dashboard serves a pre-built Studio (apps/merchant-dashboard/public/studio), built only at dashboard start.
console.log("\nStudio bundle");
const studioIndex = path.join(rootDir, "apps/merchant-dashboard/public/studio/index.html");
if (!fs.existsSync(studioIndex)) warn("no Studio bundle", "pnpm --filter @pagosya/merchant-dashboard run build:studio");
else {
  const built = fs.statSync(studioIndex).mtimeMs, source = newestMtime(path.join(rootDir, "apps/merchant-studio/src"));
  if (source.mtime > built) warn(`Studio bundle built ${ago(built)} is older than ${source.file} (${ago(source.mtime)})`,
    "pnpm --filter @pagosya/merchant-dashboard run build:studio, then hard-reload (⌘⇧R)");
  else ok(`Studio bundle built ${ago(built)}, newer than its source`);
}

// 5. Database: migrations on disk that the dev DB has not applied, plus a read-only size check. Never migrates.
console.log("\nDatabase");
const databaseUrl = apiEnv("DATABASE_URL");
let prisma;
if (!databaseUrl) warn("no DATABASE_URL in apps/api/.env");
else if (!(await portIsOpen(54329))) info("skipped: Postgres is not running");
else {
  try {
    const { PrismaClient } = createRequire(path.join(rootDir, "apps/api/package.json"))("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const onDisk = fs.readdirSync(path.join(rootDir, "apps/api/prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const applied = new Set((await prisma.$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((row) => row.migration_name));
    const pending = onDisk.filter((name) => !applied.has(name));
    if (pending.length) warn(`${pending.length} migration(s) not applied to the dev DB: ${pending.join(", ")}`,
      "review them, take a backup (--backup), then the owner applies with prisma migrate deploy");
    else ok(`all ${onDisk.length} migrations applied`);
    const [counts] = await prisma.$queryRawUnsafe(`SELECT (SELECT count(*) FROM "Merchant")::int AS merchants, (SELECT count(*) FROM "Store")::int AS stores`);
    info(`${counts.merchants} merchants, ${counts.stores} stores`);
    if (!counts.merchants) warn("the dev DB has no merchants — was it wiped?", "restore from .backups before doing anything else");
  } catch (error) {
    warn(`could not read the dev DB: ${String(error.message).split("\n").find(Boolean)}`);
  }
}

// 6. Backups. The dev DB holds the owner's real test accounts and was wiped once with no usable backup (2026-09-25).
console.log("\nBackups");
const backupDir = path.join(rootDir, ".backups");
const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).map((name) => ({ name, mtime: fs.statSync(path.join(backupDir, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime) : [];
if (!backups.length) warn("no backup in .backups/", "pnpm dev:doctor --backup");
else if (Date.now() - backups[0].mtime > 7 * 86_400_000) warn(`newest backup is ${backups[0].name} (${ago(backups[0].mtime)})`, "pnpm dev:doctor --backup");
else ok(`newest backup ${backups[0].name} (${ago(backups[0].mtime)})`);

if (backup) {
  if (!prisma) warn("cannot back up: the dev DB is not reachable");
  else {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pgDump = spawnSync("pg_dump", ["--version"], { stdio: "ignore" }).status === 0;
    if (pgDump) {
      const target = path.join(backupDir, `pagosya-${stamp}.dump`);
      fs.mkdirSync(backupDir, { recursive: true });
      const result = spawnSync("pg_dump", ["-Fc", "-f", target, databaseUrl.replace(/\?.*$/, "")], { stdio: "inherit" });
      if (result.status === 0) ok(`pg_dump written to ${path.relative(rootDir, target)} (restore: pg_restore --clean -d <url> <file>)`);
      else warn("pg_dump failed");
    } else {
      // No pg_dump here (embedded Postgres ships none): a read-only export of every table as JSON lines, one file each,
      // paged because one query over a table of source snapshots is more than Prisma can hand back as a string.
      const target = path.join(backupDir, `pagosya-${stamp}`);
      fs.mkdirSync(target, { recursive: true });
      const tables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
      let rows = 0;
      const failed = [];
      for (const { table_name: table } of tables) {
        const quoted = `"${table.replace(/"/g, '""')}"`, file = path.join(target, `${table}.jsonl`);
        fs.writeFileSync(file, "");
        try {
          for (let offset = 0, page = 20; ; offset += page) {
            const batch = await prisma.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM (SELECT * FROM ${quoted} ORDER BY ctid LIMIT ${page} OFFSET ${offset}) t`);
            if (!batch.length) break;
            fs.appendFileSync(file, batch.map((entry) => `${entry.row}\n`).join(""));
            rows += batch.length;
          }
        } catch (error) {
          failed.push(`${table} (${String(error.message).trim().split("\n").at(-1)})`);
        }
      }
      ok(`export of ${tables.length - failed.length}/${tables.length} tables (${rows} rows) written to ${path.relative(rootDir, target)}/`);
      if (failed.length) warn(`not exported: ${failed.join(", ")}`, "install pg_dump (brew install libpq) for a complete backup");
      info("pg_dump was not found (brew install libpq) — a pg_dump backup restores in one command; this export needs a script");
    }
  }
}

await prisma?.$disconnect();
console.log(problems ? `\n${problems} thing(s) to look at.` : "\nAll good.");
