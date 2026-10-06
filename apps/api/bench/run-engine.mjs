// Drives the current design engine over HTTP for one benchmark store, then writes
// the generated snapshot to disk so it can be served and shot like the Sep-5 output.
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { FOLDERS } from "./folders.mjs";

const cfg = JSON.parse(await readFile(new URL("./stores2.json", import.meta.url), "utf8"));
const KEY = cfg.key;
const API = process.env.API_BASE || "http://127.0.0.1:3001";
const key = process.env.STORE_KEY;
const entry = cfg.stores.find((s) => s.key === key);
const brief = FOLDERS.find((b) => b.key === key);
if (!entry || !brief) throw new Error(`unknown store key: ${key}`);
const OUT = process.env.OUT_DIR || `/Users/saramia/pagosYa-sep5-output/bench2/engine/${key}`;

const call = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text };
};

const started = Date.now();
const since = () => `${Math.round((Date.now() - started) / 1000)}s`;
const instruction = [brief.instruction, `El negocio: ${brief.businessType}.`, `Clientes: ${brief.audience}.`,
  `Lo principal que debe lograr: ${brief.primaryAction}.`, `Dirección visual: ${brief.visualDirection}`].join(" ");

console.log(`[${key}] creating job with ${entry.images.length} selected photo(s)…`);
const created = await call(`/v1/stores/${entry.storeId}/source-project/chat-jobs`, {
  method: "POST",
  body: JSON.stringify({ revision: 0, instruction, setupAction: "generate", sitePurpose: "shop", requestId: randomUUID(), assetUrls: entry.images.map((i) => i.url).slice(0, 24) }),
});
if (created.status >= 300) { console.error("CREATE FAILED", created.status, created.text.slice(0, 600)); process.exit(1); }
const jobId = created.body?.id ?? created.body?.job?.id;
console.log(`[${key}] job ${jobId} status ${created.body?.status ?? "?"}`);

let last = null;
let runningAt = null;
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const got = await call(`/v1/stores/${entry.storeId}/source-project/chat-jobs/${jobId}`);
  const job = got.body;
  const state = job?.status ?? job?.state;
  if (state !== last) { console.log(`[${key}] ${since()} ${state}`); last = state; }
  if (["done", "DONE", "completed", "COMPLETED", "succeeded", "ready"].includes(String(state))) break;
  if (["failed", "FAILED", "error", "ERROR", "cancelled", "CANCELLED"].includes(String(state))) {
    console.error(`[${key}] FAILED`, JSON.stringify(job).slice(0, 800)); process.exit(1);
  }
  if (state === "RUNNING" && !runningAt) runningAt = Date.now();
  const budget = runningAt ? Date.now() - runningAt : 0;
  if (budget > 20 * 60_000 || Date.now() - started > 35 * 60_000) { console.error(`[${key}] timed out waiting; checking for a version anyway`); break; }
}

const prisma = new PrismaClient();
const version = await prisma.storeSourceVersion.findFirst({
  where: { project: { storeId: entry.storeId } }, orderBy: { revision: "desc" },
});
await prisma.$disconnect();
if (!version) { console.error("no version produced"); process.exit(1); }
const files = version.snapshot?.files || [];
for (const f of files) {
  const dest = join(OUT, f.path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, f.encoding === "base64" ? Buffer.from(f.content, "base64") : f.content);
}
console.log(`[${key}] ok in ${since()} | revision ${version.revision} | ${files.length} files -> ${OUT}`);
console.log(`[${key}] authored:`, files.filter((f) => /\.(html|css|js)$/.test(f.path)).map((f) => f.path).join(", "));
